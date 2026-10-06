"""Package only verified release files changed since the last live manifest."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import stat
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def write_archive(archive_path, payloads):
    with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, payload in payloads:
            info = zipfile.ZipInfo.from_file(ROOT / '.release/site' / name, arcname=name)
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, payload)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True, type=Path)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--split-phases', action='store_true',
                        help='Also create assets-first and child-HTML-first archives for separate extraction.')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9-]+', args.tag):
        parser.error('The release tag must contain only lowercase letters, digits and hyphens.')

    baseline = json.loads(args.baseline.read_text(encoding='utf-8'))
    release = json.loads((ROOT / '.release/site-manifest.json').read_text(encoding='utf-8'))
    previous = {item['path']: item for item in baseline['files']}
    current = {item['path']: item for item in release['files']}
    removed = sorted(previous.keys() - current.keys())
    if removed:
        parser.error('Incremental upload cannot remove live files: ' + ', '.join(removed))
    changed = [item for name, item in current.items()
               if previous.get(name, {}).get('sha256') != item['sha256']]
    if not changed:
        print('No live files need updating.')
        return

    payloads = []
    for item in changed:
        name = item['path']
        source = (ROOT / '.release/site' / name).resolve()
        if not source.is_relative_to((ROOT / '.release/site').resolve()):
            raise ValueError('Unsafe release path: ' + name)
        payload = source.read_bytes()
        if hashlib.sha256(payload).hexdigest() != item['sha256']:
            raise ValueError('Staged file differs from the verified manifest: ' + name)
        payloads.append((name, payload))

    archive_path = ROOT / '.release' / f'.arielh-update-{args.tag}.zip'
    write_archive(archive_path, payloads)
    metadata = {'files': changed, 'applied': False}
    result = {'archive': str(archive_path), 'bytes': archive_path.stat().st_size,
              'files': [item['path'] for item in changed]}
    if args.split_phases:
        phases = []
        for phase_name, html in [('assets', False), ('html', True)]:
            records = [item for item in changed if item['path'].lower().endswith('.html') == html]
            # Nested iframe pages precede the outer pages that reference them.
            records.sort(key=lambda item: (-item['path'].count('/') if html else 0, item['path']))
            if not records:
                continue
            phase_path = ROOT / '.release' / f'.arielh-update-{args.tag}-{phase_name}.zip'
            phase_names = {item['path'] for item in records}
            ordered = {name: payload for name, payload in payloads if name in phase_names}
            write_archive(phase_path, [(item['path'], ordered[item['path']]) for item in records])
            phase_payload = phase_path.read_bytes()
            phases.append({'name': phase_name, 'archive': phase_path.name,
                           'bytes': len(phase_payload), 'sha256': hashlib.sha256(phase_payload).hexdigest(),
                           'files': records})
        metadata['phases'] = phases
        result['phases'] = phases
    verification = ROOT / '.verification'
    verification.mkdir(exist_ok=True)
    (verification / f'pending-release-{args.tag}.json').write_text(
        json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
