"""Offline safety checks for the SFTP deployment helper; no server is contacted."""
import contextlib
import base64
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import stat
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location('arielh_deploy', Path(__file__).with_name('deploy-sftp.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class FakeSFTP:
    def __init__(self):
        self.entries = {'/webroot': (stat.S_IFDIR | 0o755, b'', 10), '/webroot/index.html': (stat.S_IFREG | 0o644, b'old home', 10), '/webroot/site.css': (stat.S_IFREG | 0o644, b'old css', 10)}
        self.operations = []

    def normalize(self, path): return path

    def lstat(self, path):
        if path not in self.entries: raise FileNotFoundError(2, 'not found')
        mode, data, modified = self.entries[path]
        return SimpleNamespace(st_mode=mode, st_size=len(data), st_mtime=modified)

    def get(self, remote, local):
        self.operations.append(('backup', remote))
        Path(local).write_bytes(self.entries[remote][1])

    def mkdir(self, path, mode):
        self.operations.append(('mkdir', path))
        self.entries[path] = (stat.S_IFDIR | mode, b'', 20)

    def put(self, local, remote, confirm):
        self.operations.append(('put', remote))
        self.entries[remote] = (stat.S_IFREG | 0o644, Path(local).read_bytes(), 20)

    def chmod(self, path, mode):
        _, data, modified = self.entries[path]
        self.entries[path] = (stat.S_IFREG | mode, data, modified)

    def rename(self, source, destination):
        if destination in self.entries: raise FileExistsError('Refuse overwrite')
        self.operations.append(('rename', destination))
        self.entries[destination] = self.entries.pop(source)

    def posix_rename(self, source, destination):
        self.operations.append(('atomic-replace', destination))
        self.entries[destination] = self.entries.pop(source)


class DeployTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='arielh-deploy-tests-')
        self.root = Path(self.temporary.name)
        self.source = self.root / '.release/site'
        self.source.mkdir(parents=True)
        for relative, data in {'index.html': b'new home', 'site.css': b'new css', '.analytics-private/.htaccess': b'Require all denied'}.items():
            target = self.source / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        self.manifest = self.root / '.release/site-manifest.json'
        files = [{'path': path.relative_to(self.source).as_posix(), 'sha256': deploy.digest(path), 'bytes': path.stat().st_size} for path in self.source.rglob('*') if path.is_file()]
        self.manifest.write_text(json.dumps({'files': files}))
        self.config = self.root / 'deploy.local.json'
        self.config.write_text(json.dumps({'host': 'access.example.org', 'username': 'user', 'webroot': '/webroot', 'passwordEnv': 'ARIELH_TEST_PASSWORD', 'hostKeySha256': 'SHA256:' + 'A' * 43}))

    def tearDown(self): self.temporary.cleanup()

    def files(self): return deploy.validate_release(self.source, self.manifest)

    def test_paths_and_private_state_rejected(self):
        self.assertEqual(deploy.safe_relative('.leaderboards-private/.htaccess'), '.leaderboards-private/.htaccess')
        for value in ['../outside', '/outside', 'a/../b', 'a//b', 'a\\b', 'scripts/test.py', '.git/config', '.analytics-private/config.php', '.analytics-private/analytics.sqlite', '.analytics-private/sessions/foo', '.leaderboards-private/scores.sqlite', '.leaderboards-private/scores.sqlite-wal', '.leaderboards-private/config.php', '.leaderboards-private/.gitignore', 'a?b', 'a#b']:
            with self.subTest(value=value), self.assertRaises(deploy.DeployError): deploy.safe_relative(value)

    def test_manifest_hash_and_duplicate_checks(self):
        (self.source / 'site.css').write_bytes(b'tampered')
        with self.assertRaises(deploy.DeployError): self.files()
        record = json.loads(self.manifest.read_text())
        record['files'].append(record['files'][0])
        self.manifest.write_text(json.dumps(record))
        with self.assertRaises(deploy.DeployError): self.files()

    def test_config_requires_trust_and_no_inline_password(self):
        config = json.loads(self.config.read_text())
        config.pop('hostKeySha256')
        self.config.write_text(json.dumps(config))
        with self.assertRaises(deploy.DeployError): deploy.load_config(self.config)
        config['hostKeySha256'] = 'SHA256:' + 'A' * 43
        config['password'] = 'forbidden'
        self.config.write_text(json.dumps(config))
        with self.assertRaises(deploy.DeployError): deploy.load_config(self.config)

    def test_remote_symlink_rejected_before_writes(self):
        sftp = FakeSFTP()
        sftp.entries['/webroot/.analytics-private'] = (stat.S_IFLNK | 0o777, b'', 10)
        with self.assertRaises(deploy.DeployError): deploy.preflight(sftp, {'webroot': '/webroot'}, self.files())
        self.assertEqual(sftp.operations, [])

    def test_backups_before_writes_and_html_last(self):
        files = self.files()
        sftp = FakeSFTP()
        root = deploy.preflight(sftp, {'webroot': '/webroot'}, files)
        with mock.patch.object(deploy, 'ROOT', self.root): folder = deploy.backups(sftp, root, files)
        self.assertEqual((folder / 'index.html').read_bytes(), b'old home')
        self.assertEqual((folder / 'site.css').read_bytes(), b'old css')
        self.assertTrue(all(operation[0] == 'backup' for operation in sftp.operations))
        deploy.upload(sftp, root, files)
        replacements = [path for kind, path in sftp.operations if kind in {'rename', 'atomic-replace'}]
        self.assertEqual(replacements[-1], '/webroot/index.html')
        self.assertEqual(sftp.entries['/webroot/index.html'][1], b'new home')
        self.assertTrue((folder / 'backup-manifest.json').is_file())

    def test_remote_change_after_backup_is_not_overwritten(self):
        files = self.files()
        sftp = FakeSFTP()
        root = deploy.preflight(sftp, {'webroot': '/webroot'}, files)
        sftp.entries['/webroot/site.css'] = (stat.S_IFREG | 0o644, b'edited elsewhere', 99)
        with self.assertRaises(deploy.DeployError): deploy.upload(sftp, root, files)
        self.assertEqual(sftp.entries['/webroot/site.css'][1], b'edited elsewhere')

    def test_atomic_replace_has_no_delete_fallback(self):
        files = [item for item in self.files() if item['path'] == 'site.css']
        sftp = FakeSFTP()
        root = deploy.preflight(sftp, {'webroot': '/webroot'}, files)
        with mock.patch.object(sftp, 'posix_rename', side_effect=OSError('unsupported')):
            with self.assertRaises(OSError): deploy.upload(sftp, root, files)
        self.assertEqual(sftp.entries['/webroot/site.css'][1], b'old css')
        self.assertFalse(hasattr(sftp, 'remove'))

    def test_dry_run_does_not_connect(self):
        args = ['deploy-sftp.py', '--config', str(self.config), '--source', str(self.source), '--manifest', str(self.manifest)]
        with mock.patch.object(sys, 'argv', args), mock.patch.object(deploy, 'connect', side_effect=AssertionError('must not connect')), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(deploy.main(), 0)
        self.assertFalse(json.loads(output.getvalue())['applied'])

    def test_missing_hosting_config_allows_local_dry_run(self):
        self.config.unlink()
        args = ['deploy-sftp.py', '--config', str(self.config), '--source', str(self.source), '--manifest', str(self.manifest)]
        with mock.patch.object(sys, 'argv', args), mock.patch.object(deploy, 'connect', side_effect=AssertionError('must not connect')), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(deploy.main(), 0)
        result = json.loads(output.getvalue())
        self.assertEqual(result['validatedFiles'], 3)
        self.assertFalse(result['hostingConfigured'])
        self.assertFalse(result['remoteAccessChecked'])
        with mock.patch.object(sys, 'argv', args + ['--apply']), contextlib.redirect_stderr(io.StringIO()) as output:
            self.assertEqual(deploy.main(), 1)
        self.assertIn('Hosting configuration is missing', json.loads(output.getvalue())['error'])

    def test_verify_only_needs_no_hosting_config_and_does_not_upload(self):
        self.config.unlink()
        args = ['deploy-sftp.py', '--config', str(self.config), '--source', str(self.source), '--manifest', str(self.manifest), '--verify-only']
        verification = {'checked': 6, 'failedPaths': [], 'analytics': 'not configured'}
        with mock.patch.object(sys, 'argv', args), mock.patch.object(deploy, 'connect', side_effect=AssertionError('must not connect')), mock.patch.object(deploy, 'load_config', side_effect=AssertionError('must not load hosting credentials')), mock.patch.object(deploy, 'verify', return_value=verification) as check, contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(deploy.main(), 0)
        result = json.loads(output.getvalue())
        self.assertFalse(result['applied'])
        self.assertTrue(result['verifiedOnly'])
        self.assertEqual(result['analytics'], 'not configured')
        check.assert_called_once()

    def test_verify_only_reports_a_failed_live_check(self):
        args = ['deploy-sftp.py', '--source', str(self.source), '--manifest', str(self.manifest), '--verify-only']
        with mock.patch.object(sys, 'argv', args), mock.patch.object(deploy, 'verify', return_value={'checked': 6, 'failedPaths': ['site.css'], 'analytics': 'not configured'}), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(deploy.main(), 1)
        self.assertEqual(json.loads(output.getvalue())['failedPaths'], ['site.css'])

    def test_dynamic_leaderboard_verification_and_real_private_denial(self):
        import urllib.error
        import urllib.parse
        files = [
            {'path': 'api/leaderboard.php', 'sha256': '0' * 64, 'bytes': 42},
            {'path': '.analytics-private/config.example.php', 'sha256': '0' * 64, 'bytes': 42},
        ]
        requests = []
        def response(request, **kwargs):
            parsed = urllib.parse.urlsplit(request.full_url)
            requests.append(parsed)
            if parsed.path == '/api/leaderboard.php':
                self.assertEqual(set(urllib.parse.parse_qs(parsed.query)), {'game'})
                return contextlib.nullcontext(SimpleNamespace(status=200, read=lambda: b'[{"name":"TEST","score":12}]', headers={'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private'}, url=request.full_url))
            status = 403 if parsed.path.endswith('config.example.php') else 404
            raise urllib.error.HTTPError(request.full_url, status, 'blocked', {}, io.BytesIO(b''))
        with mock.patch.object(deploy.urllib.request, 'urlopen', side_effect=response):
            result = deploy.verify('https://arielh.com', files, 'fixture')
        self.assertEqual(result['failedPaths'], [])
        self.assertEqual({urllib.parse.parse_qs(url.query)['game'][0] for url in requests if url.path == '/api/leaderboard.php'}, {'grid16', 'shooter'})

        def missing_template(request, **kwargs):
            raise urllib.error.HTTPError(request.full_url, 404, 'missing', {}, io.BytesIO(b''))
        with mock.patch.object(deploy.urllib.request, 'urlopen', side_effect=missing_template):
            result = deploy.verify('https://arielh.com', files[1:], 'fixture')
        self.assertIn('.analytics-private/config.example.php', result['failedPaths'])

    def test_leaderboard_requires_no_store_and_executed_json(self):
        files = [{'path': 'api/leaderboard.php', 'sha256': '0' * 64, 'bytes': 42}]
        def cached_response(request, **kwargs):
            if '/api/' in request.full_url:
                return contextlib.nullcontext(SimpleNamespace(status=200, read=lambda: b'[]', headers={'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600'}, url=request.full_url))
            raise deploy.urllib.error.HTTPError(request.full_url, 403, 'blocked', {}, io.BytesIO(b''))
        with mock.patch.object(deploy.urllib.request, 'urlopen', side_effect=cached_response):
            result = deploy.verify('https://arielh.com', files, 'fixture')
        self.assertEqual(result['failedPaths'], ['api/leaderboard.php?game=grid16', 'api/leaderboard.php?game=shooter'])

    def test_public_url_requires_normal_https_domain(self):
        for url in ['http://arielh.com', 'https://evil.example', 'https://arielh.com/path', 'https://user:secret@arielh.com', 'https://arielh.com/?token=secret']:
            with self.subTest(url=url), self.assertRaises(deploy.DeployError): deploy.public_base(url)

    def test_explicit_host_key_pin_is_checked(self):
        key = SimpleNamespace(asbytes=lambda: b'offline-test-server-key')
        class Policy: pass
        class FakeClient:
            def __init__(self): self.closed = False
            def set_missing_host_key_policy(self, policy): self.policy = policy
            def connect(self, host, **kwargs): self.policy.missing_host_key(self, host, key)
            def get_transport(self): return SimpleNamespace(get_remote_server_key=lambda: key)
            def close(self): self.closed = True
        fake_paramiko = SimpleNamespace(SSHClient=FakeClient, MissingHostKeyPolicy=Policy, RejectPolicy=Policy)
        config = deploy.load_config(self.config)
        config['hostKeySha256'] = 'SHA256:' + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip('=')
        with mock.patch.dict(sys.modules, {'paramiko': fake_paramiko}), mock.patch.dict(deploy.os.environ, {'ARIELH_TEST_PASSWORD': 'ephemeral-test-only'}):
            client = deploy.connect(config)
            self.assertFalse(client.closed)
            config['hostKeySha256'] = 'SHA256:' + 'A' * 43
            with self.assertRaises(deploy.DeployError) as error: deploy.connect(config)
            self.assertNotIn('ephemeral-test-only', str(error.exception))

    def test_missing_paramiko_has_concrete_blocker(self):
        with mock.patch.dict(sys.modules, {'paramiko': None}), self.assertRaises(deploy.DeployError) as error:
            deploy.connect(deploy.load_config(self.config))
        self.assertIn('python -m pip install paramiko', str(error.exception))


if __name__ == '__main__': unittest.main(verbosity=2)
