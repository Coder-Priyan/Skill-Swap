import React, { useState } from 'react';

/**
  * Interactive and read-only star rating component.
  * Supports keyboard navigation, hover preview, and custom sizes.
  * 
  * @param {{
  *   value: number,
  *   onChange?: (val: number) => void,
  *   readOnly?: boolean,
  *   size?: 'sm' | 'md' | 'lg',
  *   showValue?: boolean
  * }} props
  */
export default function StarRating({
  value = 0,
  onChange = null,
  readOnly = false,
  size = 'md',
  showValue = false,
}) {
  const [hoverValue, setHoverValue] = useState(0);

  const displayValue = readOnly ? value : (hoverValue || value);

  const sizeClasses = {
    sm: 'star-icon-sm',
    md: 'star-icon-md',
    lg: 'star-icon-lg',
  };

  const handleKeyDown = (e, star) => {
    if (readOnly || !onChange) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange(star);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(Math.min(5, (value || 0) + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(Math.max(1, (value || 0) - 1));
    }
  };

  return (
    <div
      className={`star-rating-container ${readOnly ? 'read-only' : 'interactive'}`}
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={`Rating: ${value} out of 5 stars`}
    >
      <div className="stars-row">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= displayValue;
          return (
            <button
              key={star}
              type="button"
              disabled={readOnly}
              className={`star-btn ${sizeClasses[size] || sizeClasses.md} ${isFilled ? 'filled' : 'empty'}`}
              onClick={() => !readOnly && onChange && onChange(star)}
              onMouseEnter={() => !readOnly && setHoverValue(star)}
              onMouseLeave={() => !readOnly && setHoverValue(0)}
              onKeyDown={(e) => handleKeyDown(e, star)}
              aria-label={`${star} star${star > 1 ? 's' : ''}`}
              role={readOnly ? 'presentation' : 'radio'}
              aria-checked={value === star}
              tabIndex={readOnly ? -1 : 0}
            >
              <svg
                viewBox="0 0 24 24"
                fill={isFilled ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth={isFilled ? '1' : '1.8'}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="star-svg"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          );
        })}
      </div>
      {showValue && value > 0 && (
        <span className="star-rating-numeric">{Number(value).toFixed(1)}</span>
      )}
    </div>
  );
}
