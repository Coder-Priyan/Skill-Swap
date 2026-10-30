import React from 'react';

export default function Leaderboard() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Leaderboard</h1>
        <p className="page-subtitle">
          Top mentors recognized by verified completed sessions and credits earned.
        </p>
      </div>

      <div className="placeholder-box">
        <span className="placeholder-icon">🏆</span>
        <h2>Community Helper Rankings</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Rankings by sessions completed as mentor, average rating, and credits accumulated.
        </p>
        <div className="placeholder-slice-tag">Added in Slice 7 (Bonus + polish: Leaderboard)</div>
      </div>
    </div>
  );
}
