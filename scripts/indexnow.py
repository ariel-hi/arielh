"""Notify IndexNow search engines (Bing, Yandex, Seznam, Naver) that sitemap URLs changed.

Run after a deploy:  python scripts/indexnow.py
The key file at the site root proves ownership; it must be deployed first.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOST = 'arielh.com'
KEY = '285168f937228fe7b3570e8a73d0dd4c'


def main() -> int:
    if (ROOT / f'{KEY}.txt').read_text().strip() != KEY:
        print('IndexNow key file is missing or wrong.', file=sys.stderr)
        return 1
    urls = re.findall(r'<loc>(https://arielh\.com/[^<]*)</loc>', (ROOT / 'sitemap.xml').read_text(encoding='utf-8'))
    body = json.dumps({'host': HOST, 'key': KEY, 'keyLocation': f'https://{HOST}/{KEY}.txt', 'urlList': urls}).encode()
    request = urllib.request.Request('https://api.indexnow.org/indexnow', data=body,
                                     headers={'Content-Type': 'application/json; charset=utf-8'})
    with urllib.request.urlopen(request, timeout=20) as response:
        print(f'IndexNow accepted {len(urls)} URLs (HTTP {response.status}).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
