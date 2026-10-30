import React, { useState } from 'react';
import { createBooking } from '../api.js';

export default function BookModal({ peer, currentProfile, onClose, onBookSuccess }) {
  const [selectedTopic, setSelectedTopic] = useState(peer.skills?.[0] || '');
  const [problemNote, setProblemNote] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(
    peer.slots?.[0] ? peer.slots[0].id : ''
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Book Session with {peer.name}</h2>
            <div className="modal-subtitle">@{peer.handle} • Level {peer.level} {peer.badge}</div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {errorMessage && (
          <div className="modal-error-banner" role="alert">
            ⚠️ {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Topic Select from Mentor Skills */}
          <div className="form-group">
            <label className="form-label" htmlFor="booking-topic">Topic to discuss</label>
            <select
              id="booking-topic"
              className="form-select"
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
            <label className="form-label" htmlFor="booking-problem">
              What do you need help with? <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(min 10 characters)</span>
            </label>
            <textarea
              id="booking-problem"
              className="form-textarea"
              rows={3}
              placeholder="Describe your bug, concept question, or architecture goal..."
              value={problemNote}
              onChange={(e) => setProblemNote(e.target.value)}
              required
              minLength={10}
              maxLength={500}
            />
            <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {problemNote.length}/500 chars
            </div>
          </div>

          {/* Slot Choice from Mentor's Slots */}
          <div className="form-group">
            <label className="form-label" htmlFor="booking-slot">Choose an availability window</label>
            {(!peer.slots || peer.slots.length === 0) ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Mentor has no listed time slots.
              </p>
            ) : (
              <select
                id="booking-slot"
                className="form-select"
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.target.value)}
                required
              >
                {peer.slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {dayNames[s.day_of_week]}: {s.start_hour}:00 - {s.end_hour}:00
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Credit Cost and Available Credits breakdown */}
          <div className="cost-breakdown-card">
            <div className="cost-item">
              <span className="cost-label">Session Cost:</span>
              <span className="cost-val highlight-amber">5 Credits</span>
            </div>
            <div className="cost-item">
              <span className="cost-label">Your Available Credits:</span>
              <span className="cost-val highlight-green">
                {currentProfile ? `${currentProfile.available_credits} Credits` : '...'}
              </span>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || (!peer.slots || peer.slots.length === 0)}
            >
              {submitting ? 'Submitting Request...' : 'Confirm Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
