import React from 'react';
import { getCurrentUserId, setCurrentUserId } from '../api';

export default function UserSwitcher({ users, currentUserId, onUserChange }) {
  const handleChange = (e) => {
    const newUserId = e.target.value;
    setCurrentUserId(newUserId);
    if (onUserChange) {
      onUserChange(newUserId);
    }
  };

  const currentUser = users.find((u) => u.id === currentUserId) || users[0];

  return (
    <div className="user-switcher" title="Switch sample user for demo (stored in sessionStorage)">
      {currentUser && (
        <span 
          className="user-avatar-indicator" 
          style={{ backgroundColor: currentUser.avatar_color }} 
        />
      )}
      <select
        id="user-switcher-select"
        className="user-switcher-select"
        value={currentUserId || ''}
        onChange={handleChange}
        aria-label="Active demo user persona"
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} (@{u.handle}) — Lvl {u.level} {u.badge}
          </option>
        ))}
      </select>
      <svg className="user-switcher-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}
