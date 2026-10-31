// Booking Card component (SPEC.md Section 9 & Slice 3, 5)
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { acceptBooking, declineBooking, cancelBooking } from '../api.js';

const LANG_COLORS = {
  React: '#61dafb',
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  'CSS/UI': '#563d7c',
  'Node.js': '#026e00',
  'System Design': '#8a63d2',
  DSA: '#e34c26',
  Java: '#b07219',
  'SQL/Database Design': '#e38c00',
  'DevOps/Docker': '#384d54',
  Flutter: '#02569B',
  'WebGL/Three.js': '#ff3e00',
  Git: '#f05032',
  'Machine Learning': '#ff6f61',
};

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
  onOpenRateModal,
}) {
  const [loadingAction, setLoadingAction] = useState(null); // 'accept' | 'decline' | 'cancel'
  const [confirmDialog, setConfirmDialog] = useState(null); // 'accept' | 'decline' | 'cancel'

  const counterpart = role === 'learner' ? booking.mentor : booking.learner;
  const isPending = booking.status === 'requested' || booking.status === 'pending';
  const isAccepted = booking.status === 'accepted';
  const isInProgress = booking.status === 'in_progress';
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
      case 'in_progress':
        return 'badge-status-inprogress';
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
            {isInProgress ? 'LIVE' : booking.status === 'completed' ? 'Completed' : booking.status}
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
          <span className="topic-tag gh-lang-tag">
            <span
              className="gh-lang-color-dot"
              style={{ backgroundColor: LANG_COLORS[booking.topic] || '#8b949e' }}
            />
            <span>{booking.topic}</span>
          </span>
          <span className="slot-tag">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '5px' }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {booking.slot_label || 'Scheduled Slot'}
          </span>
          <span className="cost-tag monospace-tabular">
            {booking.status === 'completed' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                {booking.cost} cr settled
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                {booking.cost} cr escrow
              </span>
            )}
          </span>
        </div>

        <div className="booking-problem-box">
          <div className="problem-box-label">Problem / Goal:</div>
          <div className="problem-box-text">"{booking.problem_note}"</div>
        </div>
      </div>

      <div className="booking-card-footer">
        <div className="booking-timestamp-info">
          {booking.status === 'completed' && (
            <div className="credits-moved-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '5px' }}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v12M8 10h8M8 14h6" />
              </svg>
              <span>{booking.cost} cr settled</span>
            </div>
          )}
          {booking.completed_at && (
            <span>Completed {formatRelativeTime(booking.completed_at)}</span>
          )}
          {booking.accepted_at && !booking.completed_at && (
            <span>Accepted {formatRelativeTime(booking.accepted_at)}</span>
          )}
          {booking.started_at && !booking.completed_at && (
            <span>Started {formatRelativeTime(booking.started_at)}</span>
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

          {/* Accepted and In-Progress Actions */}
          {(isAccepted || isInProgress) && (
            <>
              {isAccepted && (
                confirmDialog === 'cancel' ? (
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
                )
              )}

              {/* Active Join room link */}
              <Link
                to={`/room/${booking.id}`}
                className="btn btn-sm btn-join-live-room"
              >
                <span className="live-room-pulse-dot" />
                <span>Join Live Studio</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
            </>
          )}

          {/* Completed Session Actions & Rating Display */}
          {booking.status === 'completed' && (
            <div className="completed-actions-group">
              <Link
                to={`/sessions/${booking.id}`}
                className="btn btn-sm btn-secondary btn-notes"
                title="View session notes and code snapshot"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <span>Notes</span>
              </Link>

              {role === 'learner' ? (
                booking.rating ? (
                  <div className="booking-card-rating">
                    <span className="rating-score-pill">{booking.rating}/5</span>
                    {booking.rating_comment && (
                      <div className="booking-rating-comment">
                        "{booking.rating_comment}"
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    className="btn btn-sm btn-primary btn-rate"
                    onClick={() => onOpenRateModal && onOpenRateModal(booking)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <span>Rate Mentor</span>
                  </button>
                )
              ) : (
                booking.mentor_rating ? (
                  <div className="booking-card-rating">
                    <span className="rating-score-pill">{booking.mentor_rating}/5</span>
                    {booking.mentor_rating_comment && (
                      <div className="booking-rating-comment">
                        "{booking.mentor_rating_comment}"
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    className="btn btn-sm btn-primary btn-rate"
                    onClick={() => onOpenRateModal && onOpenRateModal(booking)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <span>Rate Learner</span>
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
