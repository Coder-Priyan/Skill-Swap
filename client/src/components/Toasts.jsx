// Toast notification component (SPEC.md Section 8 & Slice 3)
import React from 'react';

export default function Toasts({ toasts = [], onDismiss, onNavigate }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toasts-container" role="region" aria-label="Notifications">
      {toasts.map((toast) => {
        const typeClass = toast.type ? `toast-${toast.type}` : 'toast-info';

        return (
          <div
            key={toast.id}
            className={`toast-item ${typeClass}`}
            onClick={() => {
              if (toast.link && onNavigate) {
                onNavigate(toast.link);
              } else if (onNavigate) {
                onNavigate('/bookings');
              }
              onDismiss(toast.id);
            }}
          >
            <div className="toast-icon">
              {toast.type === 'success' && '✅'}
              {toast.type === 'error' && '❌'}
              {toast.type === 'warning' && '⚠️'}
              {toast.type === 'request' && '📩'}
              {toast.type === 'accepted' && '🎉'}
              {toast.type === 'declined' && '❌'}
              {toast.type === 'cancelled' && '🚫'}
              {!['success', 'error', 'warning', 'request', 'accepted', 'declined', 'cancelled'].includes(toast.type) && '🔔'}
            </div>
            <div className="toast-content">
              {toast.title && <div className="toast-title">{toast.title}</div>}
              <div className="toast-message">{toast.message}</div>
              {toast.actionText && <div className="toast-action-hint">{toast.actionText} →</div>}
            </div>
            <button
              type="button"
              className="toast-close-btn"
              aria-label="Dismiss notification"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(toast.id);
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
