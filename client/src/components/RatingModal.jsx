import React, { useState } from 'react';
import StarRating from './StarRating';
import { rateBooking } from '../api';

export default function RatingModal({ booking, isOpen, onClose, onSuccess }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !booking) return null;

  const mentorName = booking.mentor?.name || 'your mentor';
  const isFiveStar = rating === 5;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      setError('Please select a star rating from 1 to 5');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await rateBooking(booking.id, rating, comment);
      if (onSuccess) {
        onSuccess(res);
      }
      onClose();
    } catch (err) {
      console.error('Failed to submit rating:', err);
      setError(err.message || 'Failed to submit rating. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="rating-modal-title">
      <div className="modal-card rating-modal">
        <div className="modal-header">
          <div className="rating-modal-badge">⭐ Rate Session</div>
          <h2 id="rating-modal-title" className="modal-title">
            How was your session?
          </h2>
          <p className="modal-subtitle">
            Pairing on <strong>{booking.topic}</strong> with <strong>{mentorName}</strong>
          </p>
        </div>

        {error && (
          <div className="alert-box alert-error" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="rating-form">
          <div className="rating-stars-wrapper">
            <StarRating
              value={rating}
              onChange={setRating}
              size="lg"
            />
            <div className="rating-score-label">
              {rating === 5 && '🌟 Exceptional! (5/5)'}
              {rating === 4 && '👍 Very Good (4/5)'}
              {rating === 3 && '👌 Good (3/5)'}
              {rating === 2 && '😐 Needs Improvement (2/5)'}
              {rating === 1 && '👎 Poor (1/5)'}
            </div>
          </div>

          {isFiveStar && (
            <div className="bonus-incentive-banner">
              <span className="bonus-icon">🎁</span>
              <div className="bonus-text">
                <strong>5-Star Bonus:</strong> Submitting 5 stars awards an extra{' '}
                <span className="bonus-highlight">+1 platform bonus credit</span> to {mentorName}!
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="rating-comment" className="form-label">
              Feedback note <span className="label-optional">(optional, max 300 characters)</span>
            </label>
            <textarea
              id="rating-comment"
              className="form-textarea"
              rows={3}
              maxLength={300}
              placeholder={`Share what you built, what was helpful, or a shoutout to ${mentorName}...`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="char-count">
              {comment.length}/300 characters
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Skip
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || rating < 1}
            >
              {submitting ? 'Submitting...' : isFiveStar ? 'Submit & Send +1 Bonus' : 'Submit Rating'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
