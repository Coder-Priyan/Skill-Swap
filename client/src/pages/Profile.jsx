import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getUserProfile, getCurrentUserId } from '../api';

export default function Profile({ currentProfile }) {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const targetUserId = id || currentProfile?.id || getCurrentUserId();

  useEffect(() => {
    if (!targetUserId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    getUserProfile(targetUserId)
      .then((data) => {
        if (isMounted) {
          setProfile(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [targetUserId]);

  if (loading) {
    return (
      <div className="loading-box">
        <div className="loading-spinner"></div>
        <p>Loading user profile...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="error-box">
        <div className="error-title">Profile Unavailable</div>
        <p>{error || 'User not found.'}</p>
      </div>
    );
  }

  const getBadgeClass = (level) => {
    if (level === 3) return 'badge-level-3';
    if (level === 2) return 'badge-level-2';
    return 'badge-level-1';
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">User Profile</h1>
        <p className="page-subtitle">
          Identity, verified mentorship stats, availability, and credit balances.
        </p>
      </div>

      <div className="profile-grid">
        {/* Left Column: Identity */}
        <div className="card user-identity-card">
          <div 
            className="avatar-large" 
            style={{ backgroundColor: profile.avatar_color }}
          >
            {profile.name.charAt(0)}
          </div>
          <h2 className="user-name">{profile.name}</h2>
          <div className="user-handle">@{profile.handle}</div>
          <div className="badge-pill" style={{ marginBottom: '1.25rem' }}>
            <span className={`badge-pill ${getBadgeClass(profile.level)}`}>
              Level {profile.level} • {profile.badge}
            </span>
          </div>
          <p className="user-bio">{profile.bio}</p>

          <div style={{ width: '100%', borderTop: '1px solid var(--border-subtle)', paddingTop: '1.25rem' }}>
            <div className="stat-label">Experience</div>
            <div style={{ textTransform: 'capitalize', fontWeight: 600, marginBottom: '1rem' }}>
              {profile.experience} Developer
            </div>

            <div className="stat-label">Languages</div>
            <div className="chip-group" style={{ justifyContent: 'center' }}>
              {profile.languages.map((lang) => (
                <span key={lang} className="chip">{lang}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Stats & Balances */}
        <div>
          <div className="stat-grid">
            <div className="stat-item">
              <div className="stat-label">Ledger Balance</div>
              <div className="stat-value" style={{ color: 'var(--accent-cyan)' }}>
                {profile.balance} cr
              </div>
            </div>

            <div className="stat-item">
              <div className="stat-label">Available Credits</div>
              <div className="stat-value" style={{ color: 'var(--accent-green)' }}>
                {profile.available_credits} cr
              </div>
            </div>

            <div className="stat-item">
              <div className="stat-label">Mentored Sessions</div>
              <div className="stat-value">
                {profile.stats.sessions_completed_as_mentor}
              </div>
            </div>

            <div className="stat-item">
              <div className="stat-label">Average Rating</div>
              <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>
                {profile.stats.rating_avg ? `★ ${profile.stats.rating_avg}` : 'N/A'}
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Skills & Topics</h3>
            <div className="chip-group">
              {profile.skills.map((skill) => (
                <span key={skill} className="chip" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-active)' }}>
                  {skill}
                </span>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Earned Badges</h3>
            <div className="chip-group">
              {profile.badges.map((b) => (
                <span key={b} className="badge-pill badge-level-2">
                  🏆 {b}
                </span>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Weekly Availability</h3>
            {profile.slots.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No availability slots listed.</p>
            ) : (
              <div className="chip-group">
                {profile.slots.map((slot) => (
                  <span key={slot.id} className="chip">
                    {dayNames[slot.day_of_week]}: {slot.start_hour}:00 - {slot.end_hour}:00
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="placeholder-box" style={{ marginTop: '1.5rem' }}>
            <span className="placeholder-icon">📜</span>
            <h3>Audit-Proof Ledger History</h3>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.4rem', fontSize: '0.9rem' }}>
              Full append-only transaction table with running balance, booking links, and timestamps.
            </p>
            <div className="placeholder-slice-tag">Added in Slice 4 (Ledger module)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
