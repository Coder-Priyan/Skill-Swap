import assert from 'assert';
import { createDatabase, initSchemaForDb } from '../src/db.js';
import { runSeed } from '../src/seed.js';
import { checkIntegrity } from '../src/ledger.js';

async function main() {
  console.log('🧪 Starting checkIntegrity Clean & Corruption Test...');

  // 1. Clean Seed Verification
  const testDb = await createDatabase(':memory:');
  initSchemaForDb(testDb);
  runSeed(testDb);

  const cleanResult = checkIntegrity(testDb);
  console.log(`Clean seed checkIntegrity.ok: ${cleanResult.ok}`);
  console.log(`Clean seed conserved: ${cleanResult.conserved}`);
  console.log(`Clean seed checks count: ${cleanResult.checks.length}`);
  for (const c of cleanResult.checks) {
    console.log(`  ✓ [${c.key}] ${c.label}: ${c.ok ? 'PASS' : 'FAIL'} (${c.detail})`);
  }
  assert.strictEqual(cleanResult.ok, true, 'Clean seed should pass all integrity checks');
  assert.strictEqual(cleanResult.conserved, true, 'Clean seed credits should be strictly conserved');

  // 2. Intentional Corruption: Insert a spend dated BEFORE the user grant
  console.log('\n--- Injecting intentional historical negative balance corruption ---');
  testDb.prepare(`
    INSERT INTO ledger_entries (id, user_id, delta, kind, reason, booking_id, created_at)
    VALUES ('corrupt_early_spend', 'usr_terminaltinkerer', -5, 'session_spend', 'Corrupt pre-grant spend', null, '2025-12-01T00:00:00.000Z')
  `).run();

  const corruptResult = checkIntegrity(testDb);
  console.log(`Corrupted DB checkIntegrity.ok: ${corruptResult.ok}`);
  const failedChecks = corruptResult.checks.filter(c => !c.ok);
  console.log(`Number of failed checks: ${failedChecks.length}`);
  for (const fc of failedChecks) {
    console.log(`  ✗ [${fc.key}] ${fc.label}: FAIL -> ${fc.detail}`);
  }

  assert.strictEqual(corruptResult.ok, false, 'Corrupted database must fail integrity check');
  const historicalCheck = corruptResult.checks.find(c => c.key === 'no_historical_negative_balance');
  assert.strictEqual(historicalCheck.ok, false, 'no_historical_negative_balance must be false when spend precedes grant');

  testDb.close();
  console.log('\n🎉 ALL INTEGRITY CORRUPTION ASSERTIONS PASSED!');
}

main().catch((err) => {
  console.error('Integrity test failed:', err);
  process.exit(1);
});
