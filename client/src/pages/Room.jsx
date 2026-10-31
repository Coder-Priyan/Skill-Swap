import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import Editor from '@monaco-editor/react';
import monaco from '../monacoConfig';
import { getBooking, startBooking, completeBooking, getCurrentUserId } from '../api';
import { getSocket, connectSocket } from '../socket';
import RatingModal from '../components/RatingModal.jsx';
import VoiceControls from '../components/VoiceControls.jsx';

const LANGUAGES = [
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'Python', value: 'python' },
  { label: 'Java', value: 'java' },
  { label: 'C++', value: 'cpp' },
  { label: 'SQL', value: 'sql' },
  { label: 'HTML', value: 'html' },
  { label: 'CSS', value: 'css' },
];

export default function Room() {
  const { bookingId, roomId } = useParams();
  const targetId = bookingId || roomId;
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Settlement & Confirm Modals (Slice 6)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [settlementData, setSettlementData] = useState(null);

  // Connection status: 'live' | 'reconnecting' | 'offline'
  const [connStatus, setConnStatus] = useState('live');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Presence and Chat
  const [presenceUsers, setPresenceUsers] = useState([]);
  const [voicePeerIds, setVoicePeerIds] = useState([]);
  const [chatMessages, setChatMessages] = useState([]); // [{ id, userId, name, text, at, isSystem }]
  const [chatInput, setChatInput] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('javascript');

  const currentUserId = getCurrentUserId();
  const editorRef = useRef(null);
  const docRef = useRef(null);
  const providerRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const bindingRef = useRef(null);
  const chatBottomRef = useRef(null);
  const prevPresenceRef = useRef([]);

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  // Load booking and start session
  useEffect(() => {
    if (!targetId || !currentUserId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    getBooking(targetId)
      .then(async (data) => {
        if (!isMounted) return;

        // Verify status
        if (data.status === 'completed') {
          setBooking(data);
          setSessionEnded(true);
          setIsReadOnly(true);
          setLoading(false);
          const isLearner = data.learner_id === currentUserId;
          const isMentor = data.mentor_id === currentUserId;
          const userAlreadyRated = isLearner ? !!data.rating : !!data.mentor_rating;
          if (!userAlreadyRated) {
            setShowRatingModal(true);
          }
          return;
        }

        if (data.status !== 'accepted' && data.status !== 'in_progress') {
          setError(`Cannot open live room for booking in status "${data.status}"`);
          setLoading(false);
          return;
        }

        // Participant check
        if (data.learner_id !== currentUserId && data.mentor_id !== currentUserId) {
          setError('You are not an authorized participant for this session.');
          setLoading(false);
          return;
        }

        // Call POST /start (idempotent transition)
        try {
          const startedData = await startBooking(targetId);
          if (isMounted) {
            setBooking(startedData);
            setLoading(false);
          }
        } catch (startErr) {
          console.error('Failed to start booking:', startErr);
          if (isMounted) {
            setBooking(data);
            setLoading(false);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load booking:', err);
        if (isMounted) {
          setError(err.message || 'Booking not found');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [targetId, currentUserId]);

  // Live timer since started_at (stops when sessionEnded)
  useEffect(() => {
    if (!booking?.started_at || sessionEnded) return;

    const startMs = new Date(booking.started_at).getTime();
    const updateTimer = () => {
      const now = Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((now - startMs) / 1000)));
    };

    updateTimer();
    timerIntervalRef.current = setInterval(updateTimer, 1000);
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [booking?.started_at, sessionEnded]);

  // Handler for session:ended event or manual completion response
  const handleSessionEnded = useCallback((data) => {
    setSessionEnded(true);
    setIsReadOnly(true);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    if (editorRef.current) {
      try {
        editorRef.current.updateOptions({ readOnly: true });
      } catch (_) {}
    }
    setSettlementData(data);
    setShowRatingModal(true); // Automatically open rating for both peers
  }, []);

  // End session handler (trigger settlement)
  const handleEndSession = async () => {
    try {
      setEndingSession(true);
      const res = await completeBooking(targetId);
      setShowConfirmModal(false);
      if (res.settlement) {
        handleSessionEnded(res.settlement);
      }
    } catch (err) {
      console.error('Failed to end session:', err);
      alert(err.message || 'Failed to complete session');
    } finally {
      setEndingSession(false);
    }
  };

  // Socket.io room events: presence, chat, history
  useEffect(() => {
    if (!booking?.room_id) return;
    const socket = getSocket();
    if (!socket) return;

    const currentRoomId = booking.room_id;

    // Join room with ack callback
    socket.emit('room:join', { roomId: currentRoomId }, (ack) => {
      if (ack?.ok) {
        if (ack.history && Array.isArray(ack.history)) {
          setChatMessages(ack.history);
        }
      } else {
        console.warn('[Room] Join rejected:', ack?.error);
      }
    });

    const handlePresence = (data) => {
      if (data.roomId !== currentRoomId) return;
      const newUsers = data.users || [];
      const oldUsers = prevPresenceRef.current;

      // Add system messages for users joining or leaving
      if (oldUsers.length > 0) {
        newUsers.forEach((u) => {
          if (!oldUsers.some((o) => o.id === u.id)) {
            setChatMessages((prev) => [
              ...prev,
              {
                id: `sys_join_${u.id}_${Date.now()}`,
                isSystem: true,
                text: `${u.name} joined the room`,
                at: new Date().toISOString(),
              },
            ]);
          }
        });

        oldUsers.forEach((o) => {
          if (!newUsers.some((u) => u.id === o.id)) {
            setChatMessages((prev) => [
              ...prev,
              {
                id: `sys_leave_${o.id}_${Date.now()}`,
                isSystem: true,
                text: `${o.name} left the room`,
                at: new Date().toISOString(),
              },
            ]);
          }
        });
      }

      prevPresenceRef.current = newUsers;
      setPresenceUsers(newUsers);
    };

    const handleMessage = (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    };

    const handleConnect = () => setConnStatus('live');
    const handleDisconnect = () => setConnStatus('reconnecting');

    const handleVoicePeerJoined = (data) => {
      if (data?.userId) {
        setVoicePeerIds((prev) => Array.from(new Set([...prev, data.userId])));
      }
    };
    const handleVoicePeerLeft = (data) => {
      if (data?.userId) {
        setVoicePeerIds((prev) => prev.filter((id) => id !== data.userId));
      }
    };
    const handleVoiceEnded = () => {
      setVoicePeerIds([]);
    };

    socket.on('room:presence', handlePresence);
    socket.on('room:message', handleMessage);
    socket.on('session:ended', handleSessionEnded);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('rtc:peer-joined', handleVoicePeerJoined);
    socket.on('rtc:peer-left', handleVoicePeerLeft);
    socket.on('rtc:ended', handleVoiceEnded);

    return () => {
      socket.emit('room:leave', { roomId: currentRoomId });
      socket.off('room:presence', handlePresence);
      socket.off('room:message', handleMessage);
      socket.off('session:ended', handleSessionEnded);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('rtc:peer-joined', handleVoicePeerJoined);
      socket.off('rtc:peer-left', handleVoicePeerLeft);
      socket.off('rtc:ended', handleVoiceEnded);
    };
  }, [booking?.room_id, handleSessionEnded]);

  // Setup Monaco & Yjs
  const handleEditorDidMount = useCallback((editor) => {
    editorRef.current = editor;
    if (isReadOnly || sessionEnded) {
      try {
        editor.updateOptions({ readOnly: true });
      } catch (_) {}
    }
    if (!booking?.room_id) return;

    const doc = new Y.Doc();
    docRef.current = doc;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/yjs`;

    const provider = new WebsocketProvider(wsUrl, booking.room_id, doc, {
      params: { userId: currentUserId },
    });
    providerRef.current = provider;

    const ytext = doc.getText('code');
    const meta = doc.getMap('meta');

    // Awareness for remote cursors and names
    const awareness = provider.awareness;
    const currentUserProfile = booking.learner_id === currentUserId ? booking.learner : booking.mentor;
    awareness.setLocalStateField('user', {
      name: currentUserProfile?.name || 'Peer',
      color: currentUserProfile?.avatar_color || '#38bdf8',
    });

    // Monaco Yjs binding
    const binding = new MonacoBinding(
      ytext,
      editor.getModel(),
      new Set([editor]),
      awareness
    );
    bindingRef.current = binding;

    // Generate dynamic CSS for remote awareness selections and cursors
    awareness.on('change', () => {
      const states = awareness.getStates();
      let css = '';
      states.forEach((state, clientID) => {
        if (state.user) {
          const color = state.user.color || '#38bdf8';
          const name = state.user.name || 'Peer';
          css += `
            .yRemoteSelection.yRemoteSelection-${clientID} {
              background-color: ${color}20 !important;
            }
            .yRemoteSelectionHead.yRemoteSelectionHead-${clientID} {
              position: absolute;
              border-left: 2px solid ${color} !important;
              height: 100%;
              box-sizing: border-box;
            }
            .yRemoteSelectionHead.yRemoteSelectionHead-${clientID}::after {
              position: absolute;
              content: '${name.replace(/'/g, "\\'")}';
              top: -14px;
              left: 2px;
              background: rgba(13, 17, 26, 0.75) !important;
              border: 1px solid ${color}aa !important;
              color: #f1f5f9 !important;
              font-size: 9px !important;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif !important;
              font-weight: 600 !important;
              padding: 0 4px !important;
              border-radius: 3px !important;
              white-space: nowrap !important;
              pointer-events: none !important;
              z-index: 40 !important;
              line-height: 12px !important;
              backdrop-filter: blur(4px) !important;
              opacity: 0.85;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3) !important;
            }
          `;
        }
      });

      let styleEl = document.getElementById('yjs-cursor-styles');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'yjs-cursor-styles';
        document.head.appendChild(styleEl);
      }
      styleEl.innerHTML = css;
    });

    // Sync status listeners
    provider.on('status', ({ status }) => {
      if (status === 'connected') setConnStatus('live');
      else if (status === 'connecting') setConnStatus('reconnecting');
      else setConnStatus('offline');
    });

    // Language synchronization via Y.Map meta
    meta.observe(() => {
      const lang = meta.get('language') || 'javascript';
      setSelectedLanguage(lang);
      const model = editor.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, lang);
      }
    });

    // Initial code seeding: ONLY THE LEARNER on initial sync
    provider.on('synced', (isSynced) => {
      if (isSynced && booking.learner_id === currentUserId) {
        if (ytext.length === 0 && !meta.get('seeded')) {
          doc.transact(() => {
            ytext.insert(
              0,
              `// Topic: ${booking.topic}\n// Problem: ${booking.problem_note}\n\n`
            );
            meta.set('seeded', true);
          });
        }
      }
    });
  }, [booking, currentUserId]);

  // Cleanup Monaco & Yjs on unmount
  useEffect(() => {
    return () => {
      if (bindingRef.current) bindingRef.current.destroy();
      if (providerRef.current) providerRef.current.destroy();
      if (docRef.current) docRef.current.destroy();
      const styleEl = document.getElementById('yjs-cursor-styles');
      if (styleEl) styleEl.remove();
    };
  }, []);

  const handleLanguageChange = (newLang) => {
    setSelectedLanguage(newLang);
    if (docRef.current) {
      const meta = docRef.current.getMap('meta');
      meta.set('language', newLang);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || text.length > 500) return;

    const socket = getSocket();
    if (socket && booking?.room_id) {
      socket.emit('room:message', {
        roomId: booking.room_id,
        text,
      });
      setChatInput('');
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hrs}:${String(remMins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="room-loading-container">
        <div className="spinner" />
        <p>Connecting to live mentorship room...</p>
      </div>
    );
  }

  if (sessionEnded && !showRatingModal && !settlementData) {
    const isLearner = booking?.learner_id === currentUserId;
    const isMentor = booking?.mentor_id === currentUserId;
    const userAlreadyRated = isLearner ? !!booking?.rating : !!booking?.mentor_rating;

    return (
      <div className="room-centered-state-wrapper">
        <div className="card room-notice-card">
          <div className="notice-icon-wrapper" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2 className="notice-title">This session has ended</h2>
          <p className="notice-desc">
            The collaborative code and mentorship session have completed and the room is closed. Escrow credits have been settled on the audited ledger.
          </p>

          {booking && (
            <div className="notice-summary-box">
              <div className="summary-item">
                <span className="summary-label">Topic:</span>
                <span className="summary-val">{booking.topic}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Audited Escrow:</span>
                <span className="summary-val monospace-tabular">{booking.cost} credits</span>
              </div>
              {booking.learner && booking.mentor && (
                <div className="summary-item">
                  <span className="summary-label">Peers:</span>
                  <span className="summary-val">{booking.learner.name} (Learner) & {booking.mentor.name} (Mentor)</span>
                </div>
              )}
            </div>
          )}

          <div className="notice-actions">
            {!userAlreadyRated && booking && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowRatingModal(true)}
              >
                Rate this Session
              </button>
            )}
            {booking && (
              <Link to={`/sessions/${booking.id}`} className="btn btn-secondary">
                View Saved Code & Notes
              </Link>
            )}
            <Link to="/bookings" className="btn btn-secondary">
              Back to Bookings
            </Link>
          </div>
        </div>

        {/* Post-Session Mutual Rating Modal */}
        <RatingModal
          booking={booking}
          isOpen={showRatingModal}
          onClose={() => setShowRatingModal(false)}
          onSuccess={(updated) => {
            setShowRatingModal(false);
            if (updated) setBooking((prev) => ({ ...prev, ...updated }));
          }}
        />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="room-centered-state-wrapper">
        <div className="card room-notice-card">
          <div className="notice-icon-wrapper" style={{ borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.1)' }} aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 className="notice-title">Access Restricted</h2>
          <p className="notice-desc">{error || 'Room unavailable'}</p>
          <div className="notice-actions">
            <Link to="/bookings" className="btn btn-secondary">
              Back to Bookings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isLearnerPresent = presenceUsers.some((u) => u.id === booking.learner_id);
  const isMentorPresent = presenceUsers.some((u) => u.id === booking.mentor_id);

  return (
    <div className="room-page-container room-layout-container">
      {/* Top Header Bar */}
      <header className="room-header-bar">
        <div className="room-header-left">
          <Link to="/bookings" className="room-back-btn" title="Leave room view">
            ← Bookings
          </Link>

          <span className="room-header-sep" />

          <div className="room-topic-badge">
            <span className="topic-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="9" x2="20" y2="9" />
                <line x1="4" y1="15" x2="20" y2="15" />
                <line x1="10" y1="3" x2="8" y2="21" />
                <line x1="16" y1="3" x2="14" y2="21" />
              </svg>
            </span>
            <span className="topic-title">{booking.topic}</span>
          </div>

          <span className="room-header-sep" />

          <div className="room-participants-presence">
            {/* Learner */}
            <div className="presence-participant-chip" title={isLearnerPresent ? `${booking.learner.name} is present` : `${booking.learner.name} is offline`}>
              <div className="chip-avatar" style={{ backgroundColor: booking.learner.avatar_color }}>
                {booking.learner.name.charAt(0)}
              </div>
              <span className="chip-name">{booking.learner.name}</span>
              <span className="chip-role">Learner</span>
              {voicePeerIds.includes(booking.learner_id) && (
                <span className="chip-voice-icon" title={`${booking.learner.name} is in voice call`} aria-label="In voice">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  </svg>
                </span>
              )}
              <span className={`presence-dot ${isLearnerPresent ? 'online' : 'offline'}`} />
            </div>

            {/* Mentor */}
            <div className="presence-participant-chip" title={isMentorPresent ? `${booking.mentor.name} is present` : `${booking.mentor.name} is offline`}>
              <div className="chip-avatar" style={{ backgroundColor: booking.mentor.avatar_color }}>
                {booking.mentor.name.charAt(0)}
              </div>
              <span className="chip-name">{booking.mentor.name}</span>
              <span className="chip-role">Mentor</span>
              {voicePeerIds.includes(booking.mentor_id) && (
                <span className="chip-voice-icon" title={`${booking.mentor.name} is in voice call`} aria-label="In voice">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  </svg>
                </span>
              )}
              <span className={`presence-dot ${isMentorPresent ? 'online' : 'offline'}`} />
            </div>
          </div>
        </div>

        <div className="room-header-right">
          {/* Live Timer */}
          <div className="live-timer-chip" title="Live session duration">
            <span className="timer-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </span>
            <span className="timer-text monospace-tabular">{formatTimer(elapsedSeconds)}</span>
          </div>

          {/* Connection Status Badge */}
          <div className={`connection-status-badge status-${connStatus}`}>
            <span className="status-indicator-dot" />
            <span className="status-label">
              {connStatus === 'live' ? 'Live' : connStatus === 'reconnecting' ? 'Reconnecting' : 'Offline'}
            </span>
          </div>

          {/* Escrow Credit Chip */}
          <div className="room-cost-chip" title="Session credits locked in escrow until completion">
            <svg className="escrow-shield-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span className="monospace-tabular">{booking.cost} cr</span>
            <span className="escrow-subtext">Escrow</span>
          </div>

          {/* End Session Button or Ended Chip */}
          {sessionEnded ? (
            <div className="session-ended-chip" title="Session has completed and editor is read-only">
              <span className="ended-chip-dot" />
              <span>Session Ended</span>
            </div>
          ) : (
            <button
              className="btn btn-sm btn-danger end-session-btn"
              onClick={() => setShowConfirmModal(true)}
              disabled={endingSession || sessionEnded}
              title="End session and settle credits"
            >
              {endingSession ? 'Settling...' : 'End session'}
            </button>
          )}
        </div>
      </header>

      {/* Main Collaborative Area */}
      <div className="room-workspace-grid">
        {/* Monaco Editor Pane */}
        <div className="editor-pane-container">
          <div className="editor-controls-bar">
            <div className="editor-file-tab active">
              <span className="file-tab-icon">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </span>
              <span className="file-tab-name">
                {selectedLanguage === 'python' ? 'solution.py' : selectedLanguage === 'javascript' ? 'solution.js' : selectedLanguage === 'typescript' ? 'solution.ts' : selectedLanguage === 'cpp' ? 'solution.cpp' : selectedLanguage === 'html' ? 'index.html' : selectedLanguage === 'css' ? 'styles.css' : 'query.sql'}
              </span>
              <span className="file-tab-live-badge">live</span>
            </div>

            <div className="editor-controls-right">
              <div className="editor-language-select-wrap">
                <span className="control-label">Lang:</span>
                <select
                  className="language-select-dropdown"
                  value={selectedLanguage}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  aria-label="Select Programming Language"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="editor-status-indicators">
                <span className="editor-collab-tag" title="Peer-to-peer real-time document synchronization via CRDT">
                  <span className="presence-dot online" style={{ width: '6px', height: '6px' }} />
                  <span>CRDT Active</span>
                </span>
              </div>
            </div>
          </div>

          <div className="monaco-wrapper">
            <Editor
              height="100%"
              theme="vs-dark"
              language={selectedLanguage}
              options={{
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                lineNumbers: 'on',
                automaticLayout: true,
                padding: { top: 12, bottom: 12 },
              }}
              onMount={handleEditorDidMount}
            />
          </div>
        </div>

        {/* Live Chat Panel */}
        <div className="room-chat-panel">
          {/* Audio-only Voice Call in Room */}
          {!sessionEnded && (
            <VoiceControls
              roomId={booking.room_id}
              booking={booking}
              currentUserId={currentUserId}
              onVoicePeersChange={(peers) => {
                setVoicePeerIds((prev) => Array.from(new Set([...prev, ...peers])));
              }}
            />
          )}

          <div className="chat-panel-header">
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Session Chat</span>
            </h4>
            <span className="chat-online-count monospace-tabular">
              {presenceUsers.length} in room
            </span>
          </div>

          <div className="chat-messages-container">
            {chatMessages.length === 0 ? (
              <div className="chat-empty-hint">
                <span>Say hello to start coordinating your session!</span>
              </div>
            ) : (
              chatMessages.map((msg) => {
                if (msg.isSystem) {
                  return (
                    <div key={msg.id} className="chat-system-msg">
                      <span>{msg.text}</span>
                    </div>
                  );
                }

                const isOwn = msg.userId === currentUserId;
                return (
                  <div
                    key={msg.id}
                    className={`chat-bubble-wrap ${isOwn ? 'own-bubble' : 'peer-bubble'}`}
                  >
                    {!isOwn && (
                      <span className="chat-sender-name">{msg.name}</span>
                    )}
                    <div className="chat-bubble">{msg.text}</div>
                    <span className="chat-msg-time">
                      {new Date(msg.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={chatBottomRef} />
          </div>

          <form className="chat-input-form" onSubmit={handleSendMessage}>
            <input
              type="text"
              className="chat-input-field"
              placeholder="Type a message (Enter to send)..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              maxLength={500}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm chat-send-btn"
              disabled={!chatInput.trim()}
            >
              Send
            </button>
          </form>
        </div>
      </div>

      {/* Confirm End Session Modal */}
      {showConfirmModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
          <div className="modal-card confirm-modal">
            <div className="modal-header">
              <div className="confirm-icon-pill">
                <svg className="confirm-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>Complete & Settle</span>
              </div>
              <h2 id="confirm-modal-title" className="modal-title">
                End Pair Mentorship Session?
              </h2>
              <p className="modal-subtitle">
                This will lock the collaborative code editor and release escrow credits.
              </p>
            </div>

            <div className="confirm-transfer-card">
              <div className="transfer-party">
                <span className="party-role">Learner</span>
                <span className="party-name">{booking?.learner?.name}</span>
              </div>
              <div className="transfer-flow">
                <span className="transfer-amount monospace-tabular">{booking?.cost || 5} cr</span>
                <span className="transfer-arrow">→</span>
              </div>
              <div className="transfer-party">
                <span className="party-role">Mentor</span>
                <span className="party-name">{booking?.mentor?.name}</span>
              </div>
            </div>

            <p className="confirm-followup-hint">
              Both participants will be prompted to exchange ratings and technical feedback upon completion.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary modal-skip-btn"
                onClick={() => setShowConfirmModal(false)}
                disabled={endingSession}
              >
                Keep Pairing
              </button>
              <button
                type="button"
                className="btn btn-danger confirm-end-action-btn"
                onClick={handleEndSession}
                disabled={endingSession}
              >
                {endingSession ? 'Settling...' : 'Confirm & End Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-Session Mutual Rating Modal for Both Learner and Mentor */}
      <RatingModal
        booking={booking}
        isOpen={showRatingModal}
        onClose={() => setShowRatingModal(false)}
        onSuccess={(updatedBooking) => {
          setShowRatingModal(false);
          if (updatedBooking) {
            setBooking((prev) => ({ ...prev, ...updatedBooking }));
          }
        }}
      />

      {/* Settlement Result Modal (shown once rating is submitted or skipped) */}
      {settlementData && !showRatingModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card settlement-modal">
            <div className="settlement-modal-header">
              <div className="settlement-modal-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h2 className="modal-title">Session Complete & Settled</h2>
              <p className="modal-subtitle">Escrow released and ledger transactions audited</p>
            </div>

            <div className="settlement-modal-body">
              <div className="settlement-transfer-banner">
                <span className="transfer-badge">Audited Ledger Transfer</span>
                <p className="settlement-credits-transfer-line">
                  <strong className="monospace-tabular">{settlementData.amount} cr</strong> transferred from{' '}
                  <span className="party-highlight">{settlementData.learner?.name || booking?.learner?.name}</span> to{' '}
                  <span className="party-highlight">{settlementData.mentor?.name || booking?.mentor?.name}</span>
                </p>
              </div>

              {typeof settlementData.my_new_balance === 'number' && (
                <div className="settlement-user-balance-box">
                  <span className="balance-label">Your updated balance:</span>
                  <span className="balance-value monospace-tabular">{settlementData.my_new_balance} cr</span>
                </div>
              )}

              {settlementData.leveled_up && (
                <div className="settlement-levelup-card">
                  <div className="levelup-badge-tag">Level Promotion</div>
                  <div className="levelup-text">
                    <strong>{settlementData.mentor?.name || booking?.mentor?.name}</strong> reached{' '}
                    <strong>Level {settlementData.mentor_level_after} ({settlementData.mentor_level_after === 3 ? 'Mentor' : 'Helper'})</strong>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions settlement-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSettlementData(null)}
              >
                Inspect Code
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate(`/sessions/${booking.id}`)}
              >
                View Saved Code & Notes
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate('/bookings')}
              >
                Back to Bookings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
