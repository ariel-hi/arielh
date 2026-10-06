"""Offline CLI fixtures for incremental packaging; every artifact stays in a temporary root."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
import zipfile

TOOL = Path(__file__).with_name('package-update.py')


def record(name, payload):
    return {'path': name, 'sha256': hashlib.sha256(payload).hexdigest(), 'bytes': len(payload)}


class PackageUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='arielh-package-update-tests-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        scripts = self.root / 'scripts'
        scripts.mkdir()
        self.tool = scripts / TOOL.name
        shutil.copyfile(TOOL, self.tool)
        self.stage = self.root / '.release/site'
        self.stage.mkdir(parents=True)
        self.baseline = self.root / 'baseline.json'
        self.retained = self.root / '.release/.retained-release.zip'
        self.retained.write_bytes(b'retained archive must not change')
        self.payloads = {}
        self.changed = []

    def release(self, payloads, unchanged=()):
        self.payloads = payloads
        current, previous = [], []
        for name, payload in payloads.items():
            target = self.stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(payload)
            # Stable source timestamps let ordering changes be checked as actual ZIP bytes.
            os.utime(target, (1590000000, 1590000000))
            current.append(record(name, payload))
            previous.append(record(name, payload if name in unchanged else b'old:' + payload))
        self.changed = [item for item in current if item['path'] not in unchanged]
        self.baseline.write_text(json.dumps({'files': previous}), encoding='utf-8')
        (self.root / '.release/site-manifest.json').write_text(json.dumps({'files': current}), encoding='utf-8')

    def run_tool(self, split=False, tag='fixture'):
        args = [sys.executable, str(self.tool), '--baseline', str(self.baseline), '--tag', tag]
        if split:
            args.append('--split-phases')
        result = subprocess.run(args, cwd=self.root, capture_output=True, text=True)
        self.assertEqual(self.retained.read_bytes(), b'retained archive must not change')
        return result

    def pending(self, tag='fixture'):
        return json.loads((self.root / f'.verification/pending-release-{tag}.json').read_text(encoding='utf-8'))

    def check_archive(self, archive, records):
        expected = [item['path'] for item in records]
        with zipfile.ZipFile(archive) as packaged:
            self.assertEqual(packaged.namelist(), expected)
            for item in records:
                info = packaged.getinfo(item['path'])
                self.assertEqual(info.create_system, 3)
                self.assertTrue(stat.S_ISREG(info.external_attr >> 16))
                self.assertEqual(stat.S_IMODE(info.external_attr >> 16), 0o644)
                payload = packaged.read(item['path'])
                self.assertEqual(payload, self.payloads[item['path']])
                self.assertEqual(hashlib.sha256(payload).hexdigest(), item['sha256'])
                self.assertEqual(len(payload), item['bytes'])

    def check_phase(self, phase):
        archive = self.root / '.release' / phase['archive']
        self.assertEqual(phase['bytes'], archive.stat().st_size)
        self.assertEqual(phase['sha256'], hashlib.sha256(archive.read_bytes()).hexdigest())
        self.check_archive(archive, phase['files'])
        return archive

    def test_default_preserves_full_archive_order_and_pending_contract(self):
        self.release({'shooter.html': b'page', 'shooter_game/index.html': b'iframe',
                      'shooter_game/shooter_game.js': b'game', 'unchanged.js': b'same'}, unchanged={'unchanged.js'})
        result = self.run_tool()
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(set(output), {'archive', 'bytes', 'files'})
        self.assertEqual(output['files'], [item['path'] for item in self.changed])
        self.assertEqual(self.pending(), {'files': self.changed, 'applied': False})
        self.check_archive(Path(output['archive']), self.changed)
        self.assertEqual(len(list((self.root / '.release').glob('.arielh-update-*.zip'))), 1)

    def test_split_has_exact_delta_assets_then_child_html_and_verifiable_metadata(self):
        self.release({'shooter.html': b'outer', 'shooter_game/index.html': b'iframe',
                      'z.css': b'css', 'embedded/deeper/index.html': b'deep',
                      'shooter_game/shooter_game.js': b'game', 'index.html': b'home',
                      '.htaccess': b'headers', 'api/leaderboard.php': b'php',
                      'unchanged.js': b'same'}, unchanged={'unchanged.js'})
        result = self.run_tool(split=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        pending = self.pending()
        self.assertEqual(pending['files'], self.changed)
        self.assertIs(pending['applied'], False)
        self.assertEqual(output['phases'], pending['phases'])
        self.assertEqual([phase['name'] for phase in pending['phases']], ['assets', 'html'])
        assets, html = pending['phases']
        self.assertEqual([item['path'] for item in assets['files']],
                         ['.htaccess', 'api/leaderboard.php', 'shooter_game/shooter_game.js', 'z.css'])
        self.assertEqual([item['path'] for item in html['files']],
                         ['embedded/deeper/index.html', 'shooter_game/index.html', 'index.html', 'shooter.html'])
        for phase in pending['phases']:
            self.check_phase(phase)
        self.check_archive(Path(output['archive']), self.changed)
        combined = [item['path'] for phase in pending['phases'] for item in phase['files']]
        self.assertEqual(set(combined), {item['path'] for item in self.changed})
        self.assertEqual(len(combined), len(self.changed))

    def test_phase_order_and_archive_hashes_do_not_depend_on_manifest_order(self):
        self.release({'outer.html': b'outer', 'nested/frame.HTML': b'iframe',
                      'z.js': b'z', 'a.css': b'a'})
        first = self.run_tool(split=True, tag='first')
        self.assertEqual(first.returncode, 0, first.stderr)
        manifest_path = self.root / '.release/site-manifest.json'
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        manifest['files'].reverse()
        manifest_path.write_text(json.dumps(manifest), encoding='utf-8')
        second = self.run_tool(split=True, tag='second')
        self.assertEqual(second.returncode, 0, second.stderr)
        for previous, current in zip(self.pending('first')['phases'], self.pending('second')['phases']):
            self.assertEqual(previous['files'], current['files'])
            self.assertEqual(previous['sha256'], current['sha256'])
            self.check_phase(current)
        self.assertEqual(len(list((self.root / '.release').glob('.arielh-update-*.zip'))), 6)

    def test_assets_only_omits_empty_html_archive(self):
        self.release({'bundle.js': b'game', 'theme.css': b'css'})
        result = self.run_tool(split=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        phases = self.pending()['phases']
        self.assertEqual([phase['name'] for phase in phases], ['assets'])
        self.check_phase(phases[0])
        self.assertFalse((self.root / '.release/.arielh-update-fixture-html.zip').exists())

    def test_html_only_omits_empty_assets_archive(self):
        self.release({'outer.html': b'page', 'nested/index.html': b'iframe'})
        result = self.run_tool(split=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        phases = self.pending()['phases']
        self.assertEqual([phase['name'] for phase in phases], ['html'])
        self.check_phase(phases[0])
        self.assertFalse((self.root / '.release/.arielh-update-fixture-assets.zip').exists())

    def test_no_delta_creates_no_archive_or_pending_record(self):
        self.release({'index.html': b'same', 'bundle.js': b'same'}, unchanged={'index.html', 'bundle.js'})
        result = self.run_tool(split=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('No live files need updating.', result.stdout)
        self.assertFalse(list((self.root / '.release').glob('.arielh-update-*.zip')))
        self.assertFalse((self.root / '.verification').exists())

    def test_corrupt_staged_delta_fails_before_any_archive_is_written(self):
        self.release({'index.html': b'page', 'bundle.js': b'expected'})
        (self.stage / 'bundle.js').write_bytes(b'corrupted')
        result = self.run_tool(split=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Staged file differs', result.stderr)
        self.assertFalse(list((self.root / '.release').glob('.arielh-update-*.zip')))
        self.assertFalse((self.root / '.verification').exists())

    def test_removed_live_file_still_refuses_incremental_package(self):
        self.release({'index.html': b'page'})
        baseline = json.loads(self.baseline.read_text(encoding='utf-8'))
        baseline['files'].append(record('removed.js', b'old'))
        self.baseline.write_text(json.dumps(baseline), encoding='utf-8')
        result = self.run_tool(split=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('cannot remove live files', result.stderr)
        self.assertFalse(list((self.root / '.release').glob('.arielh-update-*.zip')))


if __name__ == '__main__':
    unittest.main(verbosity=2)
