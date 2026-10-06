"""Check production HTML, local links/assets, project data, and JS syntax."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PAGES = ['index.html', 'projects.html', 'about.html', 'privacy.html', '404.html',
         'rufus.html', 'horizon.html', 'nebula.html', 'kinetic.html', 'shooter.html',
         'grid16/index.html', 'shooter_game/index.html']
errors = []

class Document(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []
        self.ids = []
        self.h1 = 0
        self.description = False
        self.canonical = False
        self.viewport = ''
        self.title = False
        self.scripts = []
        self.current_script = None
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        if tag == 'h1': self.h1 += 1
        if tag == 'title': self.title = True
        if tag == 'script':
            self.current_script = None if attrs.get('src') else [attrs.get('type', ''), '']
        if tag == 'meta' and attrs.get('name') == 'description': self.description = bool(attrs.get('content'))
        if tag == 'meta' and attrs.get('name') == 'viewport': self.viewport = attrs.get('content', '')
        if tag == 'link' and attrs.get('rel') == 'canonical': self.canonical = True
        for key in ('href', 'src'):
            if attrs.get(key): self.refs.append(attrs[key])
        if tag == 'img' and 'alt' not in attrs: errors.append('Image is missing alt text')
    def handle_data(self, data):
        if self.current_script is not None: self.current_script[1] += data
    def handle_endtag(self, tag):
        if tag == 'script' and self.current_script is not None:
            self.scripts.append(self.current_script)
            self.current_script = None

node = shutil.which('node')
assert node, 'Node is needed to validate JavaScript.'
inline_scripts = 0

for name in PAGES:
    source = ROOT / name
    if not source.is_file(): errors.append(f'Missing page: {name}'); continue
    document = Document()
    document.feed(source.read_text(encoding='utf-8-sig'))
    if not document.title: errors.append(f'{name}: missing title')
    if 'width=device-width' not in document.viewport: errors.append(f'{name}: missing responsive viewport')
    if name != 'shooter_game/index.html' and not document.description: errors.append(f'{name}: missing description')
    if name != 'shooter_game/index.html' and not document.canonical: errors.append(f'{name}: missing canonical')
    if len(document.ids) != len(set(document.ids)): errors.append(f'{name}: duplicate element IDs')
    for script_type, code in document.scripts:
        if script_type == 'application/ld+json':
            try: json.loads(code)
            except ValueError: errors.append(f'{name}: invalid structured metadata')
        elif script_type in ('', 'module', 'text/javascript', 'application/javascript') and code.strip():
            syntax_type = 'module' if script_type == 'module' else 'commonjs'
            result = subprocess.run([node, '--check', f'--input-type={syntax_type}'], input=code, capture_output=True, text=True)
            if result.returncode: errors.append(f'{name}: {result.stderr.strip()}')
            inline_scripts += 1
    for reference in document.refs:
        parts = urlsplit(reference)
        if parts.scheme or parts.netloc or not parts.path:
            if not parts.path and parts.fragment and parts.fragment not in document.ids:
                errors.append(f'{name}: missing fragment {reference}')
            continue
        target = ROOT / unquote(parts.path).lstrip('/') if parts.path.startswith('/') else source.parent / unquote(parts.path)
        target = target.resolve()
        if not target.is_relative_to(ROOT): errors.append(f'{name}: local reference leaves site: {reference}')
        if target.is_dir(): target = target / 'index.html'
        if not target.exists(): errors.append(f'{name}: missing local reference {reference}')

js_files = list(ROOT.glob('*.js')) + list((ROOT / 'analytics').glob('*.js')) + list((ROOT / 'grid16/js').glob('*.js')) + [ROOT / 'shooter_game/shooter_game.js']
for source in js_files:
    result = subprocess.run([node, '--check', str(source)], capture_output=True, text=True)
    if result.returncode: errors.append(result.stderr.strip())

projects = json.loads(subprocess.check_output([node, '-e', "const fs=require('fs'),vm=require('vm'),ctx={window:{}};vm.runInNewContext(fs.readFileSync('projects-data.js','utf8'),ctx);process.stdout.write(JSON.stringify(ctx.window.ARIEL_PROJECTS));"], cwd=ROOT, text=True))
assert len(projects) == len({p['id'] for p in projects}), 'Duplicate project IDs'
assert all(p['category'] in ('games', 'tools', 'experiments') for p in projects), 'Unknown category'
projects_html = (ROOT / 'projects.html').read_text(encoding='utf-8')
for project in projects:
    if f'data-project="{project["id"]}"' not in projects_html: errors.append(f'Project missing from generated directory: {project["id"]}')

manifest = json.loads((ROOT / 'grid16/manifest.json').read_text())
if manifest['start_url'] != './' or manifest.get('scope') != './': errors.append('Grid16 app must launch inside its own directory')
ET.parse(ROOT / 'sitemap.xml')
if errors:
    raise SystemExit('\n'.join(errors))
print(f'PASS: {len(PAGES)} production pages, local assets/links, {len(projects)} projects, {len(js_files)} JS files + {inline_scripts} inline scripts, sitemap and app scope.')
