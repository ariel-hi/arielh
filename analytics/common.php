<?php
declare(strict_types=1);

const AH_PRIVATE_DIR = __DIR__ . '/../.analytics-private';
const AH_ALLOWED_HOSTS = ['arielh.com', 'www.arielh.com', 'localhost', '127.0.0.1'];
const AH_EVENTS = ['page_view', 'project_open', 'project_filter', 'game_start'];
const AH_PROJECTS = ['grid16', 'space-shooter', 'star-cluster-blitz', 'horizon', 'nebula', 'rufus', 'word-king', 'who-goes-first', 'copysprig', 'worldbreaker', 'comprehend', 'kinetic'];
const AH_FILTERS = ['all', 'games', 'tools', 'experiments'];

function ah_headers(): void
{
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
    header('X-Robots-Tag: noindex, nofollow');
    header('X-Frame-Options: DENY');
}

function ah_reply(int $status, string $message = ''): void
{
    http_response_code($status);
    if ($message !== '') {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => $message], JSON_UNESCAPED_SLASHES);
    }
    exit;
}

function ah_config(): array
{
    static $config;
    if ($config !== null) {
        return $config;
    }
    $path = AH_PRIVATE_DIR . '/config.php';
    if (!is_readable($path) || !is_readable(AH_PRIVATE_DIR . '/.htaccess')) {
        throw new RuntimeException('Analytics is not configured.');
    }
    $config = require $path;
    if (!is_array($config) || ($config['enabled'] ?? false) !== true
        || !is_string($config['password_hash'] ?? null)
        || empty(password_get_info($config['password_hash'])['algo'])) {
        throw new RuntimeException('Analytics is not configured.');
    }
    $timezone = $config['timezone'] ?? 'America/Los_Angeles';
    if (!is_string($timezone) || !in_array($timezone, timezone_identifiers_list(), true)) {
        throw new RuntimeException('Invalid analytics configuration.');
    }
    date_default_timezone_set($timezone);
    return $config;
}

function ah_origin_allowed(): bool
{
    $hostHeader = $_SERVER['HTTP_HOST'] ?? '';
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    // Require an Origin for writes; sendBeacon and same-origin fetch supply it.
    if (!preg_match('~\A(?:arielh\.com|www\.arielh\.com|localhost|127\.0\.0\.1)(?::[0-9]{1,5})?\z~i', $hostHeader)
        || !preg_match('~\Ahttps?://(?:arielh\.com|www\.arielh\.com|localhost|127\.0\.0\.1)(?::[0-9]{1,5})?\z~i', $origin)) {
        return false;
    }
    $expectedScheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443 ? 'https' : 'http';
    $parts = parse_url($origin);
    $hostParts = parse_url('http://' . $hostHeader);
    // A syntactically allowed port can still be outside parse_url's range.
    if ($parts === false || $hostParts === false) {
        return false;
    }
    $originPort = $parts['port'] ?? ($parts['scheme'] === 'https' ? 443 : 80);
    $requestPort = $hostParts['port'] ?? ($expectedScheme === 'https' ? 443 : 80);
    return strtolower($parts['host']) === strtolower($hostParts['host'])
        && $parts['scheme'] === $expectedScheme && $originPort === $requestPort;
}

function ah_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443;
}

function ah_canonical_path(string $path): ?string
{
    $paths = [
        '/' => '/', '/index.html' => '/',
        '/projects.html' => '/projects.html', '/projects/' => '/projects.html',
        '/about.html' => '/about.html', '/privacy.html' => '/privacy.html',
        '/kinetic.html' => '/kinetic.html',
        '/rufus.html' => '/rufus.html', '/horizon.html' => '/horizon.html',
        '/nebula.html' => '/nebula.html', '/shooter.html' => '/shooter.html',
        '/gems.html' => '/gems.html', '/grid16/' => '/grid16/',
        '/grid16/index.html' => '/grid16/', '/shooter_game/' => '/shooter_game/',
        '/shooter_game/index.html' => '/shooter_game/', '/404.html' => '/404.html',
    ];
    return $paths[$path] ?? null;
}

function ah_valid_event(array $payload): ?array
{
    $allowedKeys = ['event', 'path', 'tag', 'referrer', 'device'];
    if (array_diff(array_keys($payload), $allowedKeys)) {
        return null;
    }
    foreach ($payload as $value) {
        if (!is_string($value) || strlen($value) > 253) {
            return null;
        }
    }
    $event = $payload['event'] ?? '';
    $path = ah_canonical_path($payload['path'] ?? '');
    $tag = $payload['tag'] ?? '';
    $device = $payload['device'] ?? '';
    if (!in_array($event, AH_EVENTS, true) || $path === null
        || !in_array($device, ['small', 'large'], true)) {
        return null;
    }
    if (($event === 'page_view' && $tag !== '')
        || ($event === 'project_open' && !in_array($tag, AH_PROJECTS, true))
        || ($event === 'project_filter' && !in_array($tag, AH_FILTERS, true))
        || ($event === 'game_start' && !in_array($tag, ['grid16', 'shooter', 'gems'], true))) {
        return null;
    }
    $referrer = strtolower($payload['referrer'] ?? '');
    if ($referrer !== '' && (!preg_match('/\A(?=.{1,253}\z)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\z/', $referrer)
        || in_array($referrer, AH_ALLOWED_HOSTS, true))) {
        return null;
    }
    // Domain-only, and only attached to the initial pageview. Never retain URLs.
    return [$event, $path, $tag, $event === 'page_view' ? $referrer : '', $device];
}

function ah_database(): PDO
{
    static $database;
    if ($database instanceof PDO) {
        return $database;
    }
    ah_config();
    if (!class_exists('PDO') || !in_array('sqlite', PDO::getAvailableDrivers(), true)
        || !is_writable(AH_PRIVATE_DIR)) {
        throw new RuntimeException('Analytics storage is unavailable.');
    }
    $database = new PDO('sqlite:' . AH_PRIVATE_DIR . '/analytics.sqlite', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $database->exec('PRAGMA busy_timeout = 3000');
    $database->exec('CREATE TABLE IF NOT EXISTS counts (
        day TEXT NOT NULL, event TEXT NOT NULL, path TEXT NOT NULL, tag TEXT NOT NULL,
        referrer TEXT NOT NULL, device TEXT NOT NULL, total INTEGER NOT NULL,
        PRIMARY KEY (day, event, path, tag, referrer, device)
    ) WITHOUT ROWID');
    return $database;
}

function ah_prune(PDO $database, array $config): void
{
    $days = max(30, min(365, (int) ($config['retention_days'] ?? 180)));
    $cutoff = (new DateTimeImmutable('today'))->modify('-' . ($days - 1) . ' days')->format('Y-m-d');
    $statement = $database->prepare('DELETE FROM counts WHERE day < ?');
    $statement->execute([$cutoff]);
}

function ah_escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

// Reserve each attempt before password verification under a global file lock.
// The ten-minute count includes failed and in-flight attempts; success resets
// it. No IP addresses or visitor identities are retained.
function ah_login_failure_limit(bool $reserveAttempt = false, bool $reset = false): bool
{
    $handle = fopen(AH_PRIVATE_DIR . '/login-rate.json', 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) { fclose($handle); }
        throw new RuntimeException('Login is temporarily unavailable.');
    }
    try {
        $data = json_decode(stream_get_contents($handle) ?: '{}', true);
        $now = time();
        if (!is_array($data) || $now - (int) ($data['since'] ?? 0) >= 600 || $reset) {
            $data = ['since' => $now, 'failures' => 0];
        }
        $blocked = (int) ($data['failures'] ?? 0) >= 12;
        if ($reserveAttempt && !$blocked) { $data['failures']++; }
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, json_encode($data));
        return $blocked;
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}
