import React, { useEffect, useState, useCallback } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { getUsers, getUserProfile, getCurrentUserId, setCurrentUserId } from './api';
import UserSwitcher from './components/UserSwitcher';
import Directory from './pages/Directory';
import Bookings from './pages/Bookings';
import Profile from './pages/Profile';
import Room from './pages/Room';
import Leaderboard from './pages/Leaderboard';
import Audit from './pages/Audit';

export default function App() {
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserIdState] = useState(getCurrentUserId());
  const [currentProfile, setCurrentProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  // Fetch full user profile whenever currentUserId changes
  const fetchActiveUserProfile = useCallback((userId) => {
    if (!userId) return;
    getUserProfile(userId)
      .then((profile) => {
        setCurrentProfile(profile);
      })
      .catch((err) => {
        console.error('Failed to load profile for user:', userId, err);
      });
  }, []);

  useEffect(() => {
    if (currentUserId) {
      fetchActiveUserProfile(currentUserId);
    }
  }, [currentUserId, fetchActiveUserProfile]);

  const handleUserSwitch = (newUserId) => {
    setCurrentUserIdState(newUserId);
  };

  const getBadgeClass = (level) => {
    if (level === 3) return 'badge-level-3';
    if (level === 2) return 'badge-level-2';
    return 'badge-level-1';
  };

  return (
    <div className="app-container">
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
                  My Bookings
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
            <div className="balance-chip" title={`Total balance: ${currentProfile.balance} cr | Available: ${currentProfile.available_credits} cr`}>
              <span className="balance-icon">🪙</span>
              <span className="balance-amount">{currentProfile.balance}</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>cr</span>
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
            <Route path="/" element={<Directory currentUserId={currentUserId} currentProfile={currentProfile} />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/profile" element={<Profile currentProfile={currentProfile} />} />
            <Route path="/profile/:id" element={<Profile currentProfile={currentProfile} />} />
            <Route path="/room/:roomId" element={<Room />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/audit" element={<Audit />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
