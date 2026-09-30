<?php
declare(strict_types=1);

require __DIR__ . '/food-tracker-sync-config.php';

// Only the public GitHub app and your local tracker are allowed to call this service.
$allowedOrigins = ['https://seabrig29.github.io', 'http://localhost:4173'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Food-Tracker-Sync-Key');
header('Access-Control-Max-Age: 86400');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function respond(int $status, array $body): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body);
    exit;
}

$providedPassword = $_SERVER['HTTP_X_FOOD_TRACKER_SYNC_KEY'] ?? '';
if ($providedPassword === '' || !hash_equals($syncPassword, $providedPassword)) {
    respond(401, ['error' => 'The sync password was not accepted.']);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!is_file($vaultFile) || !is_readable($vaultFile)) {
        respond(404, ['error' => 'No encrypted cloud history has been saved yet.']);
    }
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    readfile($vaultFile);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['error' => 'Method not allowed.']);
}

$body = file_get_contents('php://input');
if ($body === false || strlen($body) < 50 || strlen($body) > 5242880) {
    respond(400, ['error' => 'The encrypted vault data is invalid or too large.']);
}

try {
    $vault = json_decode($body, true, 32, JSON_THROW_ON_ERROR);
} catch (JsonException $exception) {
    respond(400, ['error' => 'The encrypted vault data is not valid JSON.']);
}

if (!is_array($vault) || ($vault['version'] ?? null) !== 1 || !is_string($vault['salt'] ?? null) || !is_string($vault['iv'] ?? null) || !is_string($vault['ciphertext'] ?? null)) {
    respond(400, ['error' => 'The uploaded data is not a recognized encrypted vault.']);
}

$temporaryFile = $vaultFile . '.uploading';
if (file_put_contents($temporaryFile, $body, LOCK_EX) === false || !rename($temporaryFile, $vaultFile)) {
    @unlink($temporaryFile);
    respond(500, ['error' => 'The server could not save the encrypted cloud history.']);
}

respond(200, ['ok' => true, 'message' => 'Encrypted cloud history saved.']);
