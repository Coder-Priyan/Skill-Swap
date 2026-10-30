import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { getUsers, getUserProfile, getCurrentUserId, setCurrentUserId, getBookingsSummary } from './api';
import { connectSocket, subscribeToSocketEvent, disconnectSocket } from './socket';
import UserSwitcher from './components/UserSwitcher';
import Toasts from './components/Toasts';
import Directory from './pages/Directory';
import Bookings from './pages/Bookings';
import Profile from './pages/Profile';
import Leaderboard from './pages/Leaderboard';
import Audit from './pages/Audit';

// Lazy-load Room page to keep main bundle light (Slice 5)
const Room = React.lazy(() => import('./pages/Room'));

export default function App() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserIdState] = useState(getCurrentUserId());
  const [currentProfile, setCurrentProfile] = useState(null);
  const [bookingsSummary, setBookingsSummary] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Toast manager
  const addToast = useCallback((toast) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const newToast = { id, ...toast };
    setToasts((prev) => [...prev, newToast]);

    // Auto-dismiss after 6 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Fetch bookings summary for nav badge
  const refreshSummary = useCallback(async () => {
    try {
      const summary = await getBookingsSummary();
      setBookingsSummary(summary);
    } catch (err) {
      // ignore unauthenticated or background errors
    }
  }, []);

  // Fetch active user profile
  const fetchActiveUserProfile = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const profile = await getUserProfile(userId);
      setCurrentProfile(profile);
    } catch (err) {
      console.error('Failed to load profile for user:', userId, err);
    }
  }, []);

  // Refresh both profile and summary
  const refreshAllUserData = useCallback(() => {
    if (currentUserId) {
      fetchActiveUserProfile(currentUserId);
      refreshSummary();
    }
  }, [currentUserId, fetchActiveUserProfile, refreshSummary]);

  // Load all users on mount
  useEffect(() => {
    getUsers()
      .then((data) => {
        setUsers(data);
        const storedId = getCurrentUserId();
        const initialUser = data.find((u) => u.id === storedId) || data[0];
        if (initialUser) {
          setCurrentUserId(initialUser.id);
          setCurrentUserIdState(initialUser.id);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load users:', err);
        setError('Failed to connect to backend server. Make sure the server is running on port 4000.');
        setLoading(false);
      });
  }, []);

  // Connect socket and fetch data when currentUserId changes
  useEffect(() => {
    if (currentUserId) {
      fetchActiveUserProfile(currentUserId);
      refreshSummary();
      connectSocket(currentUserId);
    }
    return () => {
      // do not disconnect on re-renders, socket manager handles user switches
    };
  }, [currentUserId, fetchActiveUserProfile, refreshSummary]);

  // Listen for real-time socket events
  useEffect(() => {
    const unsubReq = subscribeToSocketEvent('booking:requested', (data) => {
      addToast({
        type: 'request',
        title: 'New Booking Request',
        message: `${data.booking?.learner?.name || 'A learner'} requested session: "${data.booking?.topic}"`,
        link: '/bookings',
        actionText: 'View requests',
      });
      refreshAllUserData();
    });

    const unsubAcc = subscribeToSocketEvent('booking:accepted', (data) => {
      addToast({
        type: 'accepted',
        title: 'Session Accepted! 🎉',
        message: `${data.booking?.mentor?.name || 'Your mentor'} accepted your booking for "${data.booking?.topic}"`,
        link: '/bookings',
        actionText: 'View booking',
      });
      refreshAllUserData();
    });

    const unsubDec = subscribeToSocketEvent('booking:declined', (data) => {
      addToast({
        type: 'declined',
        title: 'Session Declined',
        message: `${data.booking?.mentor?.name || 'Your mentor'} was unable to accept "${data.booking?.topic}"`,
        link: '/bookings',
      });
      refreshAllUserData();
    });

    const unsubCan = subscribeToSocketEvent('booking:cancelled', (data) => {
      addToast({
        type: 'cancelled',
        title: 'Session Cancelled',
        message: `Booking for "${data.booking?.topic}" was cancelled (${data.booking?.cancelled_by ? `by ${data.booking.cancelled_by}` : ''})`,
        link: '/bookings',
      });
      refreshAllUserData();
    });

    const unsubStarted = subscribeToSocketEvent('booking:started', (data) => {
      const roomTarget = `/room/${data.bookingId}`;
      if (!window.location.pathname.startsWith(roomTarget)) {
        addToast({
          type: 'success',
          title: 'Session Live! 🔴',
          message: data.message || 'Participant joined the room',
          link: roomTarget,
          actionText: 'Join now',
        });
      }
      refreshAllUserData();
    });

    const unsubLedger = subscribeToSocketEvent('ledger:updated', () => {
      refreshAllUserData();
    });

    return () => {
      unsubReq();
      unsubAcc();
      unsubDec();
      unsubCan();
      unsubStarted();
      unsubLedger();
    };
  }, [addToast, refreshAllUserData]);

  const handleUserSwitch = (newUserId) => {
    setCurrentUserIdState(newUserId);
  };

  const getBadgeClass = (level) => {
    if (level === 3) return 'badge-level-3';
    if (level === 2) return 'badge-level-2';
    return 'badge-level-1';
  };

  const pendingMentorCount = bookingsSummary?.pending_mentor || 0;

  return (
    <div className="app-container">
      {/* Toast Notification Stack */}
      <Toasts
        toasts={toasts}
        onDismiss={dismissToast}
        onNavigate={(path) => navigate(path)}
      />

      {/* Top bar / App Shell */}
      <header className="topbar">
        <div className="topbar-left">
          <NavLink to="/" className="brand-logo">
            <span className="logo-badge">⚡</span>
            <span>SkillSwap</span>
          </NavLink>

          <nav>
            <ul className="nav-links">
              <li>
                <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>
                  Find Peers
                </NavLink>
              </li>
              <li>
                <NavLink to="/bookings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <span>My Bookings</span>
                  {pendingMentorCount > 0 && (
                    <span className="nav-badge-count" title={`${pendingMentorCount} pending mentor requests`}>
                      {pendingMentorCount}
                    </span>
                  )}
                </NavLink>
              </li>
              <li>
                <NavLink to="/profile" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  Profile
                </NavLink>
              </li>
              <li>
                <NavLink to="/leaderboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  Leaderboard
                </NavLink>
              </li>
              <li>
                <NavLink to="/audit" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  Audit
                </NavLink>
              </li>
            </ul>
          </nav>
        </div>

        <div className="topbar-right">
          {/* Credit balance chip from GET /api/users/:id */}
          {currentProfile && (
            <div
              className={`balance-chip ${currentProfile.reserved_credits > 0 ? 'has-reserved' : ''}`}
              title={`Total balance: ${currentProfile.balance} cr | Available: ${currentProfile.available_credits} cr | Reserved: ${currentProfile.reserved_credits || 0} cr`}
            >
              <span className="balance-icon">🪙</span>
              <span className="balance-amount">{currentProfile.balance} cr</span>
              {currentProfile.reserved_credits > 0 && (
                <span className="balance-reserved-chip">
                  ({currentProfile.reserved_credits} reserved)
                </span>
              )}
            </div>
          )}

          {/* Level badge from GET /api/users/:id */}
          {currentProfile && (
            <div className={`badge-pill ${getBadgeClass(currentProfile.level)}`}>
              Lvl {currentProfile.level} • {currentProfile.badge}
            </div>
          )}

          {/* User Switcher Dropdown */}
          {users.length > 0 && (
            <UserSwitcher
              users={users}
              currentUserId={currentUserId}
              onUserChange={handleUserSwitch}
            />
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {loading && (
          <div className="loading-box">
            <div className="loading-spinner"></div>
            <p>Loading SkillSwap environment...</p>
          </div>
        )}

        {error && (
          <div className="error-box">
            <div className="error-title">Backend Connection Error</div>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && (
          <Routes>
            <Route
              path="/"
              element={
                <Directory
                  currentUserId={currentUserId}
                  currentProfile={currentProfile}
                  onBookingCreated={(booking) => {
                    addToast({
                      type: 'success',
                      title: 'Request Sent! 🚀',
                      message: `Booking request sent to ${booking.mentor?.name || 'mentor'}!`,
                      link: '/bookings',
                    });
                    refreshAllUserData();
                  }}
                />
              }
            />
            <Route
              path="/bookings"
              element={
                <Bookings
                  currentUserId={currentUserId}
                  onNavigate={(path) => navigate(path)}
                  onBookingsChange={refreshAllUserData}
                />
              }
            />
            <Route path="/profile" element={<Profile currentProfile={currentProfile} />} />
            <Route path="/profile/:id" element={<Profile currentProfile={currentProfile} />} />
            <Route path="/users/:id" element={<Profile currentProfile={currentProfile} />} />
            <Route
              path="/room/:bookingId"
              element={
                <React.Suspense
                  fallback={
                    <div className="loading-box">
                      <div className="spinner" />
                      <p>Loading session room...</p>
                    </div>
                  }
                >
                  <Room />
                </React.Suspense>
              }
            />
            <Route
              path="/room/:bookingId/:roomId"
              element={
                <React.Suspense
                  fallback={
                    <div className="loading-box">
                      <div className="spinner" />
                      <p>Loading session room...</p>
                    </div>
                  }
                >
                  <Room />
                </React.Suspense>
              }
            />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/audit" element={<Audit />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
