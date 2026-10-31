import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

const TEST_FILES = [
  'server/tests/db-sanity.js',
  'server/tests/bookings.test.js',
  'server/tests/sockets.test.js',
  'server/tests/profile.test.js',
  'server/tests/room.test.js',
  'server/tests/ledger.test.js',
  'server/tests/slice7.test.js',
  'server/tests/integrity.test.js',
  'server/tests/prod.test.js',
  'server/tests/demo.test.js',
  'server/tests/match.test.js',
];

console.log('🛡️  Running Test Failsafe Verification (FORCE_FAIL=1)\n');

const results = [];
let anyPassedWrongly = false;

for (const relPath of TEST_FILES) {
  const absPath = path.resolve(ROOT_DIR, relPath);
  if (!fs.existsSync(absPath)) {
    // If test is not yet implemented, skip with warning
    results.push({ file: relPath, exitCode: 'N/A', ok: 'NOT FOUND (SKIPPED)' });
    continue;
  }

  const child = spawnSync(process.execPath, [absPath], {
    cwd: ROOT_DIR,
    env: { ...process.env, FORCE_FAIL: '1' },
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  const exitCode = child.status !== null ? child.status : 1;
  const isOk = exitCode !== 0;

  if (!isOk) {
    anyPassedWrongly = true;
  }

  results.push({
    file: relPath,
    exitCode,
    ok: isOk ? 'PASS (Exited Non-Zero)' : 'FAIL (Exited Zero!)',
  });
}

console.log('| Test File | Exit Code | Failsafe Status |');
console.log('| :--- | :---: | :--- |');
for (const r of results) {
  console.log(`| \`${r.file}\` | \`${r.exitCode}\` | ${r.ok} |`);
}

console.log('');
if (anyPassedWrongly) {
  console.error('❌ FAILSAFE CHECK FAILED: One or more tests exited 0 under FORCE_FAIL=1!');
  process.exit(1);
} else {
  console.log('✅ ALL TEST FILES HONORED FORCE_FAIL=1 WITH NON-ZERO EXIT CODES');
  process.exit(0);
}
