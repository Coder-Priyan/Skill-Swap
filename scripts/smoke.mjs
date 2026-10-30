const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

console.log(`💨 Starting SkillSwap Smoke Test against ${BASE_URL}\n`);

async function runSmoke() {
  let passedCount = 0;

  // 1. GET /api/health
  {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (res.status !== 200) {
      throw new Error(`GET /api/health expected 200, got ${res.status}`);
    }
    const data = await res.json();
    if (data.status !== 'ok') {
      throw new Error(`GET /api/health expected status: 'ok', got ${data.status}`);
    }
    console.log(`[PASS] 1. GET /api/health -> 200 OK (uptime: ${data.uptime}s, service: ${data.service})`);
    passedCount++;
  }

  // 2. GET /api/users/usr_terminaltinkerer as herself (has balance fields)
  {
    const res = await fetch(`${BASE_URL}/api/users/usr_terminaltinkerer`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    if (res.status !== 200) {
      throw new Error(`GET /api/users/usr_terminaltinkerer (self) expected 200, got ${res.status}`);
    }
    const user = await res.json();
    if (typeof user.balance !== 'number' || typeof user.available_credits !== 'number') {
      throw new Error(`Self profile missing private balance fields: ${JSON.stringify(user)}`);
    }
    console.log(`[PASS] 2. GET /api/users/usr_terminaltinkerer (as herself) -> 200 OK (balance: ${user.balance} cr, available: ${user.available_credits} cr)`);
    passedCount++;
  }

  // 3. GET /api/users/usr_terminaltinkerer as usr_pixelpriya (has NO balance fields)
  {
    const res = await fetch(`${BASE_URL}/api/users/usr_terminaltinkerer`, {
      headers: { 'X-User-Id': 'usr_pixelpriya' },
    });
    if (res.status !== 200) {
      throw new Error(`GET /api/users/usr_terminaltinkerer (other) expected 200, got ${res.status}`);
    }
    const user = await res.json();
    if (user.balance !== undefined || user.available_credits !== undefined || user.reserved_credits !== undefined) {
      throw new Error(`Other user's profile leaked balance fields: ${JSON.stringify(user)}`);
    }
    console.log(`[PASS] 3. GET /api/users/usr_terminaltinkerer (as Priya) -> 200 OK (credit privacy preserved: 0 balance fields leaked)`);
    passedCount++;
  }

  // 4. GET /api/ledger/usr_terminaltinkerer as herself -> returns { entries, totals, balance, count } and entries[0].running_balance === balance
  {
    const res = await fetch(`${BASE_URL}/api/ledger/usr_terminaltinkerer`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    if (res.status !== 200) {
      throw new Error(`GET /api/ledger/usr_terminaltinkerer expected 200, got ${res.status}`);
    }
    const ledger = await res.json();
    if (!Array.isArray(ledger.entries) || !ledger.totals || typeof ledger.balance !== 'number' || typeof ledger.count !== 'number') {
      throw new Error(`Ledger response missing expected keys: ${JSON.stringify(Object.keys(ledger))}`);
    }
    if (ledger.entries.length === 0) {
      throw new Error('Ledger entries array is empty');
    }
    if (ledger.entries[0].running_balance !== ledger.balance) {
      throw new Error(`Newest entry running_balance (${ledger.entries[0].running_balance}) does not equal balance (${ledger.balance})`);
    }
    console.log(`[PASS] 4. GET /api/ledger/usr_terminaltinkerer (as herself) -> 200 OK (balance: ${ledger.balance} cr, ${ledger.count} entries, newest running_balance: ${ledger.entries[0].running_balance} cr)`);
    passedCount++;
  }

  // 5. GET /api/ledger/usr_terminaltinkerer as usr_pixelpriya -> gives 403
  {
    const res = await fetch(`${BASE_URL}/api/ledger/usr_terminaltinkerer`, {
      headers: { 'X-User-Id': 'usr_pixelpriya' },
    });
    if (res.status !== 403) {
      throw new Error(`Accessing another user's ledger expected 403 Forbidden, got ${res.status}`);
    }
    console.log(`[PASS] 5. GET /api/ledger/usr_terminaltinkerer (as Priya) -> 403 Forbidden (cross-user ledger access blocked)`);
    passedCount++;
  }

  // 6. GET /api/audit -> conserved true and every check ok
  {
    const res = await fetch(`${BASE_URL}/api/audit`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    if (res.status !== 200) {
      throw new Error(`GET /api/audit expected 200, got ${res.status}`);
    }
    const audit = await res.json();
    if (audit.conserved !== true) {
      throw new Error(`Audit conserved expected true, got ${audit.conserved}`);
    }
    if (!Array.isArray(audit.checks) || audit.checks.length === 0) {
      throw new Error('Audit checks array is missing or empty');
    }
    const failing = audit.checks.filter((c) => !c.ok);
    if (failing.length > 0) {
      throw new Error(`Audit checks failed: ${JSON.stringify(failing)}`);
    }
    console.log(`[PASS] 6. GET /api/audit -> 200 OK (conserved: true, ${audit.checks.length}/${audit.checks.length} integrity checks passing, minted: ${audit.minted.total} cr, in_circulation: ${audit.in_balances_total} cr)`);
    passedCount++;
  }

  // 7. GET /api/leaderboard -> rows all have sessions_as_mentor >= 1 and no balance fields
  {
    const res = await fetch(`${BASE_URL}/api/leaderboard`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    if (res.status !== 200) {
      throw new Error(`GET /api/leaderboard expected 200, got ${res.status}`);
    }
    const lb = await res.json();
    if (!Array.isArray(lb.leaderboard) || lb.leaderboard.length === 0) {
      throw new Error('Leaderboard returned empty array');
    }
    for (const m of lb.leaderboard) {
      if (typeof m.sessions_as_mentor !== 'number' || m.sessions_as_mentor < 1) {
        throw new Error(`Leaderboard row has < 1 session: ${JSON.stringify(m)}`);
      }
    }
    const lbStr = JSON.stringify(lb);
    if (lbStr.includes('"balance":') || lbStr.includes('"available_credits":') || lbStr.includes('"reserved_credits":')) {
      throw new Error('Leaderboard leaked balance fields');
    }
    console.log(`[PASS] 7. GET /api/leaderboard -> 200 OK (${lb.leaderboard.length} ranked mentors, all sessions >= 1, 0 balance leaks)`);
    passedCount++;
  }

  // 8. GET /api/peers as Tanvi returns 13 peers
  {
    const res = await fetch(`${BASE_URL}/api/peers`, {
      headers: { 'X-User-Id': 'usr_terminaltinkerer' },
    });
    if (res.status !== 200) {
      throw new Error(`GET /api/peers expected 200, got ${res.status}`);
    }
    const peersData = await res.json();
    const peers = Array.isArray(peersData) ? peersData : peersData.peers;
    if (!Array.isArray(peers) || peers.length !== 13) {
      throw new Error(`GET /api/peers as Tanvi expected 13 peers, got ${peers ? peers.length : 'undefined'}`);
    }
    console.log(`[PASS] 8. GET /api/peers (as Tanvi) -> 200 OK (returned exactly 13 peers, self excluded)`);
    passedCount++;
  }

  console.log(`\n🎉 ALL ${passedCount}/8 SMOKE ASSERTIONS PASSED!`);
}

runSmoke().catch((err) => {
  console.error('\n❌ SMOKE TEST FAILED:', err.message);
  process.exit(1);
});
