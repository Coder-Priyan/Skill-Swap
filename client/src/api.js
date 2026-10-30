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
