"""Exercise analytics in a disposable copy with PHP's local development server.

Usage: python scripts/test-analytics.py --php /path/to/php
On portable Windows PHP, add --extension-dir /path/to/php/ext.
Apache denial rules still require a separate live HTTP 403 verification.
"""
from __future__ import annotations

import argparse
import contextlib
import http.client
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import time


ROOT = Path(__file__).resolve().parents[1]


def check_concurrent_reservations(php: list[str], test_root: Path) -> None:
    """Run real dashboard PHP processes in parallel, without an HTTP server."""
    subprocess.run(php + ['-r', 'require $argv[1]; ah_login_failure_limit(false, true);',
        str(test_root / 'analytics/common.php')], check=True, capture_output=True)
    gate = test_root / 'reservation-gate'
    wrapper = test_root / 'reservation-check.php'
    wrapper.write_text("""<?php
ini_set('session.use_cookies', '0');
ini_set('session.use_strict_mode', '0');
session_save_path(__DIR__ . '/.analytics-private/sessions');
session_name('ariel_stats');
session_id(bin2hex(random_bytes(24)));
session_start();
$_SESSION['csrf'] = str_repeat('a', 64);
session_write_close();
$_COOKIE['ariel_stats'] = session_id();
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['HTTP_HOST'] = 'arielh.com';
$_SERVER['HTTPS'] = 'on';
$_SERVER['HTTP_ORIGIN'] = 'https://arielh.com';
$_SERVER['CONTENT_LENGTH'] = 120;
$_POST = ['action' => 'login', 'csrf' => str_repeat('a', 64), 'password' => 'bad'];
register_shutdown_function(static function (): void { fwrite(STDERR, (string) http_response_code()); });
file_put_contents($argv[2], 'ready');
$deadline = microtime(true) + 25;
while (!is_file($argv[1])) {
    if (microtime(true) >= $deadline) { exit(2); }
    usleep(1000);
}
require __DIR__ . '/analytics/dashboard.php';
""", encoding='utf-8')
    workers = 24
    processes = []
    ready_paths = [test_root / f'reservation-ready-{index}' for index in range(workers)]
    try:
        for ready in ready_paths:
            processes.append(subprocess.Popen(php + [str(wrapper), str(gate), str(ready)],
                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True))
        deadline = time.monotonic() + 25
        while not all(ready.is_file() for ready in ready_paths):
            assert time.monotonic() < deadline, 'Parallel PHP reservation processes did not reach their start barrier.'
            assert all(process.poll() is None for process in processes), 'A parallel PHP process exited before the start barrier.'
            time.sleep(0.01)
        gate.touch()
        statuses = []
        for process in processes:
            _, status = process.communicate(timeout=25)
            assert process.returncode == 0, 'A parallel PHP reservation process failed.'
            statuses.append(status)
        assert statuses.count('401') == 12 and statuses.count('429') == workers - 12, statuses
        throttle = json.loads((test_root / '.analytics-private/login-rate.json').read_text())
        assert set(throttle) == {'since', 'failures'} and throttle['failures'] == 12
        print(f'Concurrent dashboard reservation: {workers} parallel PHP processes; 12 attempts admitted, {workers - 12} blocked. No HTTP concurrency is claimed.')
    finally:
        for process in processes:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--php', default=shutil.which('php'))
    parser.add_argument('--extension-dir')
    args = parser.parse_args()
    if not args.php:
        raise SystemExit('Provide --php pointing to a PHP runtime with PDO SQLite.')
    php = [str(Path(args.php).resolve()), '-d', 'display_errors=0', '-d', 'log_errors=0']
    if args.extension_dir:
        php += ['-n', '-d', f'extension_dir={Path(args.extension_dir).resolve()}', '-d', 'extension=pdo_sqlite']
    for source in (ROOT / 'analytics').glob('*.php'):
        subprocess.run(php + ['-l', str(source)], check=True, capture_output=True)
    drivers = subprocess.check_output(php + ['-r', 'echo implode(",", PDO::getAvailableDrivers());'], text=True)
    assert 'sqlite' in drivers, 'This PHP runtime needs PDO SQLite to run integration tests.'

    with tempfile.TemporaryDirectory(prefix='arielh-analytics-tests-') as temporary:
        test_root = Path(temporary)
        shutil.copytree(ROOT / 'analytics', test_root / 'analytics')
        shutil.copytree(ROOT / '.analytics-private', test_root / '.analytics-private', ignore=shutil.ignore_patterns('config.php', '*.sqlite*', '*.json', 'sessions'))
        password = secrets.token_urlsafe(24)
        digest = subprocess.check_output(php + ['-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', password], text=True)
        (test_root / '.analytics-private/config.php').write_text(
            "<?php return ['enabled'=>true,'password_hash'=>" + repr(digest) + ", 'timezone'=>'America/Los_Angeles','retention_days'=>180];",
            encoding='utf-8',
        )
        router = test_root / 'router.php'
        # Model HTTPS termination without exposing a real server or credentials.
        router.write_text("<?php $_SERVER['HTTPS']='on'; return false;", encoding='utf-8')
        with contextlib.closing(socket.socket()) as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        process = subprocess.Popen(php + ['-S', f'127.0.0.1:{port}', '-t', str(test_root), str(router)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        def request(path='/analytics/collect.php', *, method='POST', body=None, extra=None):
            connection = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
            headers = {'Host': 'arielh.com', 'Origin': 'https://arielh.com', 'User-Agent': 'Mozilla/5.0 test', 'Content-Type': 'text/plain'}
            headers.update(extra or {})
            if isinstance(body, dict):
                body = json.dumps(body)
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            result = response.status, dict(response.getheaders()), response.read().decode('utf-8')
            connection.close()
            return result

        checks = 0

        def expect(status, **kwargs):
            nonlocal checks
            result = request(**kwargs)
            assert result[0] == status, f'Expected {status}, got {result[0]}: {result[2][:200]}'
            checks += 1
            return result

        try:
            for _ in range(100):
                try:
                    request(method='GET')
                    break
                except OSError:
                    time.sleep(0.03)
            else:
                raise AssertionError('The disposable PHP server did not start.')
            event = {'event': 'page_view', 'path': '/', 'tag': '', 'referrer': 'example.org', 'device': 'large'}
            expect(405, method='GET')
            expect(403, body=event, extra={'Origin': 'https://evil.example'})
            expect(403, body=event, extra={'Origin': 'https://www.arielh.com'})
            expect(403, body=event, extra={'Origin': ''})
            # Allowed host spellings with unparseable ports must be rejected,
            # not raise a TypeError before the collector's storage handler.
            expect(403, body=event, extra={'Origin': 'https://arielh.com:65536'})
            expect(403, body=event, extra={'Origin': 'https://arielh.com:99999'})
            expect(403, body=event, extra={'Host': 'arielh.com:99999'})
            expect(415, body=json.dumps(event), extra={'Content-Type': 'application/x-www-form-urlencoded'})
            expect(413, body='x' * 1025)
            expect(400, body='{')
            expect(400, body={**event, 'path': '/?email=private'})
            expect(400, body={**event, 'referrer': 'https://example.org/private?token=secret'})
            expect(400, body={**event, 'visitor_id': 'forbidden'})
            expect(400, body={**event, 'tag': 'invented'})
            expect(400, body={**event, 'device': 'user-agent-value'})
            expect(400, body={**event, 'event': 'password'})
            expect(204, body=event, extra={'DNT': '1'})
            expect(204, body=event, extra={'Sec-GPC': '1'})
            expect(204, body=event, extra={'User-Agent': 'HeadlessChrome'})
            expect(204, body=event, extra={'Host': f'localhost:{port}', 'Origin': f'https://localhost:{port}'})
            assert not (test_root / '.analytics-private/analytics.sqlite').exists(), 'Excluded traffic must not create analytics storage.'
            expect(204, body=event)
            expect(204, body={**event, 'path': '/index.html'}, extra={'Content-Type': 'application/json'})
            expect(204, body={**event, 'event': 'project_open', 'tag': 'word-king'})
            expect(204, body={**event, 'event': 'game_start', 'tag': 'grid16', 'path': '/grid16/index.html'})
            db = sqlite3.connect(test_root / '.analytics-private/analytics.sqlite')
            columns = {row[1] for row in db.execute('PRAGMA table_info(counts)')}
            assert columns == {'day', 'event', 'path', 'tag', 'referrer', 'device', 'total'}
            assert db.execute("SELECT total FROM counts WHERE event='page_view'").fetchone()[0] == 2
            assert db.execute("SELECT referrer FROM counts WHERE event='project_open'").fetchone()[0] == ''
            assert db.execute("SELECT path FROM counts WHERE event='game_start'").fetchone()[0] == '/grid16/'
            expect(204, body={**event, 'path': '/404.html'})
            assert db.execute("SELECT total FROM counts WHERE path='/404.html' AND event='page_view'").fetchone()[0] == 1
            expect(400, body={**event, 'path': '/missing/private-address'})
            expect(400, body={**event, 'path': '/404.html?token=secret'})
            db.execute("INSERT INTO counts VALUES ('2000-01-01','page_view','/','','','large',1)")
            db.commit()
            expect(204, body=event)
            assert db.execute("SELECT COUNT(*) FROM counts WHERE day='2000-01-01'").fetchone()[0] == 0
            for index in range(52):
                expect(204, body={**event, 'referrer': f'example{index}.org'})
            assert db.execute("SELECT COUNT(DISTINCT referrer) FROM counts WHERE referrer NOT IN ('','other')").fetchone()[0] == 50
            assert db.execute("SELECT SUM(total) FROM counts WHERE referrer='other'").fetchone()[0] == 3
            db.close()

            status, headers, page = expect(200, path='/analytics/dashboard.php', method='GET')
            assert 'Daily pageviews' not in page and 'Sign in' in page, 'Unauthenticated dashboard must never expose stats.'
            cookie = headers['Set-Cookie'].split(';', 1)[0]
            assert 'secure' in headers['Set-Cookie'].lower() and 'httponly' in headers['Set-Cookie'].lower() and 'SameSite=Strict' in headers['Set-Cookie']
            assert 'path=/analytics/dashboard.php' in headers['Set-Cookie']
            csrf = re.search(r'name="csrf" value="([a-f0-9]+)"', page).group(1)
            form_headers = {'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookie}
            expect(403, path='/analytics/dashboard.php', body=f'action=login&csrf={csrf}&password=bad',
                extra={**form_headers, 'Origin': 'https://arielh.com:99999'})
            expect(403, path='/analytics/dashboard.php', body='action=login&csrf=bad&password=bad', extra=form_headers)
            expect(401, path='/analytics/dashboard.php', body=f'action=login&csrf={csrf}&password=bad', extra=form_headers)
            status, headers, _ = expect(303, path='/analytics/dashboard.php', body=f'action=login&csrf={csrf}&password={password}', extra=form_headers)
            new_cookie = headers['Set-Cookie'].split(';', 1)[0]
            assert cookie != new_cookie, 'Successful login must rotate the session ID.'
            _, _, page = expect(200, path='/analytics/dashboard.php', method='GET', extra={'Cookie': new_cookie})
            assert 'Daily pageviews' in page and 'example.org' in page and 'Sign out' in page
            csrf = re.search(r'name="csrf" value="([a-f0-9]+)"', page).group(1)
            _, headers, _ = expect(303, path='/analytics/dashboard.php', body=f'action=logout&csrf={csrf}', extra={**form_headers, 'Cookie': new_cookie})
            logout_cookie = headers['Set-Cookie'].split(';', 1)[0]
            _, _, page = expect(200, path='/analytics/dashboard.php', method='GET', extra={'Cookie': logout_cookie})
            assert 'Daily pageviews' not in page
            csrf = re.search(r'name="csrf" value="([a-f0-9]+)"', page).group(1)
            for _ in range(12):
                expect(401, path='/analytics/dashboard.php', body=f'action=login&csrf={csrf}&password=bad', extra={**form_headers, 'Cookie': logout_cookie})
            expect(429, path='/analytics/dashboard.php', body=f'action=login&csrf={csrf}&password=bad', extra={**form_headers, 'Cookie': logout_cookie})
            throttle = json.loads((test_root / '.analytics-private/login-rate.json').read_text())
            assert set(throttle) == {'since', 'failures'}, 'Login throttle must not retain IP addresses or user IDs.'
            check_concurrent_reservations(php, test_root)

            # A missing SQLite extension must fail safely instead of surfacing
            # a fatal error or attempting a public/readable fallback data file.
            no_driver = subprocess.run([str(Path(args.php).resolve()), '-n', '-r',
                'require $argv[1]; try { ah_database(); exit(1); } catch (RuntimeException $e) { echo "safe-unavailable"; }',
                str(test_root / 'analytics/common.php')], capture_output=True, text=True)
            assert no_driver.returncode == 0 and no_driver.stdout == 'safe-unavailable', 'Missing PDO SQLite must be handled gracefully.'

            (test_root / '.analytics-private/config.php').write_text("<?php return ['enabled'=>false,'password_hash'=>''];", encoding='utf-8')
            expect(503, body=event)
            _, _, page = expect(503, path='/analytics/dashboard.php', method='GET')
            assert 'Stats is not available yet' in page and password not in page and str(test_root) not in page
            print(f'Analytics PHP integration: {checks} HTTP checks passed; aggregate privacy, cardinality, retention, login/CSRF/session rotation/logout/throttle and unavailable PDO verified.')
        finally:
            process.terminate()
            process.wait(timeout=10)

    subprocess.run(['node', str(ROOT / 'scripts/test-analytics.mjs')], check=True)


if __name__ == '__main__':
    main()
