import React from 'react';

export default function Room() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Live Session Room</h1>
        <p className="page-subtitle">
          Real-time collaborative Monaco editor with Yjs synchronization and peer presence.
        </p>
      </div>

      <div className="placeholder-box">
        <span className="placeholder-icon">💻</span>
        <h2>Monaco + Yjs Collaborative Editor</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Live remote cursors, shared code editing, multi-language support, and presence indicators.
        </p>
        <div className="placeholder-slice-tag">Added in Slice 5 (Live session room)</div>
      </div>
    </div>
  );
}
