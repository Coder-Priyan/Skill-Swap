import React from 'react';

export default function Bookings() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Bookings</h1>
        <p className="page-subtitle">
          Manage your upcoming sessions as a learner and as a mentor.
        </p>
      </div>

      <div className="placeholder-box">
        <span className="placeholder-icon">📅</span>
        <h2>Booking Management & Real-Time Alerts</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Accept/decline requests, cancel pending sessions, and join active pairing rooms.
        </p>
        <div className="placeholder-slice-tag">Added in Slice 3 (Booking flow & notifications)</div>
      </div>
    </div>
  );
}
