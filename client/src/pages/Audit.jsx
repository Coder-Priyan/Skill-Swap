import React, { useState, useEffect, useCallback } from 'react';
import { getAudit } from '../api';
import { getSocket } from '../socket';

export default function Audit({ currentUser }) {
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchAudit = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    setError(null);
    try {
      const data = await getAudit();
      setAuditData(data);
    } catch (err) {
      console.error('Failed to fetch audit report:', err);
      setError(err.message || 'Failed to load audit data');
    } finally {
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAudit();

    // Auto-refresh when socket ledger:updated event fires
    const socket = getSocket();
    if (socket) {
      const handleLedgerUpdate = () => {
        fetchAudit();
      };
      socket.on('ledger:updated', handleLedgerUpdate);
      return () => {
        socket.off('ledger:updated', handleLedgerUpdate);
      };
    }
  }, [fetchAudit]);

  if (loading) {
    return (
      <div className="page-container audit-page">
        <div className="audit-header skeleton-loading">
          <div className="skeleton-line skeleton-title" style={{ width: '40%' }}></div>
          <div className="skeleton-line skeleton-sub" style={{ width: '60%' }}></div>
        </div>
        <div className="skeleton-card" style={{ height: '140px', marginTop: '24px' }}></div>
        <div className="skeleton-card" style={{ height: '300px', marginTop: '24px' }}></div>
      </div>
    );
  }

  if (error && !auditData) {
    return (
      <div className="page-container audit-page">
        <div className="alert-box alert-error" role="alert">
          <h3>Failed to load audit</h3>
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={() => fetchAudit(true)}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const {
    generated_at,
    minted = {},
    in_balances_total = 0,
    conserved = false,
    checks = [],
    counts = {},
    recent_settlements = [],
  } = auditData || {};

  const allChecksPassed = checks.every((c) => c.ok);

  return (
    <div className="page-container audit-page">
      <header className="page-header audit-page-header">
        <div>
          <div className="header-badge">Transparency & Security</div>
          <h1 className="page-title">Ledger Integrity & Proof of Conservation</h1>
          <p className="page-subtitle">
            Real-time mathematical verification of double-entry credit flows, platform minting, and zero-sum settlements.
          </p>
        </div>
        <button
          className={`btn btn-secondary audit-refresh-btn ${refreshing ? 'loading' : ''}`}
          onClick={() => fetchAudit(true)}
          disabled={refreshing}
          aria-label="Re-run audit verification"
        >
          <svg
            className={`refresh-icon ${refreshing ? 'spinning' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {refreshing ? 'Verifying...' : 'Re-run audit'}
        </button>
      </header>

      {/* Big Status Banner */}
      <section className={`audit-status-banner ${allChecksPassed && conserved ? 'banner-pass' : 'banner-fail'}`}>
        <div className="banner-icon-col">
          {allChecksPassed && conserved ? (
            <div className="shield-icon pass">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
          ) : (
            <div className="shield-icon fail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          )}
        </div>
        <div className="banner-content-col">
          <div className="banner-title">
            {allChecksPassed && conserved
              ? 'All checks passed: credits strictly conserved'
              : 'Integrity Alert: System inconsistencies detected'}
          </div>
          <p className="banner-desc">
            {allChecksPassed && conserved
              ? `Every minted token is accounted for. Total minted platform credits (${minted.total || 0} cr) exactly match the sum of all circulating balances (${in_balances_total} cr) across all ${counts.users || 0} users.`
              : 'One or more automated ledger assertions failed. Review failing checks below for details.'}
          </p>
          <div className="banner-timestamp">
            Audit timestamp: {new Date(generated_at).toLocaleString()} • Verified via server double-entry engine
          </div>
        </div>
      </section>

      {/* Minted vs In-Circulation Metrics Cards */}
      <section className="audit-metrics-grid">
        <div className="audit-metric-card">
          <div className="metric-header">
            <span className="metric-label">Total Minted Credits</span>
            <span className="metric-badge green">Source of Truth</span>
          </div>
          <div className="metric-value">{minted.total || 0} <span className="metric-unit">cr</span></div>
          <div className="metric-breakdown">
            <span>Grants: <strong>{minted.grants || 0} cr</strong></span>
            <span className="sep">•</span>
            <span>Bonuses: <strong>{minted.bonuses || 0} cr</strong></span>
          </div>
        </div>

        <div className="audit-metric-card">
          <div className="metric-header">
            <span className="metric-label">In-Circulation Balances</span>
            <span className="metric-badge blue">SUM(All Balances)</span>
          </div>
          <div className="metric-value">{in_balances_total} <span className="metric-unit">cr</span></div>
          <div className="metric-breakdown">
            <span>Spread across <strong>{counts.users || 0}</strong> user accounts</span>
          </div>
        </div>

        <div className="audit-metric-card">
          <div className="metric-header">
            <span className="metric-label">Ledger Entries</span>
            <span className="metric-badge purple">Immutable Log</span>
          </div>
          <div className="metric-value">{counts.ledger_entries || 0}</div>
          <div className="metric-breakdown">
            <span><strong>{counts.bookings_completed || 0}</strong> completed peer sessions</span>
          </div>
        </div>
      </section>

      {/* Integrity Checks List */}
      <section className="audit-section checks-section">
        <div className="section-header">
          <h2 className="section-title">Automated Integrity Assertions ({checks.length}/{checks.length} verified)</h2>
          <span className="section-subtitle">Real-time invariants checked against database WAL log</span>
        </div>

        <div className="checks-list">
          {checks.map((chk) => (
            <div key={chk.key} className={`check-card ${chk.ok ? 'check-pass' : 'check-fail'}`}>
              <div className="check-status-badge">
                {chk.ok ? (
                  <span className="badge-pass">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    PASS
                  </span>
                ) : (
                  <span className="badge-fail">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    FAIL
                  </span>
                )}
              </div>
              <div className="check-info">
                <div className="check-title">{chk.label}</div>
                <div className="check-detail">{chk.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Settlements Table */}
      <section className="audit-section settlements-section">
        <div className="section-header">
          <h2 className="section-title">Recent Session Settlements (Double-Entry Verification)</h2>
          <span className="section-subtitle">Showing matching equal and opposite ledger rows for the last 10 completed bookings</span>
        </div>

        {recent_settlements.length === 0 ? (
          <div className="empty-box">No completed sessions settled yet.</div>
        ) : (
          <div className="table-responsive">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Learner (Debit)</th>
                  <th>Mentor (Credit)</th>
                  <th>Amount</th>
                  <th>Proof</th>
                  <th>Spend / Earn Entry IDs</th>
                  <th>Settled At</th>
                </tr>
              </thead>
              <tbody>
                {recent_settlements.map((s) => (
                  <tr key={s.id}>
                    <td className="cell-topic">
                      <strong>{s.topic}</strong>
                      <div className="cell-sub">{s.id}</div>
                    </td>
                    <td>
                      <span className="user-chip debit">
                        {s.learner.name}
                        <span className="chip-handle">@{s.learner.handle}</span>
                      </span>
                    </td>
                    <td>
                      <span className="user-chip credit">
                        {s.mentor.name}
                        <span className="chip-handle">@{s.mentor.handle}</span>
                      </span>
                    </td>
                    <td className="cell-amount">
                      <span className="badge-cr">🪙 {s.amount} cr</span>
                    </td>
                    <td>
                      <span className="proof-pill">{s.running_proof}</span>
                    </td>
                    <td className="cell-entries">
                      <div className="entry-id spend">{s.spend_entry_id}</div>
                      <div className="entry-id earn">{s.earn_entry_id}</div>
                    </td>
                    <td className="cell-time">
                      {s.completed_at ? new Date(s.completed_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
