<?php
declare(strict_types=1);
require __DIR__ . '/common.php';
ah_headers();
$nonce = base64_encode(random_bytes(18));
header("Content-Security-Policy: default-src 'none'; style-src 'nonce-$nonce'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
header('Content-Type: text/html; charset=utf-8');
$available = true;
$authenticated = false;
$error = '';
$summary = ['page_view' => 0, 'project_open' => 0, 'project_filter' => 0, 'game_start' => 0];
$tables = [];
$days = (int) ($_GET['days'] ?? 30);
if (!in_array($days, [7, 30, 90, 180], true)) { $days = 30; }
$start = '';

try {
    $config = ah_config();
    $requestHost = strtolower(parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST) ?? '');
    if (!in_array($requestHost, AH_ALLOWED_HOSTS, true) || (!ah_https() && !in_array($requestHost, ['localhost', '127.0.0.1'], true))) {
        throw new RuntimeException('HTTPS is required.');
    }
    $sessionDirectory = AH_PRIVATE_DIR . '/sessions';
    if (!is_dir($sessionDirectory) && !mkdir($sessionDirectory, 0700) && !is_dir($sessionDirectory)) {
        throw new RuntimeException('Session storage unavailable.');
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', '1800');
    session_save_path($sessionDirectory);
    session_name('ariel_stats');
    session_set_cookie_params([
        'lifetime' => 0, 'path' => '/analytics/dashboard.php', 'secure' => true,
        'httponly' => true, 'samesite' => 'Strict',
    ]);
    if (!session_start()) { throw new RuntimeException('Session storage unavailable.'); }
    if (!isset($_SESSION['csrf'])) { $_SESSION['csrf'] = bin2hex(random_bytes(24)); }
    if (isset($_SESSION['authenticated_at'])
        && time() - (int) ($_SESSION['last_activity'] ?? 0) > 1800) {
        unset($_SESSION['authenticated_at'], $_SESSION['last_activity']);
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 2048 || !ah_origin_allowed()
            || !is_string($_POST['csrf'] ?? null)
            || !hash_equals($_SESSION['csrf'], $_POST['csrf'])) {
            http_response_code(403);
            $error = 'Please reload the page and try again.';
        } elseif (($_POST['action'] ?? '') === 'logout') {
            $_SESSION = [];
            session_regenerate_id(true);
            $_SESSION['csrf'] = bin2hex(random_bytes(24));
            header('Location: /analytics/dashboard.php', true, 303);
            exit;
        } elseif (($_POST['action'] ?? '') === 'login' && is_string($_POST['password'] ?? null)
            && strlen($_POST['password']) <= 256) {
            if (ah_login_failure_limit(true)) {
                http_response_code(429);
                header('Retry-After: 600');
                $error = 'Too many attempts. Try again in ten minutes.';
            } elseif (password_verify($_POST['password'], $config['password_hash'])) {
                session_regenerate_id(true);
                $_SESSION['authenticated_at'] = time();
                $_SESSION['last_activity'] = time();
                $_SESSION['csrf'] = bin2hex(random_bytes(24));
                ah_login_failure_limit(false, true);
                header('Location: /analytics/dashboard.php', true, 303);
                exit;
            } else {
                http_response_code(401);
                $error = 'That password did not work.';
            }
        } else {
            http_response_code(400);
            $error = 'Please enter your password.';
        }
    } elseif (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
        header('Allow: GET, POST');
        http_response_code(405);
        $error = 'This request is not supported.';
    }
    $authenticated = isset($_SESSION['authenticated_at']);
    if ($authenticated) {
        $_SESSION['last_activity'] = time();
        $database = ah_database();
        ah_prune($database, $config);
        $start = (new DateTimeImmutable('today'))->modify('-' . ($days - 1) . ' days')->format('Y-m-d');
        $statement = $database->prepare('SELECT event, SUM(total) AS total FROM counts WHERE day >= ? GROUP BY event');
        $statement->execute([$start]);
        foreach ($statement as $row) { $summary[$row['event']] = (int) $row['total']; }
        $queries = [
            'Daily pageviews' => ['day', "event = 'page_view'", 'day DESC'],
            'Pages' => ['path', "event = 'page_view'", 'total DESC'],
            'Project opens' => ['tag', "event = 'project_open'", 'total DESC'],
            'Game starts' => ['tag', "event = 'game_start'", 'total DESC'],
            'Project filters' => ['tag', "event = 'project_filter'", 'total DESC'],
            'Referrer domains' => ['referrer', "event = 'page_view'", 'total DESC'],
            'Screen groups' => ['device', "event = 'page_view'", 'total DESC'],
        ];
        foreach ($queries as $title => [$field, $condition, $order]) {
            // All SQL identifiers are internal constants, never request input.
            $statement = $database->prepare("SELECT $field AS label, SUM(total) AS total FROM counts WHERE day >= ? AND $condition GROUP BY $field ORDER BY $order LIMIT 180");
            $statement->execute([$start]);
            $tables[$title] = $statement->fetchAll();
        }
    }
} catch (Throwable $exception) {
    $available = false;
    $authenticated = false;
    http_response_code(503);
    $error = 'Stats is not available yet. Collection stays off until the private configuration and server storage are ready.';
}
$csrf = $_SESSION['csrf'] ?? '';
if (session_status() === PHP_SESSION_ACTIVE) { session_write_close(); }
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Stats — Ariel Hirschberg</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <style nonce="<?= ah_escape($nonce) ?>">
    :root {
      color-scheme: dark;
      --paper: #08090b;
      --ink: #eeeef0;
      --muted: #a2a3ab;
      --line: #28292f;
      --accent: #d5c6f7;
    }
    * { box-sizing: border-box; }
    html { scrollbar-gutter: stable; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font: 16px/1.6 "Helvetica Neue", Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-decoration: none; text-underline-offset: 4px; }
    a:hover { text-decoration: underline; }
    main { width: min(1040px, calc(100% - 96px)); margin: 0 auto 80px; }
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px 24px;
      min-height: 104px;
      border-bottom: 1px solid var(--line);
    }
    header > a { display: inline-flex; align-items: center; min-height: 44px; font-size: 14px; }
    header > .wordmark { font-size: 40px; font-weight: 700; line-height: 1; }
    .wordmark:hover { text-decoration: none; }
    .wordmark span { color: inherit; }
    h1 { font-size: 32px; font-weight: 500; line-height: 1.3; margin: 56px 0 0; }
    h2 { font-size: 18px; font-weight: 500; line-height: 1.4; margin: 0 0 12px; }
    .login { max-width: 400px; margin-top: 30px; }
    label { display: block; font-size: 14px; margin-bottom: 8px; }
    input {
      width: 100%;
      min-height: 44px;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 0;
      background: var(--paper);
      color: var(--ink);
      font: inherit;
    }
    button {
      min-height: 44px;
      padding: 8px 16px;
      border: 1px solid var(--ink);
      border-radius: 0;
      background: var(--ink);
      color: var(--paper);
      font: inherit;
      font-size: 14px;
      cursor: pointer;
    }
    button:hover { background: var(--accent); border-color: var(--accent); }
    .login button { margin-top: 16px; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 5px; }
    .logout { margin: 0; }
    .logout button { padding: 8px 0; border: 0; background: transparent; color: var(--ink); }
    .logout button:hover { text-decoration: underline; text-underline-offset: 4px; }
    .error { max-width: 680px; margin: 24px 0; padding-left: 14px; border-left: 2px solid var(--accent); }
    .periods { display: flex; flex-wrap: wrap; gap: 20px; margin: 24px 0 12px; }
    .periods a {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      padding: 8px 0;
      border-bottom: 2px solid transparent;
      font-size: 14px;
    }
    .periods a[aria-current] { border-bottom-color: var(--ink); }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin: 28px 0 38px;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
    }
    .metric { min-width: 0; padding: 24px 16px 24px 0; }
    .metric strong { display: block; font-size: 32px; font-weight: 500; line-height: 1.3; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .metric span { color: var(--muted); font-size: 13px; }
    .tables { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 36px; }
    .panel { min-width: 0; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
    th { padding-bottom: 9px; color: var(--muted); font-size: 13px; font-weight: 400; }
    td { padding: 10px 0; border-top: 1px solid var(--line); overflow-wrap: anywhere; }
    th:last-child, td:last-child { width: 80px; padding-left: 14px; text-align: right; font-variant-numeric: tabular-nums; }
    .empty { margin: 0; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; }
    footer { display: flex; flex-wrap: wrap; align-items: center; gap: 24px; margin-top: 50px; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
    footer a { display: inline-flex; align-items: center; min-height: 44px; }
    .note { margin: 14px 0 0; color: var(--muted); font-size: 13px; }
    .tables + .note { margin-top: 32px; }
    @media (max-width: 720px) {
      main { width: calc(100% - 48px); margin-bottom: 64px; }
      header { min-height: 88px; }
      h1 { margin-top: 44px; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .tables { grid-template-columns: 1fr; }
    }
    @media (max-width: 400px) {
      main { width: calc(100% - 40px); }
      header > .wordmark { font-size: 36px; }
      h1 { font-size: 28px; }
      .metric strong { font-size: 28px; }
    }
  </style>
</head>
<body>
<main>
  <header><a class="wordmark" href="/" aria-label="Ariel Hirschberg, home">ah<span>.</span></a>
  <?php if ($authenticated): ?><form class="logout" method="post"><input type="hidden" name="csrf" value="<?= ah_escape($csrf) ?>"><input type="hidden" name="action" value="logout"><button type="submit">Sign out</button></form><?php else: ?><a href="/">Home</a><?php endif; ?></header>
  <h1>Stats</h1>
  <?php if ($error !== ''): ?><p class="error" role="alert"><?= ah_escape($error) ?></p><?php endif; ?>
  <?php if ($available && !$authenticated): ?>
    <form class="login" method="post">
      <input type="hidden" name="csrf" value="<?= ah_escape($csrf) ?>"><input type="hidden" name="action" value="login">
      <label for="password">Owner password</label><input id="password" type="password" name="password" autocomplete="current-password" maxlength="256" required>
      <button type="submit">Sign in</button>
      <p class="note">Session expires after 30 minutes idle.</p>
    </form>
  <?php elseif ($authenticated): ?>
    <nav class="periods" aria-label="Stats period"><?php foreach ([7,30,90,180] as $period): ?><a href="?days=<?= $period ?>"<?= $period === $days ? ' aria-current="page"' : '' ?>><?= $period ?> days</a><?php endforeach; ?></nav>
    <p class="note">Since <?= ah_escape($start) ?> · <?= ah_escape($config['timezone']) ?></p>
    <section class="metrics" aria-label="Totals">
      <?php foreach (['page_view' => 'Pageviews', 'project_open' => 'Project opens', 'game_start' => 'Game starts', 'project_filter' => 'Filter changes'] as $event => $label): ?><div class="metric"><strong><?= number_format($summary[$event]) ?></strong><span><?= $label ?></span></div><?php endforeach; ?>
    </section>
    <div class="tables"><?php foreach ($tables as $title => $rows): ?><section class="panel"><h2><?= ah_escape($title) ?></h2>
      <?php if (!$rows): ?><p class="empty">No counts in this period.</p><?php else: ?><table><thead><tr><th scope="col"><?= $title === 'Daily pageviews' ? 'Day' : 'Item' ?></th><th scope="col">Count</th></tr></thead><tbody><?php foreach ($rows as $row): ?><tr><td><?= ah_escape($row['label'] === '' ? 'Direct / unknown' : $row['label']) ?></td><td><?= number_format((int) $row['total']) ?></td></tr><?php endforeach; ?></tbody></table><?php endif; ?>
    </section><?php endforeach; ?></div>
    <p class="note">Repeat loads count. Local visits, detected automation, and privacy opt-outs are excluded.</p>
  <?php endif; ?>
  <footer><a href="/privacy.html">Privacy</a><a href="/projects.html">Projects</a></footer>
</main>
</body>
</html>
