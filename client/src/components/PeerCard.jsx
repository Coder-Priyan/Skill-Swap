import React from 'react';
import { Link } from 'react-router-dom';

export default function PeerCard({ peer, onBookClick }) {
  const getBadgeClass = (level) => {
    if (level === 3) return 'badge-level-3';
    if (level === 2) return 'badge-level-2';
    return 'badge-level-1';
  };

  const isHigher = peer.level_relation === 'higher';
  const isSame = peer.level_relation === 'same';

  const getLanguageColor = (skill = '') => {
    const s = skill.toLowerCase();
    if (s.includes('script') && s.includes('type')) return '#3178c6';
    if (s.includes('script') || s.includes('js')) return '#f1e05a';
    if (s.includes('python')) return '#3572A5';
    if (s.includes('react')) return '#61dafb';
    if (s.includes('node')) return '#339933';
    if (s.includes('css') || s.includes('html')) return '#e34c26';
    return '#58a6ff';
  };

  const primarySkill = peer.skills && peer.skills[0] ? peer.skills[0] : 'Engineering';
  const langColor = getLanguageColor(primarySkill);

  return (
    <div className={`peer-card ${peer.is_online ? 'is-online' : ''}`}>
      {/* Top Header Row */}
      <div className="peer-card-header">
        <div className="peer-avatar-wrap">
          <div 
            className="peer-avatar" 
            style={{ backgroundColor: peer.avatar_color }}
          >
            {peer.name.charAt(0)}
          </div>
          {peer.is_online && (
            <span className="peer-online-pulse" title="Online and active now" />
          )}
        </div>

        <div className="peer-identity">
          <div className="peer-name-row">
            <h3 className="peer-name">
              <Link to={`/users/${peer.id}`} className="peer-name-link" title={`View ${peer.name}'s profile`}>
                {peer.name}
              </Link>
            </h3>
            <span className="peer-handle">@{peer.handle}</span>
            {peer.is_online && (
              <span className="online-tag">Online</span>
            )}
          </div>
        </div>

        <div className="peer-badges-stack">
          <span className="level-relation-tag" style={{ textTransform: 'capitalize' }}>
            {peer.experience || 'Senior'} Engineer
          </span>
          {isHigher && (
            <span className="level-relation-tag tag-higher" title="Higher level than you">
              ▲ L{peer.level}
            </span>
          )}
        </div>
      </div>

      {/* Bio Description */}
      <p className="peer-bio">{peer.bio}</p>

      {/* Skills / Topics */}
      <div className="peer-skills-section">
        <div className="peer-tag-group">
          {peer.skills.map((skill) => (
            <span key={skill} className="peer-skill-tag">
              {skill}
            </span>
          ))}
        </div>
      </div>

      {/* GitHub Repo Card Footer: Language Dot, Rating, CTA */}
      <div className="peer-card-footer">
        <div className="peer-rating-block">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span 
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: langColor,
                display: 'inline-block'
              }} 
            />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {primarySkill}
            </span>
          </div>

          <div className="rating-stars-row">
            <span className="star-icon">★</span>
            <span className="rating-number">
              {peer.rating_avg !== null ? peer.rating_avg.toFixed(1) : 'New'}
            </span>
            <span className="rating-total">({peer.rating_count})</span>
          </div>
        </div>

        <button
          type="button"
          className={`btn ${peer.can_book ? 'btn-secondary' : 'btn-disabled'} peer-book-btn`}
          disabled={!peer.can_book}
          onClick={() => onBookClick(peer)}
          title={peer.can_book ? `Book 30-min session (5 credits)` : peer.block_reason}
        >
          {peer.can_book ? 'Request Session' : 'Unavailable'}
        </button>
      </div>

      {/* Subtle Integrated Block Reason (When Cannot Book) */}
      {!peer.can_book && peer.block_reason && (
        <div className="peer-lock-notice" title={peer.block_reason} style={{ marginTop: '8px', fontSize: '12px', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>{peer.block_reason}</span>
        </div>
      )}
    </div>
  );
}
