import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getUserProfile, getCurrentUserId } from '../api';
import { subscribeToSocketEvent } from '../socket';
import LedgerTable from '../components/LedgerTable';

export default function Profile({ currentProfile }) {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const activeUserId = getCurrentUserId();
  const targetUserId = id || activeUserId;
  const isOwnProfile = !id || id === activeUserId;

  const loadProfile = useCallback(async () => {
    if (!targetUserId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getUserProfile(targetUserId);
      setProfile(data);
    } catch (err) {
      console.error('Failed to load profile:', err);
      setError(err.message || 'User not found');
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Refresh profile on real-time ledger updates
  useEffect(() => {
    const unsub = subscribeToSocketEvent('ledger:updated', () => {
      loadProfile();
    });
    return () => unsub();
  }, [loadProfile]);

  if (loading) {
    return (
      <div className="loading-box">
        <div className="loading-spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="error-box">
        <div className="error-title">Profile Unavailable</div>
        <p>{error || 'User not found.'}</p>
        <Link to="/" className="btn btn-secondary" style={{ marginTop: '1rem', display: 'inline-block' }}>
          Back to Directory
        </Link>
      </div>
    );
  }

  const getBadgeClass = (level) => {
    if (level === 3) return 'badge-level-3';
    if (level === 2) return 'badge-level-2';
    return 'badge-level-1';
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const levelProgress = profile.level_progress;
  const badgeDetails = profile.badge_details || [];

  return (
    <div className="profile-page-container">
      {/* Header Banner */}
      <div className="profile-header-card">
        <div className="profile-header-top">
          <div className="profile-avatar-wrapper">
            <div
              className="profile-avatar-large"
              style={{ backgroundColor: profile.avatar_color }}
            >
              {profile.name.charAt(0)}
            </div>
            {profile.is_online && (
              <span className="online-indicator-large" title="Online now" />
            )}
          </div>

          <div className="profile-identity-main">
            <div className="profile-name-row">
              <h1 className="profile-title">{profile.name}</h1>
              <span className={`badge-pill ${getBadgeClass(profile.level)}`}>
                Lvl {profile.level} • {profile.badge}
              </span>
              {!isOwnProfile && (
                <span className="public-profile-pill">Public Profile</span>
              )}
            </div>
            <div className="profile-handle-sub">@{profile.handle}</div>

            <p className="profile-bio-text">{profile.bio}</p>

            <div className="profile-meta-tags">
              <span className="meta-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
                <span style={{ textTransform: 'capitalize' }}>{profile.experience} Developer</span>
              </span>
              <span className="meta-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>{profile.languages.join(', ')}</span>
              </span>
              <span className="meta-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>Member since {new Date(profile.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Level Progress Bar */}
        {levelProgress && (
          <div className="level-progress-section">
            <div className="level-progress-labels">
              <span className="progress-level-tag">
                Level {levelProgress.level}: {levelProgress.name}
              </span>
              <span className="progress-subtext">
                {levelProgress.level === 3 ? (
                  <span className="max-level-text">★ Maximum Level Achieved (Mentor)</span>
                ) : (
                  <span>
                    <strong>{levelProgress.sessions_to_next}</strong> more {levelProgress.sessions_to_next === 1 ? 'session' : 'sessions'} to {levelProgress.next_name}
                  </span>
                )}
              </span>
            </div>

            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${Math.min(100, Math.max(0, levelProgress.percent))}%` }}
              />
            </div>

            <div className="progress-bar-footer">
              <span>{levelProgress.sessions_as_mentor} mentor {levelProgress.sessions_as_mentor === 1 ? 'session' : 'sessions'} completed</span>
              <span>{levelProgress.percent}% progress</span>
            </div>
          </div>
        )}
      </div>

      {/* Own Profile Stat Cards: Balance, Reserved, Available, Net Earned */}
      {isOwnProfile && (
        <div className="profile-stat-cards-grid">
          <div className="stat-card">
            <div className="stat-card-label">Total Balance</div>
            <div className="stat-card-value text-cyan">
              {profile.balance} <span className="stat-unit">cr</span>
            </div>
            <div className="stat-card-sub">Append-only ledger sum</div>
          </div>

          <div className="stat-card">
            <div className="stat-card-label">Reserved</div>
            <div className="stat-card-value text-amber">
              {profile.reserved_credits || 0} <span className="stat-unit">cr</span>
            </div>
            <div className="stat-card-sub">Held in accepted sessions</div>
          </div>

          <div className="stat-card">
            <div className="stat-card-label">Available to Spend</div>
            <div className="stat-card-value text-green">
              {profile.available_credits} <span className="stat-unit">cr</span>
            </div>
            <div className="stat-card-sub">Balance minus reserved</div>
          </div>

          <div className="stat-card">
            <div className="stat-card-label">Net Earned</div>
            <div className="stat-card-value text-purple">
              +{profile.stats?.total_credits_earned ?? 0} <span className="stat-unit">cr</span>
            </div>
            <div className="stat-card-sub">Mentored sessions & bonuses</div>
          </div>
        </div>
      )}

      {/* Grid: Badges + Stats + Skills/Slots */}
      <div className="profile-body-grid">
        {/* Left Column: Badges & Stats */}
        <div className="profile-col-main">
          {/* Badge Grid */}
          <div className="card profile-card">
            <h3 className="section-heading">
              <span>Achievements & Badges</span>
              <span className="badge-count-pill">
                {badgeDetails.filter((b) => b.earned).length} / {badgeDetails.length} Earned
              </span>
            </h3>

            <div className="badge-details-grid">
              {badgeDetails.map((b) => (
                <div
                  key={b.key}
                  className={`badge-detail-card ${b.earned ? 'earned' : 'locked'}`}
                  title={b.description}
                >
                  <div className="badge-detail-icon" aria-hidden="true">
                    {b.earned ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="7" />
                        <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    )}
                  </div>
                  <div className="badge-detail-info">
                    <div className="badge-detail-name">
                      {b.name}
                      {b.earned && <span className="badge-earned-pill">Earned</span>}
                    </div>
                    <div className="badge-detail-desc">{b.description}</div>
                    <div className="badge-detail-progress">
                      <span className="progress-pill">Progress: {b.progress}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats Block */}
          <div className="card profile-card">
            <h3 className="section-heading">Mentorship Activity</h3>
            <div className="activity-stats-grid">
              <div className="activity-stat-box">
                <span className="activity-stat-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                    <path d="M6 12v5c3 3 9 3 12 0v-5" />
                  </svg>
                </span>
                <span className="activity-stat-num">{profile.stats?.sessions_completed_as_mentor || 0}</span>
                <span className="activity-stat-label">Sessions as Mentor</span>
              </div>

              <div className="activity-stat-box">
                <span className="activity-stat-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </span>
                <span className="activity-stat-num">{profile.stats?.sessions_completed_as_learner || 0}</span>
                <span className="activity-stat-label">Sessions as Learner</span>
              </div>

              <div className="activity-stat-box">
                <span className="activity-stat-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </span>
                <span className="activity-stat-num">
                  {profile.stats?.rating_avg ? `${profile.stats.rating_avg}` : '—'}
                </span>
                <span className="activity-stat-label">
                  Average Rating ({profile.stats?.rating_count || 0})
                </span>
              </div>

              {isOwnProfile && (
                <div className="activity-stat-box">
                  <span className="activity-stat-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M16 8l-8 8M16 16V8H8" />
                    </svg>
                  </span>
                  <span className="activity-stat-num">
                    -{profile.stats?.total_credits_spent || 0} cr
                  </span>
                  <span className="activity-stat-label">Total Credits Spent</span>
                </div>
              )}
            </div>
          </div>

          {/* Ledger Section (Own Profile Only) */}
          {isOwnProfile && (
            <div className="card profile-card">
              <LedgerTable userId={profile.id} />
            </div>
          )}
        </div>

        {/* Right Column: Skills & Availability */}
        <div className="profile-col-side">
          {/* Skills */}
          <div className="card profile-card">
            <h3 className="section-heading">Skills & Topics</h3>
            <div className="chip-group">
              {profile.skills.map((skill) => (
                <span key={skill} className="chip skill-chip">
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Availability Slots */}
          <div className="card profile-card">
            <h3 className="section-heading">Weekly Availability</h3>
            {profile.slots.length === 0 ? (
              <p className="text-muted">No availability slots listed.</p>
            ) : (
              <div className="slots-list">
                {profile.slots.map((slot) => (
                  <div key={slot.id} className="slot-item-badge">
                    <span className="slot-day">{dayNames[slot.day_of_week]}</span>
                    <span className="slot-time">
                      {String(slot.start_hour).padStart(2, '0')}:00 – {String(slot.end_hour).padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
