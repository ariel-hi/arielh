"""Validate a staged site, or upload it with --apply after hosting access is ready.

Copy scripts/deploy.example.json to ignored deploy.local.json and supply the
password through its named environment variable, or set keyFile. Trust requires
an existing knownHosts file or an independently verified hostKeySha256 pin.
Dry run is the default. --verify-only checks an existing HTTPS deployment without
SFTP configuration or writes. --apply requires Paramiko, backs up every replaced file
before writing, stages and atomically renames files, then verifies public HTTPS.
The release never contains live analytics credentials or private database/session state.
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import errno
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid


ROOT = Path(__file__).resolve().parents[1]
DENIED_TOP = {'.git', '.release', '.verification', 'scripts', 'node_modules'}
DENIED_NAMES = {'deploy.local.json', 'package.json', 'package-lock.json', 'agents.md', 'readme.md'}


class DeployError(Exception):
    pass


def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            sha.update(block)
    return sha.hexdigest()


def safe_relative(value: object) -> str:
    if not isinstance(value, str) or not value or '\\' in value or '\x00' in value:
        raise DeployError('Manifest contains an unsafe file path.')
    parts = value.split('/')
    if (value.startswith('/') or any(part in {'', '.', '..'} for part in parts)
        or any(ord(character) < 32 for character in value) or any(character in value for character in ':?#')):
        raise DeployError('Manifest contains an unsafe file path.')
    if parts[0].lower() in DENIED_TOP or parts[-1].lower() in DENIED_NAMES:
        raise DeployError('Manifest includes a development or secret file.')
    if parts[0] == '.analytics-private' and value not in {
        '.analytics-private/.htaccess', '.analytics-private/config.example.php',
    }:
        raise DeployError('Manifest must not include private analytics state or credentials.')
    if parts[0] == '.leaderboards-private' and value != '.leaderboards-private/.htaccess':
        raise DeployError('Manifest must not include private leaderboard state.')
    if any(part.startswith('.') and part not in {'.analytics-private', '.leaderboards-private', '.htaccess'} for part in parts):
        raise DeployError('Manifest includes an unexpected hidden file.')
    return value


def validate_release(source: Path, manifest_path: Path) -> list[dict]:
    if not source.is_dir() or source.is_symlink():
        raise DeployError('Staged site directory is missing or unsafe. Run the release packager first.')
    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        raise DeployError('Release manifest is missing or invalid.') from None
    records = manifest.get('files') if isinstance(manifest, dict) else None
    if not isinstance(records, list) or not records:
        raise DeployError('Release manifest has no files.')
    source = source.resolve()
    seen = set()
    files = []
    for record in records:
        if not isinstance(record, dict):
            raise DeployError('Invalid release manifest record.')
        relative = safe_relative(record.get('path'))
        if relative.casefold() in seen:
            raise DeployError('Manifest contains duplicate or case-conflicting paths.')
        seen.add(relative.casefold())
        checksum = record.get('sha256')
        size = record.get('bytes')
        if (not isinstance(checksum, str) or not re.fullmatch('[a-f0-9]{64}', checksum)
            or not isinstance(size, int) or isinstance(size, bool) or size < 0):
            raise DeployError('Manifest contains invalid size or SHA-256 metadata.')
        local = source.joinpath(*relative.split('/'))
        try:
            if (not local.resolve().is_relative_to(source) or not local.is_file()
                or any(parent.is_symlink() for parent in [local, *local.parents] if parent.is_relative_to(source))):
                raise DeployError('A staged file is missing, symlinked, or outside the staged site.')
            if local.stat().st_size != size or digest(local) != checksum:
                raise DeployError('A staged file differs from its manifest. Repackage before deploying.')
        except OSError:
            raise DeployError('A staged file cannot be read.') from None
        files.append({'path': relative, 'sha256': checksum, 'bytes': size, 'local': local})
    # Assets/PHP first, HTML last; private denial rules sort before application files.
    return sorted(files, key=lambda item: (item['path'].lower().endswith('.html'), item['path']))


def load_config(path: Path) -> dict:
    try:
        config = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        raise DeployError('Hosting configuration is missing. Copy scripts/deploy.example.json to ignored deploy.local.json and fill in hosting access.') from None
    if not isinstance(config, dict):
        raise DeployError('Hosting configuration must be an object.')
    if any(key.lower() in {'password', 'passphrase', 'token', 'secret'} for key in config):
        raise DeployError('Use named environment variables for passwords; do not store passwords in JSON.')
    host = config.get('host')
    username = config.get('username')
    port = config.get('port', 22)
    webroot = config.get('webroot')
    if (not isinstance(host, str) or not re.fullmatch('[A-Za-z0-9.-]+', host)
        or host.startswith('.') or host.endswith('.') or '..' in host):
        raise DeployError('SFTP hostname is invalid.')
    if not isinstance(username, str) or not username or len(username) > 128 or any(ord(c) < 33 for c in username):
        raise DeployError('SFTP username is invalid.')
    if not isinstance(port, int) or isinstance(port, bool) or not 1 <= port <= 65535:
        raise DeployError('SFTP port is invalid.')
    if (not isinstance(webroot, str) or not webroot.startswith('/') or '\\' in webroot or '\x00' in webroot
        or any(part in {'.', '..'} for part in webroot.split('/')) or '//' in webroot or any(ord(c) < 32 for c in webroot)):
        raise DeployError('Set an explicit, absolute SFTP site webroot with no parent traversal.')
    webroot = webroot.rstrip('/') or '/'
    if webroot == '/' and config.get('allowRootWebroot') is not True:
        raise DeployError('The root webroot needs allowRootWebroot=true, only for an account restricted to this website.')
    config['webroot'] = webroot
    config['port'] = port
    for key in ['keyFile', 'knownHosts']:
        value = config.get(key)
        if value:
            if not isinstance(value, str):
                raise DeployError('Key and known-host paths must be strings.')
            candidate = Path(value).expanduser()
            if not candidate.is_absolute():
                candidate = path.parent / candidate
            config[key] = candidate.resolve()
    fingerprint = config.get('hostKeySha256')
    if fingerprint:
        if not isinstance(fingerprint, str) or not re.fullmatch(r'SHA256:[A-Za-z0-9+/]{43}=?', fingerprint):
            raise DeployError('Host-key pin must be an OpenSSH SHA256 fingerprint.')
        config['hostKeySha256'] = fingerprint.rstrip('=')
    known = config.get('knownHosts')
    if not fingerprint and (not isinstance(known, Path) or not known.is_file()):
        raise DeployError('Provide a knownHosts file or an independently verified hostKeySha256 pin. Unknown host keys are never accepted silently.')
    if config.get('keyFile'):
        if not config['keyFile'].is_file():
            raise DeployError('SFTP private key file is unavailable.')
    elif not isinstance(config.get('passwordEnv'), str) or not re.fullmatch('[A-Za-z_][A-Za-z0-9_]*', config['passwordEnv']):
        raise DeployError('Set keyFile or passwordEnv for SFTP authentication.')
    for name in ['passwordEnv', 'keyPassphraseEnv']:
        if config.get(name) and (not isinstance(config[name], str) or not re.fullmatch('[A-Za-z_][A-Za-z0-9_]*', config[name])):
            raise DeployError('Credential environment variable names are invalid.')
    return config


def public_base(value: str) -> str:
    parsed = urllib.parse.urlsplit(value)
    if (parsed.scheme != 'https' or parsed.hostname not in {'arielh.com', 'www.arielh.com'}
        or parsed.port not in {None, 443} or parsed.username or parsed.password
        or parsed.path not in {'', '/'} or parsed.query or parsed.fragment):
        raise DeployError('Public verification URL must be https://arielh.com or https://www.arielh.com.')
    return value.rstrip('/')


def connect(config: dict):
    try:
        import paramiko
    except ImportError:
        raise DeployError('Paramiko is required for --apply. Install it with: python -m pip install paramiko') from None
    password = os.environ.get(config.get('passwordEnv', ''))
    if not config.get('keyFile') and not password:
        raise DeployError('The configured SFTP password environment variable is empty.')
    pin = config.get('hostKeySha256')
    client = paramiko.SSHClient()
    known = config.get('knownHosts')
    if isinstance(known, Path) and known.is_file():
        client.load_host_keys(str(known))

    def key_fingerprint(key):
        return 'SHA256:' + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode('ascii').rstrip('=')

    class PinnedHostKey(paramiko.MissingHostKeyPolicy):
        def missing_host_key(self, ssh_client, hostname, key):
            if not pin or key_fingerprint(key) != pin:
                raise DeployError('SFTP host key does not match the independently verified fingerprint.')

    client.set_missing_host_key_policy(PinnedHostKey() if pin else paramiko.RejectPolicy())
    try:
        client.connect(config['host'], port=config['port'], username=config['username'], password=password,
            key_filename=str(config['keyFile']) if config.get('keyFile') else None,
            passphrase=os.environ.get(config.get('keyPassphraseEnv', '')) or None,
            look_for_keys=False, allow_agent=False, timeout=15, auth_timeout=15, banner_timeout=15)
        if pin and key_fingerprint(client.get_transport().get_remote_server_key()) != pin:
            raise DeployError('SFTP host key does not match the configured fingerprint.')
        return client
    except Exception:
        client.close()
        raise DeployError('SFTP connection, authentication, or host-key verification failed. No site files were written.') from None


def optional_stat(sftp, path):
    try:
        return sftp.lstat(path)
    except OSError as error:
        if error.errno == errno.ENOENT:
            return None
        raise


def preflight(sftp, config: dict, files: list[dict]) -> str:
    configured = sftp.lstat(config['webroot'])
    if stat.S_ISLNK(configured.st_mode) or not stat.S_ISDIR(configured.st_mode):
        raise DeployError('Configured webroot must already exist without a symlink.')
    root = sftp.normalize(config['webroot'])
    if (not root.startswith('/') or '..' in PurePosixPath(root).parts or '//' in root
        or (root == '/' and config.get('allowRootWebroot') is not True)):
        raise DeployError('The server resolved the webroot to an unsafe path.')
    info = sftp.lstat(root)
    if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
        raise DeployError('Configured webroot must already exist as a directory.')
    for item in files:
        parts = item['path'].split('/')
        for index in range(1, len(parts)):
            directory = root.rstrip('/') + '/' + '/'.join(parts[:index])
            info = optional_stat(sftp, directory)
            if info and (stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode)):
                raise DeployError('A remote parent directory is symlinked or is not a directory. No files were written.')
        destination = root.rstrip('/') + '/' + item['path']
        info = optional_stat(sftp, destination)
        if info and (stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode)):
            raise DeployError('A remote destination is symlinked or not a regular file. No files were written.')
        item['remote'] = destination
        item['old'] = info
    return root


def backups(sftp, root: str, files: list[dict]) -> Path:
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    folder = ROOT / '.release' / 'backups' / stamp
    if not folder.resolve().is_relative_to(ROOT.resolve()) or any(parent.is_symlink() for parent in folder.parents if parent.is_relative_to(ROOT)):
        raise DeployError('Backup directory is symlinked or outside the workspace.')
    folder.mkdir(parents=True, exist_ok=False)
    records = []
    for item in files:
        if item['old'] is None:
            continue
        target = folder.joinpath(*item['path'].split('/'))
        target.parent.mkdir(parents=True, exist_ok=True)
        sftp.get(item['remote'], str(target))
        if target.stat().st_size != item['old'].st_size:
            raise DeployError('A remote original changed during backup. Deployment stopped before writing.')
        current = sftp.lstat(item['remote'])
        if current.st_mtime != item['old'].st_mtime or current.st_size != item['old'].st_size:
            raise DeployError('A remote original changed during backup. Deployment stopped before writing.')
        records.append({'path': item['path'], 'bytes': target.stat().st_size, 'sha256': digest(target), 'mode': stat.S_IMODE(item['old'].st_mode)})
    (folder / 'backup-manifest.json').write_text(json.dumps({'webroot': root, 'files': records}, indent=2) + '\n', encoding='utf-8')
    return folder


def upload(sftp, root: str, files: list[dict]):
    for item in files:
        current = optional_stat(sftp, item['remote'])
        if item['old'] is not None and (current is None or stat.S_ISLNK(current.st_mode)
            or not stat.S_ISREG(current.st_mode) or current.st_mtime != item['old'].st_mtime or current.st_size != item['old'].st_size):
            raise DeployError('A remote destination changed after backup. Upload stopped.')
        if item['old'] is None and current is not None:
            raise DeployError('A remote destination appeared after backup. Upload stopped.')
        parts = item['path'].split('/')
        for index in range(1, len(parts)):
            directory = root.rstrip('/') + '/' + '/'.join(parts[:index])
            info = optional_stat(sftp, directory)
            if info is None:
                sftp.mkdir(directory, 0o755)
            elif stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
                raise DeployError('A remote parent changed after preflight. Upload stopped.')
        stage = str(PurePosixPath(item['remote']).parent / ('.arielh-stage-' + uuid.uuid4().hex + '.tmp'))
        sftp.put(str(item['local']), stage, confirm=True)
        sftp.chmod(stage, stat.S_IMODE(item['old'].st_mode) if item['old'] else 0o644)
        if item['old'] is None:
            # Standard SFTP rename is atomic and refuses to overwrite a newly appeared file.
            sftp.rename(stage, item['remote'])
        else:
            # No remove-and-replace fallback: replacement must remain atomic.
            sftp.posix_rename(stage, item['remote'])


def verify(base_url: str, files: list[dict], release_id: str) -> dict:
    failures = []
    checked = 0
    analytics = 'not configured'
    targets = []
    paths = {item['path'] for item in files}
    for item in files:
        if item['path'] == 'api/leaderboard.php':
            # This API intentionally accepts only game/limit query parameters.
            for game in ['grid16', 'shooter']:
                targets.append((item['path'], item, {'game': game}))
        else:
            targets.append((item['path'], item, {'release': release_id}))
    for extra in ['.analytics-private/config.php', '.analytics-private/analytics.sqlite', '.leaderboards-private/scores.sqlite']:
        if extra not in paths:
            targets.append((extra, {'path': extra}, {'release': release_id}))
    for path, item, query in targets:
        label = path + ('?game=' + query['game'] if 'game' in query else '')
        url = base_url + '/' + urllib.parse.quote(path, safe='/') + '?' + urllib.parse.urlencode(query)
        request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache', 'Accept-Encoding': 'identity', 'User-Agent': 'ArielH-Deploy-Verification'})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                status, body, headers = response.status, response.read(), response.headers
                final = urllib.parse.urlsplit(response.url)
                if final.scheme != 'https' or final.hostname not in {'arielh.com', 'www.arielh.com'}:
                    failures.append(label)
                    continue
        except urllib.error.HTTPError as error:
            status, body, headers = error.code, error.read(), error.headers
            final = urllib.parse.urlsplit(error.url)
            if final.scheme != 'https' or final.hostname not in {'arielh.com', 'www.arielh.com'}:
                failures.append(label)
                continue
        except (OSError, urllib.error.URLError):
            failures.append(label)
            continue
        checked += 1
        if path == '.analytics-private/config.example.php':
            # This known uploaded file must be forbidden; a missing-file 404
            # cannot demonstrate that actual private contents are protected.
            valid = status == 403
        elif path.startswith(('.analytics-private/', '.leaderboards-private/')) or path.endswith('/.htaccess') or path == '.htaccess' or path == 'analytics/common.php':
            valid = status in {403, 404}
        elif path == 'api/leaderboard.php':
            try:
                scores = json.loads(body)
                valid = (status == 200 and b'<?php' not in body and isinstance(scores, list)
                    and all(isinstance(row, dict) and set(row) == {'name', 'score'}
                        and isinstance(row['name'], str) and isinstance(row['score'], int)
                        and not isinstance(row['score'], bool) and row['score'] >= 0 for row in scores)
                    and headers.get('Content-Type', '').lower().startswith('application/json')
                    and 'no-store' in headers.get('Cache-Control', '').lower())
            except (ValueError, TypeError, UnicodeError):
                valid = False
        elif path == 'analytics/collect.php':
            valid = status == 405
        elif path == 'analytics/dashboard.php':
            valid = status in {200, 503} and b'<?php' not in body
            analytics = 'configured' if status == 200 else 'not configured'
        else:
            valid = status == 200 and hashlib.sha256(body).hexdigest() == item['sha256']
        if not valid:
            failures.append(label)
    return {'checked': checked, 'failedPaths': failures, 'analytics': analytics}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=ROOT / 'deploy.local.json')
    parser.add_argument('--source', type=Path, default=ROOT / '.release/site')
    parser.add_argument('--manifest', type=Path, default=ROOT / '.release/site-manifest.json')
    parser.add_argument('--base-url', default='https://arielh.com')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true', help='Apply the validated upload; omitted means local dry run.')
    mode.add_argument('--verify-only', action='store_true', help='Check an already uploaded release over HTTPS; no SFTP access or writes.')
    args = parser.parse_args()
    backup_folder = None
    applied = False
    try:
        files = validate_release(args.source, args.manifest)
        base_url = public_base(args.base_url)
        if args.verify_only:
            result = verify(base_url, files, digest(args.manifest)[:12])
            print(json.dumps({'applied': False, 'verifiedOnly': True, **result}))
            return 0 if not result['failedPaths'] else 1
        config = load_config(args.config.resolve()) if args.apply or args.config.is_file() else None
        if not args.apply:
            print(json.dumps({'applied': False, 'validatedFiles': len(files), 'bytes': sum(item['bytes'] for item in files), 'htmlLast': True, 'hostingConfigured': config is not None, 'remoteAccessChecked': False}))
            return 0
        client = connect(config)
        try:
            sftp = client.open_sftp()
            try:
                root = preflight(sftp, config, files)
                backup_folder = backups(sftp, root, files)
                # Backup can take time; revalidate every source before the first write.
                for item in files:
                    if item['local'].stat().st_size != item['bytes'] or digest(item['local']) != item['sha256']:
                        raise DeployError('The staged site changed during backup. Repackage before deploying.')
                applied = True  # A following failure can leave some uploaded files live.
                upload(sftp, root, files)
            finally:
                sftp.close()
        finally:
            client.close()
        result = verify(base_url, files, digest(args.manifest)[:12])
        print(json.dumps({'applied': True, 'uploadedFiles': len(files), 'backup': str(backup_folder), **result}))
        return 0 if not result['failedPaths'] else 1
    except DeployError as error:
        print(json.dumps({'error': str(error), 'mayHaveAppliedFiles': applied, 'backup': str(backup_folder) if backup_folder else None}), file=sys.stderr)
        return 1
    except Exception:
        # Do not echo protocol exceptions, credential-bearing objects, or tracebacks.
        print(json.dumps({'error': 'Deployment stopped because a file transfer or server operation failed. No delete or rollback was attempted.', 'mayHaveAppliedFiles': applied, 'backup': str(backup_folder) if backup_folder else None}), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
