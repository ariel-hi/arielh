<?php
declare(strict_types=1);

// Copy to config.php on the server. Keep this directory denied to HTTP requests.
// Generate a password hash using PHP's password_hash(); never put a password here.
// Enable only after confirming PHP/PDO SQLite and the private directory's HTTP 403.
return [
    'enabled' => false,
    'password_hash' => '',
    'timezone' => 'America/Los_Angeles',
    'retention_days' => 180,
];
