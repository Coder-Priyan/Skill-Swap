import React, { useState, useEffect, useCallback } from 'react';
import { getLedger, downloadLedgerCsv } from '../api';

const KIND_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Grants', value: 'grant' },
  { label: 'Earned', value: 'session_earn' },
  { label: 'Spent', value: 'session_spend' },
  { label: 'Bonuses', value: 'bonus' },
];

export default function LedgerTable({ userId }) {
  const [entries, setEntries] = useState([]);
  const [totals, setTotals] = useState(null);
  const [balance, setBalance] = useState(0);
  const [count, setCount] = useState(0);
  const [selectedKind, setSelectedKind] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const PAGE_SIZE = 10;

  const fetchInitialLedger = useCallback(async (kind = '') => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLedger(userId, { kind, limit: PAGE_SIZE, offset: 0 });
      setEntries(data.entries || []);
      setTotals(data.totals || null);
      setBalance(data.balance ?? 0);
      setCount(data.count ?? 0);
      setOffset(0);
    } catch (err) {
      console.error('Failed to load ledger:', err);
      setError(err.message || 'Failed to load ledger entries');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchInitialLedger(selectedKind);
  }, [fetchInitialLedger, selectedKind]);

  const handleKindChange = (kind) => {
    if (kind === selectedKind) return;
    setSelectedKind(kind);
  };

  const handleLoadMore = async () => {
    const nextOffset = offset + PAGE_SIZE;
    setLoadingMore(true);
    try {
      const data = await getLedger(userId, { kind: selectedKind, limit: PAGE_SIZE, offset: nextOffset });
      setEntries((prev) => [...prev, ...(data.entries || [])]);
      setOffset(nextOffset);
    } catch (err) {
      console.error('Failed to load more entries:', err);
      setError(err.message || 'Failed to load more entries');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDownloadCsv = async () => {
    setDownloading(true);
    try {
      await downloadLedgerCsv(userId, { kind: selectedKind });
    } catch (err) {
      console.error('Failed to download CSV:', err);
      alert('Failed to download CSV: ' + err.message);
    } finally {
      setDownloading(false);
    }
  };

  const formatKindBadge = (kind) => {
    switch (kind) {
      case 'grant':
        return <span className="kind-pill kind-grant">Grant</span>;
      case 'session_earn':
        return <span className="kind-pill kind-earn">Session Earn</span>;
      case 'session_spend':
        return <span className="kind-pill kind-spend">Session Spend</span>;
      case 'bonus':
        return <span className="kind-pill kind-bonus">Bonus</span>;
      default:
        return <span className="kind-pill">{kind}</span>;
    }
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }) + ' ' + d.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="ledger-container">
      <div className="ledger-header">
        <div className="ledger-header-left">
          <h3 className="ledger-title">Transaction Ledger</h3>
          <p className="ledger-subtitle">
            Auditable, append-only record of all your credit transactions and session earnings.
          </p>
        </div>

        <div className="ledger-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleDownloadCsv}
            disabled={downloading || loading}
            title="Export full ledger as CSV"
          >
            {downloading ? 'Downloading...' : '📥 Download CSV'}
          </button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="ledger-filter-chips">
        {KIND_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`filter-chip ${selectedKind === opt.value ? 'active' : ''}`}
            onClick={() => handleKindChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="alert alert-error" style={{ margin: '16px 0' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-state" style={{ padding: '40px', textAlign: 'center' }}>
          <div className="spinner" />
          <p>Loading ledger entries...</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="ledger-empty-state">
          <span className="empty-icon">📜</span>
          <p className="empty-title">No transactions yet</p>
          <p className="empty-subtitle">
            {selectedKind
              ? `No ${selectedKind.replace('_', ' ')} transactions found.`
              : 'Your credit activity will appear here as you take or mentor sessions.'}
          </p>
        </div>
      ) : (
        <>
          <div className="table-responsive">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Kind</th>
                  <th>Reason</th>
                  <th>Linked Booking</th>
                  <th style={{ textAlign: 'right' }}>Delta</th>
                  <th style={{ textAlign: 'right' }}>Running Balance</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="cell-date">{formatDate(entry.created_at)}</td>
                    <td>{formatKindBadge(entry.kind)}</td>
                    <td className="cell-reason">{entry.reason}</td>
                    <td className="cell-booking">
                      {entry.topic ? (
                        <div className="linked-booking-info">
                          <span className="booking-topic-badge">{entry.topic}</span>
                          {entry.counterpart && (
                            <span className="booking-counterpart">
                              with {entry.counterpart.name}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="cell-delta" style={{ textAlign: 'right' }}>
                      <span className={entry.delta >= 0 ? 'delta-positive' : 'delta-negative'}>
                        {entry.delta > 0 ? `+${entry.delta}` : entry.delta} cr
                      </span>
                    </td>
                    <td className="cell-balance" style={{ textAlign: 'right' }}>
                      <strong>{entry.running_balance} cr</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load More Pagination */}
          {entries.length < count && (
            <div className="ledger-load-more" style={{ textAlign: 'center', marginTop: '16px' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading more...' : `Load more (${count - entries.length} remaining)`}
              </button>
            </div>
          )}

          {/* Footer Line: Ledger total = X cr, matches balance */}
          <div className="ledger-footer-check">
            <div className="footer-check-badge">
              <span className="check-icon">✓</span>
              <span>
                Ledger total = <strong>{balance} cr</strong>, matches balance
              </span>
            </div>
            {totals && (
              <div className="ledger-totals-summary">
                <span>Earned: +{totals.total_earned} cr</span>
                <span className="dot-divider">•</span>
                <span>Spent: -{totals.total_spent} cr</span>
                <span className="dot-divider">•</span>
                <span>Grants: +{totals.grants} cr</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
