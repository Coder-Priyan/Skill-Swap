import React from 'react';

export default function NotFound({ onNavigateHome }) {
  return (
    <div className="page-container not-found-page">
      <div className="not-found-card">
        <div className="not-found-code">404</div>
        <h1 className="not-found-title">Page Not Found</h1>
        <p className="not-found-desc">
          The requested route or session archive does not exist or may have been moved.
        </p>
        <button
          className="btn btn-primary"
          onClick={() => (onNavigateHome ? onNavigateHome() : (window.location.hash = ''))}
        >
          ← Back to Peer Directory
        </button>
      </div>
    </div>
  );
}
