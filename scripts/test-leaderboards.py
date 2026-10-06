"""Test the score API in a disposable copy; never write to the live site.

Usage: python scripts/test-leaderboards.py --php /path/to/php --extension-dir /path/to/php/ext
Apache's private-directory denial must also be verified on the deployed host.
"""
from __future__ import annotations

import argparse
import contextlib
import http.client
import json
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--php', default=shutil.which('php'))
    parser.add_argument('--extension-dir')
    args = parser.parse_args()
    if not args.php:
        raise SystemExit('Provide a PHP runtime with PDO SQLite.')
    php_path = str(Path(args.php).resolve())
    php = [php_path, '-d', 'display_errors=0', '-d', 'log_errors=0']
    if args.extension_dir:
        php += ['-n', '-d', f'extension_dir={Path(args.extension_dir).resolve()}', '-d', 'extension=pdo_sqlite']
    subprocess.run(php + ['-l', str(ROOT / 'api/leaderboard.php')], check=True, capture_output=True)
    assert 'sqlite' in subprocess.check_output(php + ['-r', 'echo implode(",", PDO::getAvailableDrivers());'], text=True)
    checks = 0

    with tempfile.TemporaryDirectory(prefix='arielh-leaderboard-tests-') as temporary:
        test_root = Path(temporary)
        shutil.copytree(ROOT / 'api', test_root / 'api')
        # Freeze the disposable server's clock so rate-limit checks cannot cross a minute boundary.
        test_now = int(time.time())
        copied_api = test_root / 'api/leaderboard.php'
        copied_api.write_text(copied_api.read_text(encoding='utf-8').replace('time()', 'LB_TEST_NOW'), encoding='utf-8')
        private = test_root / '.leaderboards-private'
        private.mkdir()
        shutil.copy2(ROOT / '.leaderboards-private/.htaccess', private / '.htaccess')
        router = test_root / 'router.php'
        router.write_text(f"<?php define('LB_TEST_NOW', {test_now}); $_SERVER['HTTPS'] = $_SERVER['HTTP_X_TEST_HTTPS'] ?? 'on'; return false;", encoding='utf-8')
        with contextlib.closing(socket.socket()) as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        process = subprocess.Popen(
            php + ['-S', f'127.0.0.1:{port}', '-t', str(test_root), str(router)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
        )

        def request(path='/api/leaderboard.php?game=grid16', *, method='GET', body=None, extra=None):
            headers = {'Host': 'arielh.com', 'Origin': 'https://arielh.com', 'Content-Type': 'application/json'}
            headers.update(extra or {})
            if isinstance(body, dict):
                body = json.dumps(body)
            connection = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            result = response.status, dict(response.getheaders()), response.read().decode('utf-8')
            connection.close()
            return result

        def expect(status, **kwargs):
            nonlocal checks
            result = request(**kwargs)
            assert result[0] == status, f'Expected {status}, got {result[0]}: {result[2][:200]}'
            checks += 1
            return result

        try:
            for _ in range(100):
                try:
                    request(path='/api/leaderboard.php?game=invalid')
                    break
                except OSError:
                    time.sleep(0.03)
            else:
                raise AssertionError('The disposable PHP server did not start.')
            event = {'name': 'Alice', 'score': 123}
            expect(405, method='DELETE')
            expect(403, extra={'Host': 'evil.example'})
            expect(403, extra={'X-Test-HTTPS': 'off'})
            expect(403, method='POST', body=event, extra={'Origin': 'https://evil.example'})
            expect(403, method='POST', body=event, extra={'Origin': 'https://www.arielh.com'})
            expect(403, method='POST', body=event, extra={'Origin': ''})
            expect(403, method='POST', body=event, extra={'Origin': 'http://arielh.com'})
            expect(403, method='POST', body=event, extra={'Origin': 'https://arielh.com:444'})
            expect(400, path='/api/leaderboard.php')
            expect(400, path='/api/leaderboard.php?game=bad')
            expect(400, path='/api/leaderboard.php?game[]=grid16')
            expect(400, path='/api/leaderboard.php?game=grid16&extra=1')
            for limit in ['0', '-1', '101', '1.5', 'abc', '01', '999999', '']:
                expect(400, path=f'/api/leaderboard.php?game=grid16&limit={limit}')
            expect(400, path='/api/leaderboard.php?game=grid16&limit[]=10')
            expect(415, method='POST', body=json.dumps(event), extra={'Content-Type': 'text/plain'})
            expect(413, method='POST', body='x' * 1025)
            expect(400, method='POST', body='{')
            for body in [
                {'name': 'Alice'}, {'score': 1}, {**event, 'visitor_id': 'forbidden'},
                {'name': ['Alice'], 'score': 1}, {'name': 'Alice', 'score': '123'},
                {'name': 'Alice', 'score': -1}, {'name': 'Alice', 'score': 1.5},
                {'name': 'Alice', 'score': 864001}, {'name': 'x' * 13, 'score': 1},
                {'name': 'A\x00B', 'score': 1},
            ]:
                expect(400, method='POST', body=body)
            expect(400, method='POST', body='{"name":"A","score":1e999}')
            expect(400, path='/api/leaderboard.php?game=shooter', method='POST', body={'name': 'x' * 7, 'score': 1})
            expect(400, path='/api/leaderboard.php?game=shooter', method='POST', body={'name': 'strasse', 'score': 1})
            expect(400, method='POST', body={'name': '1234567straße', 'score': 1})
            expect(400, path='/api/leaderboard.php?game=shooter', method='POST', body={'name': 'A', 'score': 1000000001})
            assert not (private / 'scores.sqlite').exists(), 'Invalid requests must not create storage.'

            _, headers, body = expect(200)
            assert json.loads(body) == []
            assert 'no-store' in headers['Cache-Control'] and headers['X-Content-Type-Options'] == 'nosniff'
            assert 'Set-Cookie' not in headers and 'Access-Control-Allow-Origin' not in headers
            expect(204, method='POST', body={'name': ' alice ', 'score': 123})
            expect(204, method='POST', body={'name': 'Bob', 'score': 45})
            expect(204, path='/api/leaderboard.php?game=shooter', method='POST', body={'name': 'Zed', 'score': 999})
            expect(204, path='/api/leaderboard.php?game=shooter', method='POST', body={'name': 'straße', 'score': 100})
            expect(204, method='POST', body={'name': '123456straße', 'score': 2})
            expect(204, method='POST', body={'name': '  ', 'score': 0})
            expect(204, method='POST', body={'name': 'é中', 'score': 1})
            expect(204, method='POST', body={'name': '<img>', 'score': 2})
            _, _, body = expect(200, path='/api/leaderboard.php?game=grid16&limit=1')
            assert json.loads(body) == [{'name': 'alice', 'score': 123}]
            _, _, body = expect(200, path='/api/leaderboard.php?game=shooter')
            assert json.loads(body) == [{'name': 'Zed', 'score': 999}, {'name': 'straße', 'score': 100}]
            _, _, body = expect(200)
            assert '<' not in body and any(row['name'] == '<img>' for row in json.loads(body))
            assert any(row['name'] == '123456straße' for row in json.loads(body))
            expect(200, extra={'Host': f'localhost:{port}', 'X-Test-HTTPS': 'off', 'Origin': ''})
            expect(204, method='POST', body={'name': 'LOCAL', 'score': 3}, extra={'Host': f'localhost:{port}', 'Origin': f'http://localhost:{port}', 'X-Test-HTTPS': 'off'})
            expect(204, method='POST', body={'name': 'WWW', 'score': 4}, extra={'Host': 'www.arielh.com', 'Origin': 'https://www.arielh.com'})

            db = sqlite3.connect(private / 'scores.sqlite')
            assert {row[1] for row in db.execute('PRAGMA table_info(scores)')} == {'id', 'game', 'name', 'score'}
            assert {row[1] for row in db.execute('PRAGMA table_info(post_limits)')} == {'minute', 'total'}
            db.executemany('INSERT INTO scores(game,name,score) VALUES (?,?,?)', [('grid16', 'SEED', value) for value in range(1000, 2005)])
            db.commit()
            expect(204, method='POST', body={'name': 'TOP', 'score': 2006})
            assert db.execute("SELECT COUNT(*) FROM scores WHERE game='grid16'").fetchone()[0] == 1000
            assert db.execute("SELECT COUNT(*) FROM scores WHERE game='shooter'").fetchone()[0] == 2
            _, _, body = expect(200)
            assert json.loads(body)[0] == {'name': 'TOP', 'score': 2006}
            _, _, body = expect(200, path='/api/leaderboard.php?game=grid16&limit=100')
            assert len(json.loads(body)) == 100

            # Set the current global minute just below its cap rather than send 120 requests.
            minute = test_now // 60
            db.execute('DELETE FROM post_limits')
            db.execute('INSERT INTO post_limits VALUES (?,119)', [minute])
            db.commit()
            expect(204, path='/api/leaderboard.php?game=shooter', method='POST', body={'name': 'LAST', 'score': 1000})
            status, headers, body = expect(429, method='POST', body=event)
            assert 1 <= int(headers['Retry-After']) <= 60 and 'wait' in json.loads(body)['error']
            assert db.execute('SELECT total FROM post_limits WHERE minute=?', [minute]).fetchone()[0] == 120
            db.execute('DELETE FROM post_limits')
            db.execute('INSERT INTO post_limits VALUES (?,120)', [minute - 1])
            db.commit()
            expect(204, method='POST', body=event)
            assert db.execute('SELECT COUNT(*) FROM post_limits').fetchone()[0] == 1
            db.close()

            denial = private / '.htaccess'
            denial.rename(private / 'denial-backup')
            _, _, body = expect(503)
            assert 'PDO SQLite' in json.loads(body)['error'] and str(test_root) not in body
            (private / 'denial-backup').rename(denial)
            # Exercise missing PDO SQLite separately without extensions or any HTTP server.
            snippet = "register_shutdown_function(function(){fwrite(STDERR,(string)http_response_code());}); $_SERVER['REQUEST_METHOD']='GET'; $_SERVER['HTTP_HOST']='arielh.com'; $_SERVER['HTTPS']='on'; $_GET=['game'=>'grid16']; require $argv[1];"
            unavailable = subprocess.run([php_path, '-n', '-r', snippet, str(test_root / 'api/leaderboard.php')], capture_output=True, text=True, check=True)
            assert unavailable.stderr == '503' and 'PDO SQLite' in json.loads(unavailable.stdout)['error']
            checks += 1
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()

    print(f'Leaderboard API: {checks} HTTP/runtime checks passed; games stay separate, names remain text, storage stays bounded, and no visitor identity or live scores were created.')


if __name__ == '__main__':
    main()
