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
          <h1 className="page-title">Top Mentors & Helpers</h1>
          <p className="page-subtitle">
            Ranked by verified sessions completed, average rating, and credits earned.
          </p>
        </div>
        <div className="leaderboard-stat-pill">
          <span className="stat-num">{totalRankedMentors}</span> active {totalRankedMentors === 1 ? 'mentor' : 'mentors'} in community
        </div>
      </header>

      {/* Empty State when 0 ranked mentors */}
      {totalRankedMentors === 0 && (
        <section className="empty-state-box">
          <div className="empty-state-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.45 1-1 1H7v4h10v-4h-2c-.55 0-1-.45-1-1v-2.34c3.48-.63 6-3.64 6-7.23V4H4v5.43c0 3.59 2.52 6.6 6 7.23z" />
            </svg>
          </div>
          <h3 className="empty-state-title">No mentors ranked yet</h3>
          <p className="empty-state-desc">
            Complete a live micro-mentorship session to earn platform credits and take the #1 spot on the community leaderboard.
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
                    {user.place === 1 && (
                      <span className="rank-badge rank-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ marginRight: '4px' }}>
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        #1 Rank
                      </span>
                    )}
                    {user.place === 2 && <span className="rank-badge rank-2">#2 Rank</span>}
                    {user.place === 3 && <span className="rank-badge rank-3">#3 Rank</span>}
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
                        {user.rating_avg !== null ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                            {user.rating_avg}
                          </span>
                        ) : '—'}
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
                        <span className="earned-badge">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 6v12M8 10h8M8 14h6" />
                          </svg>
                          {user.total_earned} cr
                        </span>
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
          <div className="standing-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          </div>
          <div className="standing-content">
            <div className="standing-title">
              Your Current Standing: <strong>#{my_rank.rank}</strong> out of {totalRankedMentors} mentors
            </div>
            <div className="standing-details">
              You have completed <strong>{my_rank.sessions_as_mentor}</strong> sessions as mentor
              {my_rank.rating_avg !== null ? ` with an average rating of ${my_rank.rating_avg} stars.` : '.'}
              {' '}Total mentorship earnings: <strong>{my_rank.total_earned} cr</strong>.
            </div>
          </div>
        </section>
      ) : (
        <section className="my-standing-banner not-ranked">
          <div className="standing-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div className="standing-content">
            <div className="standing-title">
              Complete your first session to rank on the leaderboard
            </div>
            <div className="standing-details">
              Accept mentorship requests on your skills to earn platform credits, collect 5-star reviews, and join the ranked community mentors.
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
