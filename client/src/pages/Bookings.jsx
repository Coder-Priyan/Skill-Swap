import React, { useState, useEffect, useCallback } from 'react';
import { getBookings, getCurrentUserId } from '../api.js';
import BookingCard from '../components/BookingCard.jsx';
import RatingModal from '../components/RatingModal.jsx';
import { subscribeToSocketEvent } from '../socket.js';

export default function Bookings({ currentUserId, onNavigate, onBookingsChange }) {
  const effectiveUserId = currentUserId || getCurrentUserId();
  const [activeTab, setActiveTab] = useState('learning'); // 'learning' | 'mentoring'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'accepted' | 'closed'
  const [learningBookings, setLearningBookings] = useState([]);
  const [mentoringBookings, setMentoringBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [ratingBooking, setRatingBooking] = useState(null);

  const fetchAllBookings = useCallback(async () => {
    if (!effectiveUserId) return;
    try {
      setLoading(true);
      setError(null);
      const [learningRes, mentoringRes] = await Promise.all([
        getBookings('learner'),
        getBookings('mentor'),
      ]);
      setLearningBookings(Array.isArray(learningRes) ? learningRes : (learningRes?.bookings || []));
      setMentoringBookings(Array.isArray(mentoringRes) ? mentoringRes : (mentoringRes?.bookings || []));
      if (onBookingsChange) onBookingsChange();
    } catch (err) {
      setError(err.message || 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, onBookingsChange]);

  useEffect(() => {
    fetchAllBookings();
  }, [fetchAllBookings]);

  // Subscribe to live socket events to update bookings in real-time
  useEffect(() => {
    const unsubReq = subscribeToSocketEvent('booking:requested', () => {
      fetchAllBookings();
    });
    const unsubAcc = subscribeToSocketEvent('booking:accepted', () => {
      fetchAllBookings();
    });
    const unsubDec = subscribeToSocketEvent('booking:declined', () => {
      fetchAllBookings();
    });
    const unsubCan = subscribeToSocketEvent('booking:cancelled', () => {
      fetchAllBookings();
    });
    const unsubEnded = subscribeToSocketEvent('session:ended', () => {
      fetchAllBookings();
    });
    const unsubLedger = subscribeToSocketEvent('ledger:updated', () => {
      fetchAllBookings();
    });

    return () => {
      unsubReq();
      unsubAcc();
      unsubDec();
      unsubCan();
      unsubEnded();
      unsubLedger();
    };
  }, [fetchAllBookings]);

  const handleActionSuccess = (actionType, booking) => {
    let msg = '';
    if (actionType === 'accept') msg = `Accepted booking with ${booking.learner?.name || 'learner'}`;
    if (actionType === 'decline') msg = `Declined booking with ${booking.learner?.name || 'learner'}`;
    if (actionType === 'cancel') msg = `Cancelled booking with ${activeTab === 'learning' ? booking.mentor?.name : booking.learner?.name}`;
    
    setActionMessage(msg);
    setTimeout(() => setActionMessage(null), 4000);
    fetchAllBookings();
  };

  const currentList = activeTab === 'learning' ? learningBookings : mentoringBookings;
  const currentRole = activeTab === 'learning' ? 'learner' : 'mentor';

  const isPendingStatus = (b) => b.status === 'requested' || b.status === 'pending';

  // Filter bookings based on statusFilter
  const filteredBookings = currentList.filter((b) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'pending' || statusFilter === 'requested') return isPendingStatus(b);
    if (statusFilter === 'accepted') return b.status === 'accepted';
    if (statusFilter === 'closed') {
      return ['declined', 'cancelled', 'completed', 'expired'].includes(b.status);
    }
    return true;
  });

  // Calculate badge counts
  const pendingMentoringCount = mentoringBookings.filter(isPendingStatus).length;
  const pendingLearningCount = learningBookings.filter(isPendingStatus).length;

  return (
    <div className="bookings-page">
      {/* Minimalist Subhead */}
      <div className="directory-subhead">
        <div className="directory-subhead-left">
          <div className="directory-title-row">
            <h1 className="directory-subhead-title">Session Dispatch & Bookings</h1>
            <span className="directory-badge-counter">{currentList.length} total</span>
          </div>
          <p className="directory-subhead-desc">
            Manage your peer-programming pairing requests, join active Monaco rooms, and inspect settled double-entry escrow receipts.
          </p>
        </div>

        <div className="directory-subhead-actions">
          {/* Segmented Role Switcher */}
          <div className="segmented-switcher" role="tablist" aria-label="Bookings role modes">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'learning'}
              className={`segmented-tab ${activeTab === 'learning' ? 'selected' : ''}`}
              onClick={() => setActiveTab('learning')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              <span>Learning Sessions</span>
              <span className="tab-counter-pill">{learningBookings.length}</span>
              {pendingLearningCount > 0 && (
                <span className="tab-pending-dot" title={`${pendingLearningCount} pending`}></span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'mentoring'}
              className={`segmented-tab ${activeTab === 'mentoring' ? 'selected' : ''}`}
              onClick={() => setActiveTab('mentoring')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Mentoring Sessions</span>
              <span className="tab-counter-pill">{mentoringBookings.length}</span>
              {pendingMentoringCount > 0 && (
                <span className="tab-ai-pill" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
                  {pendingMentoringCount} PENDING
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Subtle Telemetry Strip */}
      <div className="telemetry-meta-strip">
        <div className="telemetry-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>Escrow-Guaranteed (5 cr / session)</span>
        </div>
        <span className="telemetry-sep">•</span>
        <div className="telemetry-item">
          <span className="status-dot-active" />
          <span>Real-time Socket Sync Active</span>
        </div>
        <span className="telemetry-sep">•</span>
        <div className="telemetry-item">
          <span>Zero-risk auto refund on decline or cancel</span>
        </div>
      </div>

        {/* Filter chips */}
        <div className="status-filter-group">
          <button
            type="button"
            className={`filter-chip ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All ({currentList.length})
          </button>
          <button
            type="button"
            className={`filter-chip ${statusFilter === 'pending' ? 'active' : ''}`}
            onClick={() => setStatusFilter('pending')}
          >
            Pending ({currentList.filter(isPendingStatus).length})
          </button>
          <button
            type="button"
            className={`filter-chip ${statusFilter === 'accepted' ? 'active' : ''}`}
            onClick={() => setStatusFilter('accepted')}
          >
            Accepted ({currentList.filter((b) => b.status === 'accepted').length})
          </button>
          <button
            type="button"
            className={`filter-chip ${statusFilter === 'closed' ? 'active' : ''}`}
            onClick={() => setStatusFilter('closed')}
          >
            Closed ({currentList.filter((b) => ['declined', 'cancelled', 'completed', 'expired'].includes(b.status)).length})
          </button>
        </div>

      {/* Bookings List */}
      <div className="bookings-content">
        {loading && currentList.length === 0 ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading bookings...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="empty-state-card">
            <div className="empty-icon" style={{ opacity: 0.6, display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
            </div>
            <h3>No {statusFilter !== 'all' ? statusFilter : ''} bookings found</h3>
            <p>
              {activeTab === 'learning'
                ? "You haven't booked any mentorship sessions in this category yet."
                : "No mentees have booked sessions in this category with you yet."}
            </p>
            {activeTab === 'learning' && (
              <button
                className="btn btn-primary"
                style={{ marginTop: '1rem' }}
                onClick={() => onNavigate && onNavigate('/')}
              >
                Browse Mentors
              </button>
            )}
          </div>
        ) : (
          <div className="bookings-grid">
            {filteredBookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                role={currentRole}
                currentUserId={currentUserId}
                onActionSuccess={handleActionSuccess}
                onOpenRateModal={(b) => setRatingBooking(b)}
                onActionError={(err) => {
                  setError(err);
                  setTimeout(() => setError(null), 4000);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <RatingModal
        booking={ratingBooking}
        isOpen={Boolean(ratingBooking)}
        onClose={() => setRatingBooking(null)}
        onSuccess={(res) => {
          setActionMessage(res.bonusPaid
            ? `Rating submitted. +1 bonus credit sent to ${ratingBooking?.mentor?.name || 'mentor'}.`
            : 'Rating submitted successfully.'
          );
          setTimeout(() => setActionMessage(null), 5000);
          fetchAllBookings();
        }}
      />
    </div>
  );
}
