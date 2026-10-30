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
