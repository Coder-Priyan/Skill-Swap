import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const LANG_COLORS = {
  React: '#61dafb',
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  'CSS/UI': '#563d7c',
  'Node.js': '#026e00',
  'System Design': '#8a63d2',
  DSA: '#e34c26',
  Java: '#b07219',
  'SQL/Database Design': '#e38c00',
  'DevOps/Docker': '#384d54',
  Flutter: '#02569B',
  'WebGL/Three.js': '#ff3e00',
  Git: '#f05032',
  'Machine Learning': '#ff6f61',
};

export default function PeerCard({ peer, onBookClick }) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const isLevelIneligible = !peer.can_book && peer.block_reason && peer.block_reason.includes('Mentor level');
  const isSmartMatch = peer.match_score !== undefined;

  const levelLabels = {
    3: 'L3 Senior Mentor',
    2: 'L2 Mid Engineer',
    1: 'L1 Associate Peer',
  };

  return (
    <div className={`peer-card gh-peer-card ${peer.is_online ? 'is-online' : ''} ${isSmartMatch && peer.is_best_match ? 'is-best-match' : ''} ${isLevelIneligible ? 'peer-card-dimmed' : ''}`}>
      {/* Best Match Ribbon / Badge */}
      {isSmartMatch && peer.is_best_match && (
        <div className="best-match-pill gh-best-match-pill" title="Top deterministic match based on technical stack and criteria">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
          </svg>
          <span>Top Match</span>
        </div>
      )}

      {/* Card Header */}
      <div className="peer-card-header">
        <div className="peer-avatar-wrap">
          <div 
            className="peer-avatar gh-avatar" 
            style={{ 
              backgroundColor: peer.avatar_color || '#21262d'
            }}
          >
            {peer.name.charAt(0)}
          </div>
          {peer.is_online && (
            <span className="online-indicator-dot gh-online-dot" title="Active and ready to pair" />
          )}
        </div>

        <div className="peer-identity">
          <div className="peer-identity-top">
            <div className="peer-names-wrap">
              <h3 className="peer-name">
                <Link to={`/users/${peer.id}`} className="peer-name-link gh-name-link" title={`View ${peer.name}'s profile`}>
                  {peer.name}
                </Link>
              </h3>
              <span className="peer-handle gh-handle">@{peer.handle}</span>
            </div>

            {peer.is_online && (
              <span className="gh-badge-active">
                <span className="gh-status-dot-active" />
                <span>Available</span>
              </span>
            )}
          </div>

          <div className="peer-credentials-row">
            <span className={`gh-level-badge level-${peer.level || 1}`}>
              {levelLabels[peer.level] || `Level ${peer.level}`}
            </span>
            <span className="peer-role-text gh-role-text">
              {peer.experience || 'Senior'} Engineer
            </span>
          </div>
        </div>
      </div>

      {/* Smart Match Score Header Bar */}
      {isSmartMatch && (
        <div className="match-score-container gh-match-score-container" aria-label={`Match score: ${peer.match_score}%`}>
          <div className="match-score-row">
            <div className="match-score-badge">
              <span className="match-score-number">{peer.match_score}%</span>
              <span className="match-score-label">match</span>
            </div>
            <div className="match-score-bar-bg" aria-hidden="true">
              <div
                className="match-score-bar-fill gh-match-bar"
                style={{
                  width: `${peer.match_score}%`,
                  background:
                    peer.match_score >= 80 ? '#2ea043' : peer.match_score >= 50 ? '#1f6feb' : '#8b949e',
                }}
              />
            </div>
          </div>

          {/* Reason Chips */}
          {peer.reasons && peer.reasons.length > 0 && (
            <div className="smart-match-reasons-row">
              {peer.reasons.map((reason, idx) => (
                <span
                  key={`${reason.key}-${idx}`}
                  className={`smart-reason-chip ${reason.ok ? 'reason-ok' : 'reason-muted'}`}
                  title={reason.ok ? `Matched: ${reason.label}` : `Unmatched: ${reason.label}`}
                >
                  <span className="reason-icon">{reason.ok ? '✓' : '—'}</span>
                  <span className="reason-text">{reason.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bio Description */}
      <p className="peer-bio gh-bio">{peer.bio}</p>

      {/* Skills Group with genuine GitHub language dots */}
      <div className="peer-skills-section">
        <div className="peer-tag-group gh-lang-group">
          {peer.skills.map((skill) => (
            <span key={skill} className="gh-lang-tag">
              <span 
                className="gh-lang-color-dot" 
                style={{ backgroundColor: LANG_COLORS[skill] || '#8b949e' }} 
              />
              <span>{skill}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Peer Card Footer: Rating, Cost, CTA */}
      <div className="peer-card-footer">
        <div className="peer-meta-left">
          <div className="rating-pill-badge" title={`${peer.rating_count} verified reviews`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="none" className="star-svg">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span className="rating-number">
              {peer.rating_avg !== null ? peer.rating_avg.toFixed(1) : 'New'}
            </span>
            <span className="rating-total">
              {peer.rating_count ? `(${peer.rating_count})` : ''}
            </span>
          </div>

          <div className="peer-rate-chip" title="Escrow rate per 30-minute session">
            <span className="rate-amount monospace-tabular">5 credits</span>
            <span className="rate-time">/ 30m</span>
          </div>
        </div>

        <div className="peer-action-right">
          <button
            type="button"
            className={`btn ${peer.can_book ? 'btn-primary peer-book-btn' : 'btn-secondary btn-restricted'}`}
            disabled={!peer.can_book}
            onClick={() => onBookClick(peer)}
            title={peer.can_book ? `Book 30-min session (5 credits)` : peer.block_reason}
          >
            {peer.can_book ? (
              <>
                <span>Book Session</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="btn-arrow-svg">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="lock-svg">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Restricted</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Non-intrusive Context Hint for Level Ineligibility */}
      {!peer.can_book && peer.block_reason && (
        <div className="peer-lock-hint" title={peer.block_reason}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>{peer.block_reason}</span>
        </div>
      )}

      {/* How is this scored? Expander */}
      {isSmartMatch && (
        <div className="match-breakdown-section">
          <button
            type="button"
            className="btn-breakdown-toggle"
            onClick={() => setShowBreakdown((prev) => !prev)}
            aria-expanded={showBreakdown}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                transform: showBreakdown ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <span>Match breakdown</span>
            <span className="breakdown-score-summary">({peer.match_score}/100)</span>
          </button>

          {showBreakdown && peer.breakdown && (
            <div className="match-breakdown-table-wrap">
              <table className="match-breakdown-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Weight</th>
                    <th>Points</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {peer.breakdown.map((b) => (
                    <tr
                      key={b.key}
                      className={b.ok ? 'row-ok' : b.signaled ? 'row-missed' : 'row-unsignaled'}
                    >
                      <td className="breakdown-label-cell">
                        <span
                          className={`breakdown-dot ${
                            b.ok ? 'dot-green' : b.signaled ? 'dot-red' : 'dot-gray'
                          }`}
                        />
                        {b.label}
                      </td>
                      <td>{b.weight}%</td>
                      <td className="points-cell">
                        <strong>{b.points}</strong>
                      </td>
                      <td className="breakdown-detail-cell">{b.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="breakdown-footer-note">
                Score: round(100 × earned / max {peer.max_possible} signaled points) ={' '}
                <strong>{peer.match_score}%</strong>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
