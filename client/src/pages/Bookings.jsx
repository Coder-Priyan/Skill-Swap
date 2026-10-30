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
      <div className="page-header">
        <h1 className="page-title">My Bookings</h1>
        <p className="page-subtitle">
          Manage your live pairing sessions, pending requests, and mentor invitations.
        </p>
      </div>

      {actionMessage && (
        <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
          ✅ {actionMessage}
        </div>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Tabs navigation */}
      <div className="bookings-tabs-header">
        <div className="tabs-nav">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'learning' ? 'active' : ''}`}
            onClick={() => setActiveTab('learning')}
          >
            🎓 I'm Learning
            <span className="tab-count-badge">{learningBookings.length}</span>
            {pendingLearningCount > 0 && (
              <span className="tab-pending-dot" title={`${pendingLearningCount} pending`}></span>
            )}
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'mentoring' ? 'active' : ''}`}
            onClick={() => setActiveTab('mentoring')}
          >
            🧑‍🏫 I'm Mentoring
            <span className="tab-count-badge">{mentoringBookings.length}</span>
            {pendingMentoringCount > 0 && (
              <span className="tab-urgent-badge">{pendingMentoringCount} pending</span>
            )}
          </button>
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
            <div className="empty-icon">📭</div>
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
            ? `⭐ Rating submitted! +1 bonus credit sent to ${ratingBooking?.mentor?.name || 'mentor'}`
            : '⭐ Rating submitted successfully!'
          );
          setTimeout(() => setActionMessage(null), 5000);
          fetchAllBookings();
        }}
      />
    </div>
  );
}
