import React, { useState, useEffect, useCallback } from 'react';
import { getLeaderboard } from '../api';
import { getSocket } from '../socket';
import StarRating from '../components/StarRating';

export default function Leaderboard({ currentUser, onSelectPeer }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await getLeaderboard();
      setData(res);
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
      setError(err.message || 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();

    const socket = getSocket();
    if (socket) {
      const handleUpdate = () => {
        fetchLeaderboard();
      };
      socket.on('ledger:updated', handleUpdate);
      return () => {
        socket.off('ledger:updated', handleUpdate);
      };
    }
  }, [fetchLeaderboard]);

  if (loading) {
    return (
      <div className="page-container leaderboard-page">
        <div className="skeleton-loading" style={{ height: '80px', marginBottom: '24px' }}></div>
        <div className="skeleton-loading" style={{ height: '320px', marginBottom: '24px' }}></div>
        <div className="skeleton-loading" style={{ height: '300px' }}></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="page-container leaderboard-page">
        <div className="alert-box alert-error" role="alert">
          <h3>Failed to load leaderboard</h3>
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={fetchLeaderboard}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { leaderboard = [], my_rank = null, total_mentors, total_helpers } = data || {};
  const totalRankedMentors = total_mentors !== undefined ? total_mentors : (total_helpers || leaderboard.length);
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  // Dynamic podium ordering based on available count
  let podiumOrder = [];
  if (top3.length === 1) {
    podiumOrder = [{ ...top3[0], place: 1, label: '1st' }];
  } else if (top3.length === 2) {
    podiumOrder = [
      { ...top3[1], place: 2, label: '2nd' },
      { ...top3[0], place: 1, label: '1st' },
    ];
  } else if (top3.length >= 3) {
    podiumOrder = [
      { ...top3[1], place: 2, label: '2nd' },
      { ...top3[0], place: 1, label: '1st' },
      { ...top3[2], place: 3, label: '3rd' },
    ];
  }

  return (
    <div className="page-container leaderboard-page">
      <header className="page-header leaderboard-header">
        <div>
          <div className="header-badge">Community Champions</div>
          <h1 className="page-title">Top Mentors & Helpers</h1>
          <p className="page-subtitle">
            Celebrating our most active knowledge sharers. Ranked by verified sessions completed, average rating, and credits earned.
          </p>
        </div>
        <div className="leaderboard-stat-pill">
          <span className="stat-num">{totalRankedMentors}</span> active {totalRankedMentors === 1 ? 'mentor' : 'mentors'} in community
        </div>
      </header>

      {/* Empty State when 0 ranked mentors */}
      {totalRankedMentors === 0 && (
        <section className="empty-state-box" style={{ padding: '3.5rem 1.5rem', textAlign: 'center', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', marginBottom: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏆</div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>No mentors ranked yet</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
            Be the first to complete a live micro-mentorship session to take the #1 spot on the community leaderboard!
          </p>
        </section>
      )}

      {/* Top 3 Podium (handles 1, 2, or 3 entries) */}
      {top3.length > 0 && (
        <section className="podium-section" aria-label="Top Mentors Podium">
          <div className={`podium-grid podium-count-${podiumOrder.length}`}>
            {podiumOrder.map((user) => {
              const isCurrentUser = currentUser && currentUser.id === user.id;
              const isFirst = user.place === 1;
              return (
                <div
                  key={user.id}
                  className={`podium-card place-${user.place} ${isFirst ? 'podium-winner' : ''} ${isCurrentUser ? 'is-me' : ''}`}
                >
                  <div className="podium-medal">
                    {user.place === 1 && '👑 1st'}
                    {user.place === 2 && '🥈 2nd'}
                    {user.place === 3 && '🥉 3rd'}
                  </div>

                  <div
                    className="podium-avatar"
                    style={{ backgroundColor: user.avatar_color || '#3b82f6' }}
                  >
                    {user.name.charAt(0)}
                  </div>

                  <div className="podium-user-info">
                    <button
                      className="podium-name-btn"
                      onClick={() => onSelectPeer && onSelectPeer(user.id)}
                    >
                      {user.name}
                    </button>
                    <div className="podium-handle">@{user.handle}</div>
                    <div className="podium-badge-tag">{user.badge} (L{user.level})</div>
                  </div>

                  <div className="podium-stats">
                    <div className="p-stat">
                      <span className="p-stat-val">{user.sessions_as_mentor}</span>
                      <span className="p-stat-lbl">sessions</span>
                    </div>
                    <div className="p-stat-divider"></div>
                    <div className="p-stat">
                      <span className="p-stat-val">
                        {user.rating_avg !== null ? `⭐ ${user.rating_avg}` : '—'}
                      </span>
                      <span className="p-stat-lbl">({user.rating_count})</span>
                    </div>
                    <div className="p-stat-divider"></div>
                    <div className="p-stat">
                      <span className="p-stat-val">{user.total_earned} cr</span>
                      <span className="p-stat-lbl">earned</span>
                    </div>
                  </div>

                  {isCurrentUser && (
                    <div className="current-user-tag">You</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Ranks 4-10 Table */}
      {rest.length > 0 && (
        <section className="leaderboard-table-section">
          <h2 className="section-title">Runner Ups (Ranks 4-10)</h2>
          <div className="table-responsive">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Mentor</th>
                  <th>Level & Badge</th>
                  <th>Sessions Completed</th>
                  <th>Rating</th>
                  <th>Total Earned</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((user) => {
                  const isCurrentUser = currentUser && currentUser.id === user.id;
                  return (
                    <tr
                      key={user.id}
                      className={isCurrentUser ? 'row-current-user' : ''}
                    >
                      <td className="cell-rank">#{user.rank}</td>
                      <td>
                        <button
                          className="table-user-btn"
                          onClick={() => onSelectPeer && onSelectPeer(user.id)}
                        >
                          <div
                            className="table-avatar"
                            style={{ backgroundColor: user.avatar_color || '#64748b' }}
                          >
                            {user.name.charAt(0)}
                          </div>
                          <div className="table-user-text">
                            <span className="table-name">{user.name}</span>
                            <span className="table-handle">@{user.handle}</span>
                          </div>
                        </button>
                      </td>
                      <td>
                        <span className="badge-pill">
                          {user.badge} <span className="lvl-sub">L{user.level}</span>
                        </span>
                      </td>
                      <td className="cell-num">
                        <strong>{user.sessions_as_mentor}</strong> sessions
                      </td>
                      <td>
                        {user.rating_avg !== null ? (
                          <div className="rating-cell">
                            <StarRating value={user.rating_avg} readOnly size="sm" />
                            <span className="rating-score">
                              {user.rating_avg} <span className="rating-count">({user.rating_count})</span>
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted">Unrated</span>
                        )}
                      </td>
                      <td className="cell-num">
                        <span className="earned-badge">🪙 {user.total_earned} cr</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Current User Standing Card */}
      {my_rank ? (
        <section className="my-standing-banner">
          <div className="standing-icon">🎯</div>
          <div className="standing-content">
            <div className="standing-title">
              Your Current Standing: <strong>#{my_rank.rank}</strong> out of {totalRankedMentors} mentors
            </div>
            <div className="standing-details">
              You have completed <strong>{my_rank.sessions_as_mentor}</strong> sessions as mentor
              {my_rank.rating_avg !== null ? ` with a ⭐ ${my_rank.rating_avg} average rating.` : '.'}
              {' '}Total mentorship earnings: <strong>{my_rank.total_earned} cr</strong>.
            </div>
          </div>
        </section>
      ) : (
        <section className="my-standing-banner not-ranked">
          <div className="standing-icon">🚀</div>
          <div className="standing-content">
            <div className="standing-title">
              Help your first peer to join the leaderboard
            </div>
            <div className="standing-details">
              Accept mentorship requests on your skills to earn platform credits, collect 5-star reviews, and climb the community ranks!
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
