<?php
declare(strict_types=1);
require __DIR__ . '/common.php';
ah_headers();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    ah_reply(405, 'Method not allowed.');
}
if (!ah_origin_allowed()) {
    ah_reply(403, 'Origin not allowed.');
}
if (($_SERVER['HTTP_DNT'] ?? '') === '1' || ($_SERVER['HTTP_SEC_GPC'] ?? '') === '1'
    || preg_match('/bot|crawler|spider|headless|lighthouse|pagespeed|monitor|uptime/i', $_SERVER['HTTP_USER_AGENT'] ?? '')
    || in_array(strtolower(parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST) ?? ''), ['localhost', '127.0.0.1'], true)) {
    ah_reply(204);
}
$contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
if (!in_array($contentType, ['application/json', 'text/plain'], true)) {
    ah_reply(415, 'Unsupported content type.');
}
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 1024) {
    ah_reply(413, 'Payload too large.');
}
$body = file_get_contents('php://input', false, null, 0, 1025);
if ($body === false || strlen($body) > 1024) {
    ah_reply(413, 'Payload too large.');
}
try {
    $payload = json_decode($body, true, 8, JSON_THROW_ON_ERROR);
} catch (JsonException $error) {
    ah_reply(400, 'Invalid payload.');
}
if (!is_array($payload) || ($event = ah_valid_event($payload)) === null) {
    ah_reply(400, 'Invalid event.');
}
try {
    $config = ah_config();
    $database = ah_database();
    $database->exec('BEGIN IMMEDIATE');
    if ($event[3] !== '') {
        $known = $database->prepare('SELECT 1 FROM counts WHERE day = ? AND referrer = ? LIMIT 1');
        $known->execute([date('Y-m-d'), $event[3]]);
        if (!$known->fetchColumn()) {
            $domains = $database->prepare("SELECT COUNT(DISTINCT referrer) FROM counts WHERE day = ? AND referrer NOT IN ('', 'other')");
            $domains->execute([date('Y-m-d')]);
            // Bound referrer cardinality even if an automated sender invents domains.
            if ((int) $domains->fetchColumn() >= 50) { $event[3] = 'other'; }
        }
    }
    $statement = $database->prepare('INSERT INTO counts (day, event, path, tag, referrer, device, total)
        VALUES (?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT (day, event, path, tag, referrer, device) DO UPDATE SET total = MIN(total + 1, 1000000)');
    $statement->execute(array_merge([date('Y-m-d')], $event));
    // Keep a bounded history without a cron job. No raw event log is created.
    ah_prune($database, $config);
    $database->exec('COMMIT');
} catch (Throwable $error) {
    if (isset($database)) {
        try { $database->exec('ROLLBACK'); } catch (Throwable $ignored) { }
    }
    // Server paths, configuration and driver messages stay out of HTTP responses.
    ah_reply(503, 'Analytics is unavailable.');
}
ah_reply(204);
