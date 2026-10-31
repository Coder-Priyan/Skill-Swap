// Central API client (SPEC.md Section 7 & 9)
// Stores and reads user ID from sessionStorage so separate tabs act as different users.
// Injects X-User-Id header into all outgoing requests.

const SESSION_STORAGE_KEY = 'skillswap_current_user_id';

/**
 * Gets the currently selected user ID from sessionStorage.
 * @returns {string | null}
 */
export function getCurrentUserId() {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to read from sessionStorage:', err);
    return null;
  }
}

/**
 * Saves the selected user ID to sessionStorage.
 * @param {string} userId 
 */
export function setCurrentUserId(userId) {
  try {
    if (userId) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, userId);
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch (err) {
    console.error('Failed to save to sessionStorage:', err);
  }
}

/**
 * Generic API fetch wrapper that injects X-User-Id and handles JSON parsing.
 * 
 * @param {string} endpoint 
 * @param {RequestInit} [options={}] 
 * @returns {Promise<any>}
 */
export async function apiRequest(endpoint, options = {}) {
  const currentUserId = getCurrentUserId();
  const headers = new Headers(options.headers || {});

  // Add default content type if sending json
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Inject X-User-Id header if present in sessionStorage
  if (currentUserId && !headers.has('X-User-Id')) {
    headers.set('X-User-Id', currentUserId);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson && errJson.error) {
        errorMsg = errJson.error;
      }
    } catch {
      // ignore json parse error on non-json error responses
    }
    const error = new Error(errorMsg);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * GET /api/health
 */
export function getHealth() {
  return apiRequest('/api/health');
}

/**
 * GET /api/users
 */
export function getUsers() {
  return apiRequest('/api/users');
}

/**
 * GET /api/users/:id
 * @param {string} id 
 */
export function getUserProfile(id) {
  return apiRequest(`/api/users/${id}`);
}

/**
 * GET /api/meta
 * Fetches dynamic filter options from the database.
 */
export function getMeta() {
  return apiRequest('/api/meta');
}

/**
 * GET /api/peers
 * Fetches peer directory with search, filters, and current user eligibility.
 * 
 * @param {object} params
 * @param {AbortSignal} [signal]
 */
export function getPeers(params = {}, signal = null) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, value);
    }
  }

  const queryString = searchParams.toString();
  const endpoint = queryString ? `/api/peers?${queryString}` : '/api/peers';
  return apiRequest(endpoint, { signal });
}
/**
 * GET /api/bookings?role=learner|mentor
 * @param {'learner'|'mentor'} [role]
 */
export function getBookings(role) {
  const query = role ? `?role=${role}` : '';
  return apiRequest(`/api/bookings${query}`);
}

/**
 * GET /api/bookings/summary
 */
export function getBookingsSummary() {
  return apiRequest('/api/bookings/summary');
}

/**
 * POST /api/bookings
 * @param {{ mentorId: string, topic: string, problemNote: string, slotId: string }} data
 */
export function createBooking(data) {
  return apiRequest('/api/bookings', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * POST /api/bookings/:id/accept
 * @param {string} id
 */
export function acceptBooking(id) {
  return apiRequest(`/api/bookings/${id}/accept`, {
    method: 'POST',
  });
}

/**
 * POST /api/bookings/:id/decline
 * @param {string} id
 */
export function declineBooking(id) {
  return apiRequest(`/api/bookings/${id}/decline`, {
    method: 'POST',
  });
}

/**
 * POST /api/bookings/:id/cancel
 * @param {string} id
 */
export function cancelBooking(id) {
  return apiRequest(`/api/bookings/${id}/cancel`, {
    method: 'POST',
  });
}

/**
 * GET /api/bookings/:id
 * @param {string} id
 */
export function getBooking(id) {
  return apiRequest(`/api/bookings/${id}`);
}

/**
 * POST /api/bookings/:id/start
 * @param {string} id
 */
export function startBooking(id) {
  return apiRequest(`/api/bookings/${id}/start`, {
    method: 'POST',
  });
}

/**
 * POST /api/bookings/:id/complete
 * @param {string} id
 */
export function completeBooking(id) {
  return apiRequest(`/api/bookings/${id}/complete`, {
    method: 'POST',
  });
}

/**
 * GET /api/bookings/:id/notes
 * @param {string} id
 */
export function getBookingNotes(id) {
  return apiRequest(`/api/bookings/${id}/notes`);
}

/**
 * GET /api/ledger/:userId
 * @param {string} userId
 * @param {object} [params]
 */
export function getLedger(userId, { kind, limit = 50, offset = 0 } = {}) {
  const searchParams = new URLSearchParams();
  if (kind) searchParams.append('kind', kind);
  if (limit !== undefined) searchParams.append('limit', limit);
  if (offset !== undefined) searchParams.append('offset', offset);
  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return apiRequest(`/api/ledger/${userId}${query}`);
}

/**
 * Downloads ledger as CSV with X-User-Id auth header
 * @param {string} userId
 * @param {object} [params]
 */
export async function downloadLedgerCsv(userId, { kind } = {}) {
  const currentUserId = getCurrentUserId();
  const searchParams = new URLSearchParams();
  if (kind) searchParams.append('kind', kind);
  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';

  const headers = {};
  if (currentUserId) {
    headers['X-User-Id'] = currentUserId;
  }

  const res = await fetch(`/api/ledger/${userId}/export.csv${query}`, {
    headers,
  });

  if (!res.ok) {
    throw new Error('Failed to download ledger CSV');
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ledger-${userId}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * POST /api/bookings/:id/rate
 * Rates a completed booking and sends +1 bonus credit to mentor if 5-star
 * @param {string} id
 * @param {number} rating 1..5
 * @param {string|null} [comment]
 */
export function rateBooking(id, rating, comment = null) {
  return apiRequest(`/api/bookings/${id}/rate`, {
    method: 'POST',
    body: JSON.stringify({ rating, comment }),
  });
}

/**
 * POST /api/bookings/:id/notes
 * Saves/updates session notes summary (max 1000 chars)
 * @param {string} id
 * @param {string} summary
 */
export function updateBookingNotes(id, summary) {
  return apiRequest(`/api/bookings/${id}/notes`, {
    method: 'POST',
    body: JSON.stringify({ summary }),
  });
}

/**
 * GET /api/audit
 * Whole-system credit conservation and integrity report
 */
export function getAudit() {
  return apiRequest('/api/audit');
}

export function getLeaderboard() {
  return apiRequest('/api/leaderboard');
}

/**
 * POST /api/demo/reset
 * Resets database and active rooms to clean seed state (demo mode only)
 */
export function resetDemoData() {
  return apiRequest('/api/demo/reset', {
    method: 'POST',
  });
}

/**
 * GET /api/meta/match
 * Fetches scoring weights and topic keyword dictionary keys.
 */
export function getMetaMatch() {
  return apiRequest('/api/meta/match');
}

/**
 * GET /api/match
 * Smart match query for mentors based on problem text, topics, language, day, daypart, and online status.
 * @param {object} params
 * @param {AbortSignal} [signal]
 */
export function getSmartMatch(params = {}, signal = null) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      if (Array.isArray(value)) {
        if (value.length > 0) {
          searchParams.append(key, value.join(','));
        }
      } else {
        searchParams.append(key, value);
      }
    }
  }

  const queryString = searchParams.toString();
  const endpoint = queryString ? `/api/match?${queryString}` : '/api/match';
  return apiRequest(endpoint, { signal });
}




