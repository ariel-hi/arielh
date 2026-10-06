<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: same-origin');

const LB_PRIVATE_DIR = __DIR__ . '/../.leaderboards-private';
const LB_MAX_SCORES = ['grid16' => 864000, 'shooter' => 1000000000];
const LB_NAME_LENGTHS = ['grid16' => 12, 'shooter' => 6];

function lb_reply(int $status, ?array $payload = null): never
{
    http_response_code($status);
    if ($payload !== null) {
        echo json_encode($payload, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR);
    }
    exit;
}

function lb_error(int $status, string $message): never
{
    lb_reply($status, ['error' => $message]);
}

function lb_request_context(): array
{
    $hostHeader = $_SERVER['HTTP_HOST'] ?? '';
    if (!preg_match('~\A(?:arielh\.com|www\.arielh\.com|localhost|127\.0\.0\.1)(?::[0-9]{1,5})?\z~i', $hostHeader)) {
        lb_error(403, 'This host is not allowed.');
    }
    $parts = parse_url('http://' . $hostHeader);
    if ($parts === false) { lb_error(403, 'This host is not allowed.'); }
    $host = strtolower($parts['host']);
    $https = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
        || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443;
    if (!$https && !in_array($host, ['localhost', '127.0.0.1'], true)) {
        lb_error(403, 'HTTPS is required.');
    }
    return [$host, $https ? 'https' : 'http', $parts['port'] ?? ($https ? 443 : 80)];
}

function lb_require_origin(array $request): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (!preg_match('~\Ahttps?://(?:arielh\.com|www\.arielh\.com|localhost|127\.0\.0\.1)(?::[0-9]{1,5})?\z~i', $origin)) {
        lb_error(403, 'The request origin is not allowed.');
    }
    $parts = parse_url($origin);
    if ($parts === false || strtolower($parts['host']) !== $request[0]
        || $parts['scheme'] !== $request[1]
        || ($parts['port'] ?? ($parts['scheme'] === 'https' ? 443 : 80)) !== $request[2]) {
        lb_error(403, 'The request origin is not allowed.');
    }
}

function lb_database(): PDO
{
    if (!class_exists('PDO') || !in_array('sqlite', PDO::getAvailableDrivers(), true)
        || !is_readable(LB_PRIVATE_DIR . '/.htaccess') || !is_writable(LB_PRIVATE_DIR)) {
        throw new RuntimeException('Storage is unavailable.');
    }
    $database = new PDO('sqlite:' . LB_PRIVATE_DIR . '/scores.sqlite', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $database->exec('PRAGMA busy_timeout = 3000');
    $database->exec('CREATE TABLE IF NOT EXISTS scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game TEXT NOT NULL CHECK (game IN (\'grid16\', \'shooter\')),
        name TEXT NOT NULL, score INTEGER NOT NULL CHECK (score >= 0)
    )');
    $database->exec('CREATE INDEX IF NOT EXISTS scores_ranking ON scores (game, score DESC, id ASC)');
    $database->exec('CREATE TABLE IF NOT EXISTS post_limits (minute INTEGER PRIMARY KEY, total INTEGER NOT NULL)');
    return $database;
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    lb_error(405, 'Use GET to load scores or POST to submit a score.');
}
$request = lb_request_context();
if ($method === 'POST') { lb_require_origin($request); }
$allowedQuery = $method === 'GET' ? ['game', 'limit'] : ['game'];
$game = $_GET['game'] ?? '';
if (array_diff(array_keys($_GET), $allowedQuery) || !is_string($game) || !array_key_exists($game, LB_MAX_SCORES)) {
    lb_error(400, 'Choose grid16 or shooter.');
}

if ($method === 'GET') {
    $limitText = $_GET['limit'] ?? '10';
    if (!is_string($limitText) || !preg_match('/\A[1-9][0-9]{0,2}\z/', $limitText) || (int) $limitText > 100) {
        lb_error(400, 'The score limit must be between 1 and 100.');
    }
    $limit = (int) $limitText;
} else {
    $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
    if ($contentType !== 'application/json') { lb_error(415, 'Send the score as JSON.'); }
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 1024) { lb_error(413, 'The score payload is too large.'); }
    $body = file_get_contents('php://input', false, null, 0, 1025);
    if ($body === false || strlen($body) > 1024) { lb_error(413, 'The score payload is too large.'); }
    try {
        $payload = json_decode($body, true, 4, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        lb_error(400, 'Send a valid score payload.');
    }
    if (!is_array($payload) || count($payload) !== 2 || array_diff(array_keys($payload), ['name', 'score'])
        || !is_string($payload['name'] ?? null) || !is_int($payload['score'] ?? null)
        || $payload['score'] < 0 || $payload['score'] > LB_MAX_SCORES[$game]) {
        lb_error(400, 'Send a nickname and a valid whole-number score.');
    }
    $name = preg_replace('/[\p{Z}\s]+/u', ' ', trim($payload['name']));
    if ($name === null || preg_match('/[\x00-\x1f\x7f]/u', $name)) {
        lb_error(400, 'Use a printable nickname.');
    }
    $name = trim($name) ?: 'ANON';
    // Keep the submitted spelling: Unicode uppercasing can expand a valid nickname.
    if (preg_match_all('/./us', $name) > LB_NAME_LENGTHS[$game]) {
        lb_error(400, 'The nickname is too long for this game.');
    }
    $score = $payload['score'];
}

$previousMask = umask(0077);
try {
    $database = lb_database();
    if ($method === 'GET') {
        $statement = $database->prepare('SELECT name, score FROM scores WHERE game = ? ORDER BY score DESC, id ASC LIMIT ?');
        $statement->bindValue(1, $game, PDO::PARAM_STR);
        $statement->bindValue(2, $limit, PDO::PARAM_INT);
        $statement->execute();
        $rows = $statement->fetchAll();
    } else {
        $database->exec('BEGIN IMMEDIATE');
        $minute = intdiv(time(), 60);
        $statement = $database->prepare('SELECT total FROM post_limits WHERE minute = ?');
        $statement->execute([$minute]);
        if ((int) $statement->fetchColumn() >= 120) {
            $database->exec('ROLLBACK');
            header('Retry-After: ' . (60 - time() % 60));
            lb_error(429, 'Too many scores were submitted this minute. Please wait and try again.');
        }
        $statement = $database->prepare('DELETE FROM post_limits WHERE minute <> ?');
        $statement->execute([$minute]);
        $statement = $database->prepare('INSERT INTO post_limits (minute, total) VALUES (?, 1)
            ON CONFLICT (minute) DO UPDATE SET total = total + 1');
        $statement->execute([$minute]);
        $statement = $database->prepare('INSERT INTO scores (game, name, score) VALUES (?, ?, ?)');
        $statement->execute([$game, $name, $score]);
        $statement = $database->prepare('DELETE FROM scores WHERE game = ? AND id NOT IN
            (SELECT id FROM scores WHERE game = ? ORDER BY score DESC, id ASC LIMIT 1000)');
        $statement->execute([$game, $game]);
        $database->exec('COMMIT');
    }
} catch (Throwable $error) {
    if (isset($database) && $method === 'POST') {
        try { $database->exec('ROLLBACK'); } catch (Throwable $ignored) { }
    }
    lb_error(503, 'Leaderboard storage is unavailable. The host needs PHP PDO SQLite and a writable, HTTP-protected .leaderboards-private directory.');
} finally {
    umask($previousMask);
}
if ($method === 'GET') { lb_reply(200, $rows); }
lb_reply(204);
