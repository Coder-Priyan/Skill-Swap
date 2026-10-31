import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation, useParams } from 'react-router-dom';
import { getUsers, getUserProfile, getCurrentUserId, setCurrentUserId, getBookingsSummary, getMeta, resetDemoData } from './api';
import { connectSocket, subscribeToSocketEvent, disconnectSocket } from './socket';
import UserSwitcher from './components/UserSwitcher';
import Toasts from './components/Toasts';
import ErrorBoundary from './components/ErrorBoundary';
import Directory from './pages/Directory';
import Bookings from './pages/Bookings';
import Profile from './pages/Profile';
import Leaderboard from './pages/Leaderboard';
import Audit from './pages/Audit';
import NotFound from './pages/NotFound';

// Lazy-load heavy Monaco editor pages to keep main bundle fast (Slice 5 & 7)
const Room = React.lazy(() => import('./pages/Room'));
const SessionNotes = React.lazy(() => import('./pages/SessionNotes'));

function SessionNotesWrapper({ currentProfile, onNavigate }) {
  const { bookingId } = useParams();
  return (
    <SessionNotes
      bookingId={bookingId}
      currentUser={currentProfile}
      onBack={() => onNavigate('/bookings')}
    />
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserIdState] = useState(getCurrentUserId());
  const [currentProfile, setCurrentProfile] = useState(null);
  const [bookingsSummary, setBookingsSummary] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [demoMode, setDemoMode] = useState(false);

  // Dynamic document title update per route (Slice 7 polish)
  useEffect(() => {
    const path = location.pathname;
    let title = 'SkillSwap — Micro-Mentorship Hub';
    if (path === '/') title = 'SkillSwap | Find Mentors & Peers';
    else if (path.startsWith('/bookings')) title = 'SkillSwap | My Bookings';
    else if (path.startsWith('/profile') || path.startsWith('/users')) title = 'SkillSwap | Profile & Ledger';
    else if (path.startsWith('/leaderboard')) title = 'SkillSwap | Community Leaderboard';
    else if (path.startsWith('/audit')) title = 'SkillSwap | Ledger Audit & Conservation Proof';
    else if (path.startsWith('/room')) title = 'SkillSwap | Live Pairing Room';
    else if (path.startsWith('/sessions')) title = 'SkillSwap | Session Notes Archive';
    document.title = title;
  }, [location]);

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

    // Check if server is running in demo mode
    getMeta()
      .then((meta) => {
        if (meta && meta.demo_mode) {
          setDemoMode(true);
        }
      })
      .catch(() => {});
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
        title: 'Session Accepted',
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
          title: 'Session Live',
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

    const unsubEnded = subscribeToSocketEvent('session:ended', (data) => {
      const roomTarget = `/room/${data.bookingId}`;
      if (!window.location.pathname.startsWith(roomTarget)) {
        addToast({
          type: 'success',
          title: 'Session Settled',
          message: `${data.amount} credits moved from ${data.learner?.name || 'learner'} to ${data.mentor?.name || 'mentor'}`,
          link: '/profile',
          actionText: 'View ledger',
        });
      }
      refreshAllUserData();
    });

    const unsubRated = subscribeToSocketEvent('booking:rated', (data) => {
      addToast({
        type: 'success',
        title: 'Session Rated',
        message: data.message || `${data.learnerName || 'Your learner'} rated the session ${data.rating} stars!`,
        link: `/sessions/${data.bookingId}`,
        actionText: 'View notes',
      });
      refreshAllUserData();
    });

    const unsubDemoReset = subscribeToSocketEvent('demo:reset', () => {
      addToast({
        type: 'info',
        title: 'Demo Data Reset',
        message: 'Demo data was reset to pristine seed state.',
        link: '/',
      });
      refreshAllUserData();
      if (window.location.pathname.startsWith('/room/')) {
        navigate('/');
      }
    });

    return () => {
      unsubReq();
      unsubAcc();
      unsubDec();
      unsubCan();
      unsubStarted();
      unsubLedger();
      unsubEnded();
      unsubRated();
      unsubDemoReset();
    };
  }, [addToast, refreshAllUserData, navigate]);

  const handleResetDemo = async () => {
    if (
      window.confirm(
        'Reset all demo data to pristine initial state?\n\nThis will re-seed all 14 users, clear open collaborative rooms, and reset balances to baseline.'
      )
    ) {
      try {
        await resetDemoData();
        addToast({
          type: 'success',
          title: 'Demo Reset Complete',
          message: 'Database and live room state reset to clean seed.',
          link: '/',
        });
        navigate('/');
        refreshAllUserData();
      } catch (err) {
        addToast({
          type: 'error',
          title: 'Demo Reset Failed',
          message: err.message || 'Could not reset demo data.',
        });
      }
    }
  };

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
          <NavLink to="/" className="brand-logo" title="SkillSwap — Peer-to-Peer Micro-Mentorship">
            <span className="brand-logo-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 3 21 3 21 8" />
                <line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="21 16 21 21 16 21" />
                <line x1="15" y1="15" x2="21" y2="21" />
                <line x1="4" y1="4" x2="9" y2="9" />
              </svg>
            </span>
            <span className="brand-text">SkillSwap</span>
            <span className="brand-pill">Platform</span>
          </NavLink>

          <nav>
            <ul className="nav-links">
              <li>
                <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <span>Mentors</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/bookings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="18" r="3" />
                    <circle cx="6" cy="6" r="3" />
                    <path d="M13 6h3a2 2 0 0 1 2 2v7" />
                    <line x1="6" y1="9" x2="6" y2="21" />
                  </svg>
                  <span>Bookings</span>
                  {pendingMentorCount > 0 && (
                    <span className="nav-badge-count" title={`${pendingMentorCount} pending mentor requests`}>
                      {pendingMentorCount}
                    </span>
                  )}
                </NavLink>
              </li>
              <li>
                <NavLink to="/leaderboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  <span>Leaderboard</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/audit" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span>Audit</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/profile" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>Profile</span>
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
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="balance-coin-svg">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v12M8 10h8M8 14h6" />
              </svg>
              <span className="balance-amount">{currentProfile.balance} cr</span>
              {currentProfile.reserved_credits > 0 && (
                <span className="balance-reserved-chip">
                  ({currentProfile.reserved_credits} res.)
                </span>
              )}
            </div>
          )}

          {/* Demo tools button (when demo_mode is active) */}
          {demoMode && (
            <button
              className="btn-demo-tools"
              onClick={handleResetDemo}
              title="Reset demo data to clean seed"
              aria-label="Reset demo data"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              <span>Reset Demo</span>
            </button>
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
                <ErrorBoundary onRetry={() => window.location.reload()}>
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
                </ErrorBoundary>
              }
            />
            <Route
              path="/room/:bookingId/:roomId"
              element={
                <ErrorBoundary onRetry={() => window.location.reload()}>
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
                </ErrorBoundary>
              }
            />
            <Route
              path="/sessions/:bookingId"
              element={
                <ErrorBoundary onRetry={() => window.location.reload()}>
                  <React.Suspense
                    fallback={
                      <div className="loading-box">
                        <div className="spinner" />
                        <p>Loading session notes archive...</p>
                      </div>
                    }
                  >
                    <SessionNotesWrapper
                      currentProfile={currentProfile}
                      onNavigate={(path) => navigate(path)}
                    />
                  </React.Suspense>
                </ErrorBoundary>
              }
            />
            <Route
              path="/leaderboard"
              element={
                <Leaderboard
                  currentUser={currentProfile}
                  onSelectPeer={(id) => navigate(`/profile/${id}`)}
                />
              }
            />
            <Route
              path="/audit"
              element={<Audit currentUser={currentProfile} />}
            />
            <Route
              path="*"
              element={<NotFound onNavigateHome={() => navigate('/')} />}
            />
          </Routes>
        )}
      </main>
    </div>
  );
}
