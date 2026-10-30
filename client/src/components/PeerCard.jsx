import React from 'react';

export default function PeerCard({ peer, onBookClick }) {
  const getBadgeClass = (level) => {
    if (level === 3) return 'badge-level-3';
    if (level === 2) return 'badge-level-2';
    return 'badge-level-1';
  };

  const isHigher = peer.level_relation === 'higher';
  const isSame = peer.level_relation === 'same';

  return (
    <div className={`card peer-card ${peer.is_online ? 'peer-online-highlight' : ''}`}>
      {/* Header: Avatar, Name, Handle, Online Status, Level Badge */}
      <div className="peer-card-header">
        <div className="peer-avatar-wrap">
          <div 
            className="peer-avatar" 
            style={{ backgroundColor: peer.avatar_color }}
          >
            {peer.name.charAt(0)}
          </div>
          {peer.is_online && (
            <span className="online-indicator-dot" title="Online now" />
          )}
        </div>

        <div className="peer-identity">
          <div className="peer-name-row">
            <h3 className="peer-name">{peer.name}</h3>
            {peer.is_online && (
              <span className="online-text-tag">Online</span>
            )}
          </div>
          <div className="peer-handle">@{peer.handle}</div>
        </div>

        <div className="peer-badges-stack">
          <span className={`badge-pill ${getBadgeClass(peer.level)}`}>
            Lvl {peer.level} • {peer.badge}
          </span>
          {isHigher && (
            <span className="level-relation-tag tag-higher">
              ▲ Higher level
            </span>
          )}
          {isSame && (
            <span className="level-relation-tag tag-same">
              ● Same level
            </span>
          )}
        </div>
      </div>

      {/* Bio */}
      <p className="peer-bio">{peer.bio}</p>

      {/* Skills Chips */}
      <div className="peer-section">
        <div className="section-label">Skills</div>
        <div className="chip-group">
          {peer.skills.map((skill) => (
            <span key={skill} className="chip skill-chip">
              {skill}
            </span>
          ))}
        </div>
      </div>

      {/* Languages & Slots */}
      <div className="peer-meta-row">
        <div className="meta-col">
          <div className="section-label">Languages</div>
          <div className="meta-text">{peer.languages.join(', ')}</div>
        </div>

        <div className="meta-col">
          <div className="section-label">Next Available</div>
          <div className="meta-slot-chip">
            📅 {peer.next_slot_label || 'Check calendar'}
          </div>
        </div>
      </div>

      {/* Footer: Rating, Mentored count, Book Button */}
      <div className="peer-card-footer">
        <div className="peer-stats-col">
          <div className="peer-rating-wrap">
            <span className="rating-star">★</span>
            <span className="rating-val">
              {peer.rating_avg !== null ? peer.rating_avg.toFixed(1) : 'New'}
            </span>
            <span className="rating-count">({peer.rating_count})</span>
          </div>
          <div className="mentored-sessions-count">
            {peer.sessions_completed_as_mentor} {peer.sessions_completed_as_mentor === 1 ? 'session' : 'sessions'} mentored
          </div>
        </div>

        <div className="peer-action-col">
          <button
            type="button"
            className={`btn ${peer.can_book ? 'btn-primary' : 'btn-disabled'}`}
            disabled={!peer.can_book}
            onClick={() => onBookClick(peer)}
            title={peer.can_book ? `Book 30-min session (5 credits)` : peer.block_reason}
          >
            {peer.can_book ? 'Book Session' : 'Unavailable'}
          </button>
        </div>
      </div>

      {/* Block reason message when booking is ineligible */}
      {!peer.can_book && peer.block_reason && (
        <div className="peer-block-reason">
          ⚠️ {peer.block_reason}
        </div>
      )}
    </div>
  );
}
