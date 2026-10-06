"""Build an explicit upload package; never include credentials or local tooling."""
from pathlib import Path
import hashlib
import json
import shutil
import stat
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RELEASE = ROOT / '.release'
STAGE = RELEASE / 'site'
subprocess.run(['node', str(ROOT / 'scripts/build-pages.js')], cwd=ROOT, check=True)
subprocess.run(['python', str(ROOT / 'scripts/check-site.py')], cwd=ROOT, check=True)
names = set()
for suffix in ('*.html', '*.css', '*.js', '*.svg'):
    names.update(p.name for p in ROOT.glob(suffix) if p.name != 'projects-data.js')
names.update(['.htaccess', 'robots.txt', 'sitemap.xml'])
names.update(p.name for p in ROOT.glob('*.txt') if len(p.stem) == 32)  # IndexNow key
for directory, suffixes in {
    'images': ('*.webp', 'social-card.png'),
    'grid16': ('index.html', 'style.css', 'manifest.json', 'icon.svg', 'js/*.js'),
    'shooter_game': ('index.html', 'shooter_game.js', '*.mp3', '*.wav'),
    'analytics': ('*.php', 'analytics.js', '.htaccess'),
    'api': ('leaderboard.php',),
    '.analytics-private': ('.htaccess', 'config.example.php'),
    '.leaderboards-private': ('.htaccess',),
}.items():
    for suffix in suffixes:
        names.update(p.relative_to(ROOT).as_posix() for p in (ROOT / directory).glob(suffix) if p.is_file())
files = []
for name in sorted(names):
    source = (ROOT / name).resolve()
    assert source.is_relative_to(ROOT) and source.is_file(), f'Unsafe release path: {name}'
    target = STAGE / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    payload = source.read_bytes()
    files.append({'path': name, 'sha256': hashlib.sha256(payload).hexdigest(), 'bytes': len(payload)})
manifest = {'site': 'https://arielh.com', 'files': files}
RELEASE.mkdir(exist_ok=True)
(RELEASE / 'site-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
with zipfile.ZipFile(RELEASE / 'arielh-release.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for item in files:
        source = STAGE / item['path']
        info = zipfile.ZipInfo.from_file(source, arcname=item['path'])
        # Windows ZIP defaults become world-writable when Explorer extracts
        # them on Linux. Encode a Unix regular file with deliberate permissions.
        info.create_system = 3
        info.external_attr = (stat.S_IFREG | 0o644) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, source.read_bytes())
print(f'Ready: {len(files)} files, {sum(f["bytes"] for f in files) / 1024 / 1024:.1f} MB; credentials, source maps, originals and development pages excluded.')
