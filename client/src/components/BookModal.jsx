import React, { useState } from 'react';
import { createBooking } from '../api.js';

export default function BookModal({
  peer,
  currentProfile,
  initialTopic,
  initialProblemNote,
  initialSlotId,
  onClose,
  onBookSuccess,
}) {
  const defaultTopic =
    initialTopic && peer.skills?.includes(initialTopic)
      ? initialTopic
      : peer.skills?.[0] || '';

  const [selectedTopic, setSelectedTopic] = useState(defaultTopic);
  const [problemNote, setProblemNote] = useState(initialProblemNote || '');
  const [selectedSlot, setSelectedSlot] = useState(
    initialSlotId || (peer.slots?.[0] ? peer.slots[0].id : '')
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!problemNote || problemNote.trim().length < 10) {
      setErrorMessage('Please describe your problem or goal in at least 10 characters.');
      return;
    }

    if (!selectedSlot) {
      setErrorMessage('Please select an availability time slot.');
      return;
    }

    try {
      setSubmitting(true);
      const booking = await createBooking({
        mentorId: peer.id,
        topic: selectedTopic,
        problemNote: problemNote.trim(),
        slotId: selectedSlot,
      });

      if (onBookSuccess) {
        onBookSuccess(booking);
      }
      if (onClose) {
        onClose();
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to submit booking request');
    } finally {
      setSubmitting(false);
    }
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const availableCredits = currentProfile?.available_credits ?? 0;
  const totalBalance = currentProfile?.balance ?? 0;
  const reservedCredits = currentProfile?.reserved_credits ?? 0;
  const sessionCost = 5;
  const hasEnoughCredits = availableCredits >= sessionCost;
  const remainingBalance = Math.max(0, availableCredits - sessionCost);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-precision-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Book Micro-Mentorship Session</h2>
            <div className="modal-subtitle">Direct 1-on-1 collaborative pairing</div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* Mentor Mini Profile Banner */}
        <div className="modal-mentor-banner">
          <div 
            className="modal-mentor-avatar"
            style={{ backgroundColor: peer.avatar_color }}
          >
            {peer.name.charAt(0)}
          </div>
          <div className="modal-mentor-info">
            <div className="modal-mentor-name-row">
              <span className="modal-mentor-name">{peer.name}</span>
              <span className="modal-mentor-handle">@{peer.handle}</span>
            </div>
            <div className="modal-mentor-meta">
              <span className="mentor-level-tag">Lvl {peer.level} • {peer.badge}</span>
              <span className="meta-sep">•</span>
              <span className="mentor-rating-tag">{peer.rating_avg !== null ? `${peer.rating_avg.toFixed(1)}/5.0` : 'New'} ({peer.rating_count})</span>
              <span className="meta-sep">•</span>
              <span>{peer.sessions_completed_as_mentor} mentored</span>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="modal-error-banner" role="alert">
            <span className="alert-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </span>
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Topic Select from Mentor Skills */}
          <div className="form-group">
            <label className="form-label" htmlFor="booking-topic">Topic to discuss</label>
            <select
              id="booking-topic"
              className="form-select control-select"
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              required
            >
              {peer.skills?.map((skill) => (
                <option key={skill} value={skill}>
                  {skill}
                </option>
              ))}
            </select>
          </div>

          {/* Problem Note Textarea */}
          <div className="form-group">
            <div className="label-with-counter">
              <label className="form-label" htmlFor="booking-problem">
                What do you need help with?
              </label>
              <span className="char-counter">{problemNote.length}/500 chars</span>
            </div>
            <textarea
              id="booking-problem"
              className="form-textarea precision-textarea"
              rows={3}
              placeholder="Describe your bug, concept question, or architecture goal (min 10 characters)..."
              value={problemNote}
              onChange={(e) => setProblemNote(e.target.value)}
              required
              minLength={10}
              maxLength={500}
            />
          </div>

          {/* Slot Choice from Mentor's Slots */}
          <div className="form-group">
            <label className="form-label" htmlFor="booking-slot">Choose an availability window</label>
            {(!peer.slots || peer.slots.length === 0) ? (
              <p className="no-slots-notice">
                Mentor has no listed time slots.
              </p>
            ) : (
              <div className="slot-pills-row" role="radiogroup" aria-label="Available time slots">
                {peer.slots.map((s) => {
                  const label = `${dayNames[s.day_of_week]}: ${s.start_hour}:00 - ${s.end_hour}:00`;
                  const isSelected = selectedSlot === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`slot-pill-btn ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedSlot(s.id)}
                    >
                      <span className="slot-calendar-icon" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                      </span>
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Credit Cost and Available Credits breakdown */}
          <div className="cost-breakdown-card precision-cost-card">
            <div className="cost-item">
              <span className="cost-label">Session Cost:</span>
              <span className="cost-val highlight-amber">{sessionCost} cr</span>
            </div>
            <div className="cost-divider" />
            <div className="cost-item">
              <span className="cost-label">Your Available Balance:</span>
              <span className="cost-val highlight-blue">
                {availableCredits} cr
                {reservedCredits > 0 && (
                  <span className="cost-sub-detail" title={`${reservedCredits} cr locked in escrow`}>
                    ({reservedCredits} locked)
                  </span>
                )}
              </span>
            </div>
            <div className="cost-divider" />
            <div className="cost-item">
              <span className="cost-label">Remaining Balance:</span>
              <span className="cost-val highlight-green">
                {remainingBalance} cr <span className="verified-text">verified</span>
              </span>
            </div>
          </div>

          {!hasEnoughCredits && (
            <div className="modal-insufficient-notice">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ flexShrink: 0, marginTop: '2px' }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div className="insufficient-text">
                {reservedCredits > 0 ? (
                  <span>
                    <strong>{reservedCredits} credits are currently locked</strong> in active bookings (Escrow). Your available balance is <strong>0 cr</strong>. Switch persona in the top-right switcher (e.g. <strong>Arjun Verma</strong>) or click <strong>Reset Demo</strong> in the top bar to release demo credits.
                  </span>
                ) : (
                  <span>
                    Insufficient balance (requires <strong>5 cr</strong>, currently <strong>0 cr</strong>). Switch persona in top-right switcher (e.g. <strong>Arjun Verma</strong>) or click <strong>Reset Demo</strong>.
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-confirm-booking"
              disabled={submitting || (!peer.slots || peer.slots.length === 0) || !hasEnoughCredits}
            >
              {submitting ? 'Submitting Request...' : `Confirm & Request Booking (${sessionCost} cr)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
