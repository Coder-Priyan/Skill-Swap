import React from 'react';

export default function Directory() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Find Peers</h1>
        <p className="page-subtitle">
          Discover experienced mentors and peers for 30-minute 1-on-1 pairing sessions.
        </p>
      </div>

      <div className="placeholder-box">
        <span className="placeholder-icon">🔍</span>
        <h2>Peer Directory & Live Search</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Real-time search, skill chips, availability filters, and peer booking modal.
        </p>
        <div className="placeholder-slice-tag">Added in Slice 2 (Peer directory)</div>
      </div>
    </div>
  );
}
