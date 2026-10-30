// Booking Card component (SPEC.md Section 9 & Slice 3)
import React, { useState } from 'react';
import { acceptBooking, declineBooking, cancelBooking } from '../api.js';

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diffSec = Math.floor((now - past) / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function BookingCard({
  booking,
  role, // 'learner' | 'mentor'
  currentUserId,
  onActionSuccess,
  onActionError,
}) {
  const [loadingAction, setLoadingAction] = useState(null); // 'accept' | 'decline' | 'cancel'
  const [confirmDialog, setConfirmDialog] = useState(null); // 'accept' | 'decline' | 'cancel'

  const counterpart = role === 'learner' ? booking.mentor : booking.learner;
  const isPending = booking.status === 'requested' || booking.status === 'pending';
  const isAccepted = booking.status === 'accepted';
  const isClosed = ['declined', 'cancelled', 'completed', 'expired'].includes(booking.status);

  const handleAction = async (actionType) => {
    try {
      setLoadingAction(actionType);
      if (actionType === 'accept') {
        await acceptBooking(booking.id);
      } else if (actionType === 'decline') {
        await declineBooking(booking.id);
      } else if (actionType === 'cancel') {
        await cancelBooking(booking.id);
      }
      setConfirmDialog(null);
      if (onActionSuccess) onActionSuccess(actionType, booking);
    } catch (err) {
      if (onActionError) onActionError(err.message || `Failed to ${actionType} booking`);
    } finally {
      setLoadingAction(null);
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'requested':
      case 'pending':
        return 'badge-status-pending';
      case 'accepted':
        return 'badge-status-accepted';
      case 'declined':
        return 'badge-status-declined';
      case 'cancelled':
        return 'badge-status-cancelled';
      case 'completed':
        return 'badge-status-completed';
      default:
        return 'badge-status-default';
    }
  };

  return (
    <div className={`booking-card status-${booking.status}`}>
      <div className="booking-card-header">
        <div className="counterpart-info">
          <div
            className="avatar counterpart-avatar"
            style={{ backgroundColor: counterpart?.avatar_color || '#64748b' }}
          >
            {counterpart?.name ? counterpart.name[0].toUpperCase() : '?'}
          </div>
          <div>
            <div className="counterpart-name-row">
              <span className="counterpart-name">{counterpart?.name || 'Unknown'}</span>
              <span className="counterpart-handle">@{counterpart?.handle || 'user'}</span>
              {counterpart?.level && (
                <span className="user-level-badge">
                  L{counterpart.level} {counterpart.badge || ''}
                </span>
              )}
            </div>
            <div className="counterpart-sub">
              {role === 'learner' ? 'Mentor' : 'Learner'} • {formatRelativeTime(booking.created_at)}
            </div>
          </div>
        </div>

        <div className="booking-status-tag-group">
          <span className={`status-pill ${getStatusBadgeClass(booking.status)}`}>
            {booking.status}
          </span>
          {booking.cancelled_by && (
            <span className="cancelled-by-label">
              (by {booking.cancelled_by})
            </span>
          )}
        </div>
      </div>

      <div className="booking-card-body">
        <div className="booking-meta-row">
          <span className="topic-tag">🎯 {booking.topic}</span>
          <span className="slot-tag">📅 {booking.slot_label || 'Scheduled Slot'}</span>
          <span className="cost-tag">🪙 {booking.cost} credits</span>
        </div>

        <div className="booking-problem-box">
          <div className="problem-box-label">Problem / Goal:</div>
          <div className="problem-box-text">"{booking.problem_note}"</div>
        </div>
      </div>

      <div className="booking-card-footer">
        <div className="booking-timestamp-info">
          {booking.accepted_at && (
            <span>Accepted {formatRelativeTime(booking.accepted_at)}</span>
          )}
          {booking.cancelled_at && (
            <span>Cancelled {formatRelativeTime(booking.cancelled_at)}</span>
          )}
        </div>

        <div className="booking-actions">
          {/* Mentor Pending Actions */}
          {role === 'mentor' && isPending && (
            <>
              {confirmDialog === 'decline' ? (
                <div className="confirm-inline">
                  <span>Decline request?</span>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleAction('decline')}
                    disabled={loadingAction === 'decline'}
                  >
                    {loadingAction === 'decline' ? '...' : 'Yes, Decline'}
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => setConfirmDialog(null)}
                  >
                    No
                  </button>
                </div>
              ) : confirmDialog === 'accept' ? (
                <div className="confirm-inline">
                  <span>Accept session?</span>
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => handleAction('accept')}
                    disabled={loadingAction === 'accept'}
                  >
                    {loadingAction === 'accept' ? '...' : 'Yes, Accept'}
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => setConfirmDialog(null)}
                  >
                    No
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => setConfirmDialog('decline')}
                    disabled={Boolean(loadingAction)}
                  >
                    Decline
                  </button>
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => setConfirmDialog('accept')}
                    disabled={Boolean(loadingAction)}
                  >
                    Accept
                  </button>
                </>
              )}
            </>
          )}

          {/* Learner Pending Cancel Action */}
          {role === 'learner' && isPending && (
            <>
              {confirmDialog === 'cancel' ? (
                <div className="confirm-inline">
                  <span>Cancel request?</span>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleAction('cancel')}
                    disabled={loadingAction === 'cancel'}
                  >
                    {loadingAction === 'cancel' ? '...' : 'Confirm Cancel'}
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => setConfirmDialog(null)}
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => setConfirmDialog('cancel')}
                  disabled={Boolean(loadingAction)}
                >
                  Cancel Request
                </button>
              )}
            </>
          )}

          {/* Accepted State Actions */}
          {isAccepted && (
            <>
              {confirmDialog === 'cancel' ? (
                <div className="confirm-inline">
                  <span>Cancel session?</span>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleAction('cancel')}
                    disabled={loadingAction === 'cancel'}
                  >
                    {loadingAction === 'cancel' ? '...' : 'Yes, Cancel'}
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => setConfirmDialog(null)}
                  >
                    Back
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => setConfirmDialog('cancel')}
                  disabled={Boolean(loadingAction)}
                >
                  Cancel Session
                </button>
              )}

              {/* Disabled Join room button with tooltip per SPEC */}
              <button
                className="btn btn-sm btn-primary btn-disabled-hint"
                disabled
                title="Live room opens in the next update"
              >
                Join Room 🔒
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
