import express from 'express';
import assert from 'assert';
import { getLedgerForUser, getLedgerTotals, getUserBalance } from '../ledger.js';

const router = express.Router();

/**
 * Middleware: only the user themself can view their own ledger
 * X-User-Id must equal :userId, else 403.
 */
function requireSelf(req, res, next) {
  const currentUserId = req.header('X-User-Id');
  const targetUserId = req.params.userId;

  if (!currentUserId || currentUserId !== targetUserId) {
    return res.status(403).json({ error: 'Forbidden: you can only read your own ledger' });
  }

  next();
}

/**
 * Helper to escape CSV cell values
 */
function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * GET /api/ledger/:userId
 * Response: { entries, totals, balance, count }
 * Balance must equal newest running_balance; asserts and fails loudly if not.
 */
router.get('/:userId', requireSelf, (req, res) => {
  try {
    const { userId } = req.params;
    const { kind, limit = 50, offset = 0 } = req.query;

    const parsedLimit = parseInt(limit, 10) || 50;
    const parsedOffset = parseInt(offset, 10) || 0;

    const { entries, balance, count } = getLedgerForUser(userId, {
      kind,
      limit: parsedLimit,
      offset: parsedOffset,
    });

    const totals = getLedgerTotals(userId);

    // Fail loudly if balance does not equal running balance of newest entry
    const newestCheck = getLedgerForUser(userId, { limit: 1 });
    if (newestCheck.entries.length > 0) {
      assert.strictEqual(
        balance,
        newestCheck.entries[0].running_balance,
        `Integrity error: balance (${balance}) does not match newest running_balance (${newestCheck.entries[0].running_balance})`
      );
    } else {
      assert.strictEqual(
        balance,
        0,
        `Integrity error: empty ledger balance must be 0, got ${balance}`
      );
    }

    res.json({
      entries,
      totals,
      balance,
      count,
    });
  } catch (err) {
    console.error(`Error in GET /api/ledger/${req.params.userId}:`, err);
    if (err instanceof assert.AssertionError) {
      // Re-throw or send 500 so it fails loudly
      return res.status(500).json({ error: `Ledger integrity assertion failed: ${err.message}` });
    }
    res.status(500).json({ error: 'Failed to retrieve ledger' });
  }
});

/**
 * GET /api/ledger/:userId/export.csv
 * Same auth rule (X-User-Id === :userId, else 403).
 * Columns: date, kind, reason, topic, counterpart, delta, running_balance
 */
router.get('/:userId/export.csv', requireSelf, (req, res) => {
  try {
    const { userId } = req.params;
    const { kind } = req.query;

    // Fetch all entries (no limit/offset truncation)
    const { entries } = getLedgerForUser(userId, { kind, limit: 100000, offset: 0 });

    const headers = ['date', 'kind', 'reason', 'topic', 'counterpart', 'delta', 'running_balance'];
    const lines = [headers.join(',')];

    for (const entry of entries) {
      const counterpartName = entry.counterpart ? entry.counterpart.name : '';
      const row = [
        escapeCsv(entry.created_at),
        escapeCsv(entry.kind),
        escapeCsv(entry.reason),
        escapeCsv(entry.topic || ''),
        escapeCsv(counterpartName),
        escapeCsv(entry.delta),
        escapeCsv(entry.running_balance),
      ];
      lines.push(row.join(','));
    }

    const csvContent = lines.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ledger-${userId}.csv"`);
    res.status(200).send(csvContent);
  } catch (err) {
    console.error(`Error in GET /api/ledger/${req.params.userId}/export.csv:`, err);
    res.status(500).json({ error: 'Failed to export ledger to CSV' });
  }
});

export default router;
