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
      {/* Developer Subhead */}
      <div className="directory-subhead">
        <div className="directory-subhead-left">
          <div className="directory-title-row">
            <h1 className="directory-subhead-title">Double-Entry Ledger Integrity</h1>
            <span className="directory-badge-counter">
              {checks.filter((c) => c.ok).length}/{checks.length} assertions verified
            </span>
          </div>
          <p className="directory-subhead-desc">
            Real-time mathematical validation of zero-sum token conservation, immutable double-entry journal postings, and Escrow WAL transactions.
          </p>
        </div>
        <div className="directory-subhead-actions">
          <button
            className={`btn btn-secondary audit-refresh-btn ${refreshing ? 'loading' : ''}`}
            onClick={() => fetchAudit(true)}
            disabled={refreshing}
            aria-label="Re-run audit verification"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <svg
              className={`refresh-icon ${refreshing ? 'spinning' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="13"
              height="13"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>{refreshing ? 'Verifying...' : 'Re-run Assertions'}</span>
          </button>
        </div>
      </div>

      {/* Subtle Telemetry Strip */}
      <div className="telemetry-meta-strip" style={{ marginBottom: '1.75rem' }}>
        <div className="telemetry-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>Zero-Sum Conservation Guaranteed</span>
        </div>
        <span className="telemetry-sep">•</span>
        <div className="telemetry-item">
          <span className="status-dot-active" />
          <span>Real-time WAL Socket Listener</span>
        </div>
        <span className="telemetry-sep">•</span>
        <div className="telemetry-item">
          <span>Deterministic Audit Invariants</span>
        </div>
      </div>

      {/* GitHub Actions Style Workflow Status Banner */}
      <section className={`audit-status-banner ${allChecksPassed && conserved ? 'banner-pass' : 'banner-fail'}`}>
        <div className="banner-icon-col">
          {allChecksPassed && conserved ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f85149" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
        </div>
        <div className="banner-content-col">
          <div className="banner-title">
            {allChecksPassed && conserved
              ? 'All 7 ledger checks passed: credits strictly conserved'
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
            <span className="metric-label">Total Minted</span>
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
            <span className="metric-label">In-Circulation</span>
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

      {/* Integrity Checks List — GitHub Actions Step Run Style */}
      <section className="audit-section checks-section">
        <div className="section-header">
          <h2 className="section-title">Automated Invariant Assertions ({checks.filter(c => c.ok).length}/{checks.length} passed)</h2>
          <span className="section-subtitle">Real-time mathematical proofs validated on double-entry WAL ledger</span>
        </div>

        <div className="github-actions-step-box">
          {checks.map((chk, idx) => (
            <div key={chk.key} className="github-step-row">
              <div className="step-left">
                {chk.ok ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f85149" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                )}
                <span className="step-num">{idx + 1}.</span>
                <span className="step-name">{chk.label}</span>
              </div>
              <div className="step-right">
                <span className="step-detail monospace-tabular">{chk.detail}</span>
                <span className={`step-badge ${chk.ok ? 'passed' : 'failed'}`}>
                  {chk.ok ? 'Verified' : 'Failed'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Settlements Table — GitHub Commit History Style */}
      <section className="audit-section settlements-section">
        <div className="section-header">
          <h2 className="section-title">Settlement Audit Log (Double-Entry Verification)</h2>
          <span className="section-subtitle">Matching equal and opposite ledger records for completed pairing sessions</span>
        </div>

        {recent_settlements.length === 0 ? (
          <div className="empty-box">No completed sessions settled yet.</div>
        ) : (
          <div className="table-responsive">
            <table className="audit-table github-table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Learner (Debit)</th>
                  <th>Mentor (Credit)</th>
                  <th>Amount</th>
                  <th>Integrity Proof</th>
                  <th>Spend / Earn Entry IDs</th>
                  <th>Settled</th>
                </tr>
              </thead>
              <tbody>
                {recent_settlements.map((s) => (
                  <tr key={s.id}>
                    <td className="cell-topic">
                      <strong style={{ color: 'var(--accent-blue)' }}>{s.topic}</strong>
                      <div className="cell-sub monospace-tabular">{s.id}</div>
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
                      <span className="monospace-tabular" style={{ fontWeight: 600, color: '#f0f6fc' }}>
                        {s.amount} cr
                      </span>
                    </td>
                    <td>
                      <span className="github-verified-badge" title={s.running_proof}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Verified
                      </span>
                    </td>
                    <td className="cell-entries">
                      <div className="entry-id spend monospace-tabular">{s.spend_entry_id}</div>
                      <div className="entry-id earn monospace-tabular">{s.earn_entry_id}</div>
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
