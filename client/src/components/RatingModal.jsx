import React, { useState } from 'react';
import StarRating from './StarRating';
import { rateBooking, getCurrentUserId } from '../api';

const LEARNER_TAGS = [
  'Clear Explanations',
  'Quick Problem Solving',
  'Patient Guidance',
  'Deep Technical Insight',
  'Code Quality Focus',
];

const MENTOR_TAGS = [
  'Highly Engaged',
  'Quick to Grasp',
  'Strong Communication',
  'Well Prepared',
  'Collaborative Approach',
];

export default function RatingModal({ booking, isOpen, onClose, onSuccess }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !booking) return null;

  const currentUserId = getCurrentUserId();
  const isLearner = booking.learner_id === currentUserId;
  const targetUser = isLearner ? booking.mentor : booking.learner;
  const targetName = targetUser?.name || (isLearner ? 'Mentor' : 'Learner');
  const targetRole = isLearner ? 'Mentor' : 'Learner';
  const isFiveStar = rating === 5;

  const quickTags = isLearner ? LEARNER_TAGS : MENTOR_TAGS;

  const handleToggleTag = (tagLabel) => {
    let nextTags;
    if (selectedTags.includes(tagLabel)) {
      nextTags = selectedTags.filter((t) => t !== tagLabel);
    } else {
      nextTags = [...selectedTags, tagLabel];
    }
    setSelectedTags(nextTags);

    // Auto-update comment note if user hasn't typed a long custom story
    if (nextTags.length > 0) {
      setComment(nextTags.join(', '));
    } else {
      setComment('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      setError('Please select a rating between 1 and 5 stars');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const finalComment = comment.trim() || selectedTags.join(', ') || null;
      const res = await rateBooking(booking.id, rating, finalComment, isLearner ? 'learner' : 'mentor');
      setSubmitted(true);
      setTimeout(() => {
        if (onSuccess) onSuccess(res);
        if (onClose) onClose();
      }, 1200);
    } catch (err) {
      console.error('Failed to submit rating:', err);
      setError(err.message || 'Failed to submit rating. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="rating-modal-title">
      <div className="modal-card rating-modal">
        {submitted ? (
          <div className="rating-success-state">
            <div className="success-icon-ring">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="success-title">Feedback Submitted!</h3>
            <p className="success-subtitle">
              Thank you for keeping the SkillSwap community fair and transparent.
            </p>
          </div>
        ) : (
          <>
            <div className="modal-header">
              <div className="rating-target-chip">
                <div className="rating-avatar" style={{ backgroundColor: targetUser?.avatar_color || '#6366f1' }}>
                  {targetName.charAt(0)}
                </div>
                <div className="rating-target-meta">
                  <span className="rating-target-name">{targetName}</span>
                  <span className="rating-target-role">{targetRole}</span>
                </div>
              </div>

              <h2 id="rating-modal-title" className="modal-title">
                {isLearner ? `Rate ${targetName}'s Mentorship` : `Rate ${targetName}'s Collaboration`}
              </h2>
              <p className="modal-subtitle">
                {isLearner
                  ? `How helpful and beneficial was ${targetName}'s guidance on ${booking.topic}?`
                  : `How responsive and engaged was ${targetName} during the live session?`}
              </p>
            </div>

            {error && (
              <div className="alert-box alert-error" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="rating-form">
              {/* Star Rating Section */}
              <div className="rating-stars-wrapper">
                <StarRating value={rating} onChange={setRating} size="lg" />
                <div className="rating-score-label">
                  {rating === 5 && '5/5 — Exceptional Collaboration'}
                  {rating === 4 && '4/5 — Very Good & Helpful'}
                  {rating === 3 && '3/5 — Good Session'}
                  {rating === 2 && '2/5 — Needs Improvement'}
                  {rating === 1 && '1/5 — Unsatisfactory'}
                </div>
              </div>

              {/* 5-Star Incentive Banner */}
              {isFiveStar && (
                <div className="bonus-incentive-banner">
                  <span className="bonus-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 12v10H4V12" />
                      <path d="M2 7h20v5H2z" />
                      <path d="M12 22V7" />
                      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                    </svg>
                  </span>
                  <div className="bonus-text">
                    {isLearner ? (
                      <>
                        <strong>5-Star Bonus:</strong> Awards an extra{' '}
                        <span className="bonus-highlight">+1 platform bonus credit</span> to {targetName}!
                      </>
                    ) : (
                      <>
                        <strong>High-Performance Session:</strong> Increments {targetName}'s verified peer rating.
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Clickable Quick Feedback Tags */}
              <div className="form-group">
                <label className="form-label">
                  Feedback tags <span className="label-optional">(click to highlight)</span>
                </label>
                <div className="quick-tags-container">
                  {quickTags.map((tag) => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`quick-tag-pill ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleToggleTag(tag)}
                      >
                        {isSelected && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        <span>{tag}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Feedback Textarea */}
              <div className="form-group">
                <label htmlFor="rating-comment" className="form-label">
                  Feedback note <span className="label-optional">(optional, max 300 characters)</span>
                </label>
                <textarea
                  id="rating-comment"
                  className="form-textarea"
                  rows={2}
                  maxLength={300}
                  placeholder={
                    isLearner
                      ? `What stood out about ${targetName}'s explanations or debugging approach?`
                      : `How did ${targetName} respond to guidance and collaborate?`
                  }
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <div className="char-count monospace-tabular">
                  {comment.length}/300 characters
                </div>
              </div>

              {/* Action Buttons */}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary modal-skip-btn"
                  onClick={onClose}
                  disabled={submitting}
                >
                  Skip
                </button>
                <button
                  type="submit"
                  className="btn btn-primary modal-submit-btn"
                  disabled={submitting || rating < 1}
                >
                  {submitting
                    ? 'Submitting...'
                    : isFiveStar && isLearner
                    ? 'Submit & Grant +1 Bonus'
                    : 'Submit Feedback'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
