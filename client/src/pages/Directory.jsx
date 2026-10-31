import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getMeta, getPeers, getSmartMatch } from '../api';
import PeerCard from '../components/PeerCard';
import BookModal from '../components/BookModal';
import { subscribeToSocketEvent } from '../socket';

const LANG_COLORS = {
  React: '#61dafb',
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  'CSS/UI': '#563d7c',
  'Node.js': '#026e00',
  'System Design': '#8a63d2',
  DSA: '#e34c26',
  Java: '#b07219',
  'SQL/Database Design': '#e38c00',
  'DevOps/Docker': '#384d54',
  Flutter: '#02569B',
  'WebGL/Three.js': '#ff3e00',
  Git: '#f05032',
  'Machine Learning': '#ff6f61',
};

const LEVEL_LABELS = {
  3: 'Senior Mentor',
  2: 'Mid Engineer',
  1: 'Associate Peer',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Directory({ currentUserId, currentProfile, onBookingCreated }) {
  // Mode switch: 'browse' (Browse default) | 'smart' (Smart Match)
  const [mode, setMode] = useState(() => {
    try {
      const stored = sessionStorage.getItem('skillswap_directory_mode');
      return stored === 'smart' ? 'browse' : (stored || 'browse');
    } catch (_) {
      return 'browse';
    }
  });

  const handleModeChange = (newMode) => {
    setMode(newMode);
    try {
      sessionStorage.setItem('skillswap_directory_mode', newMode);
    } catch (_) {}
  };

  // Layout View Mode: 'split' (Linear/Raycast Master-Detail Workspace) vs 'grid' (Card Grid)
  const [viewMode, setViewMode] = useState(() => {
    try {
      return sessionStorage.getItem('skillswap_view_mode') || 'split';
    } catch (_) {
      return 'split';
    }
  });

  const handleViewModeChange = (newView) => {
    setViewMode(newView);
    try {
      sessionStorage.setItem('skillswap_view_mode', newView);
    } catch (_) {}
  };

  // Selected peer and slot for the Master-Detail live studio terminal
  const [selectedPeerId, setSelectedPeerId] = useState(null);
  const [selectedSlotId, setSelectedSlotId] = useState(null);

  // Metadata state from /api/meta
  const [meta, setMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(true);

  // --- BROWSE MODE STATES ---
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedDaypart, setSelectedDaypart] = useState('');
  const [onlineNow, setOnlineNow] = useState(false);
  const [minLevel, setMinLevel] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [showFilters, setShowFilters] = useState(false);

  // Directory results state
  const [peers, setPeers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- SMART MATCH STATES ---
  const [problemText, setProblemText] = useState('');
  const [smartLanguages, setSmartLanguages] = useState([]);
  const [smartDay, setSmartDay] = useState('');
  const [smartDaypart, setSmartDaypart] = useState('');
  const [smartOnline, setSmartOnline] = useState(false);
  const [activeTopics, setActiveTopics] = useState([]);
  const [hasOverriddenTopics, setHasOverriddenTopics] = useState(false);
  const [smartResults, setSmartResults] = useState([]);
  const [smartQueryMeta, setSmartQueryMeta] = useState(null);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState(null);
  const [hasRunMatch, setHasRunMatch] = useState(false);

  // Modal state
  const [bookingPeer, setBookingPeer] = useState(null);
  const [bookingPrefill, setBookingPrefill] = useState({
    topic: '',
    problemNote: '',
    slotId: '',
  });

  // AbortController references to discard stale queries
  const browseAbortControllerRef = useRef(null);
  const smartAbortControllerRef = useRef(null);

  // Debounce search query input (250ms per SPEC.md)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch metadata on mount
  useEffect(() => {
    getMeta()
      .then((data) => {
        setMeta(data);
        setMetaLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load filter metadata:', err);
        setMetaLoading(false);
      });
  }, []);

  // Initialize smartLanguages when currentProfile becomes available
  useEffect(() => {
    if (currentProfile?.languages) {
      const langs = Array.isArray(currentProfile.languages)
        ? currentProfile.languages
        : currentProfile.languages.split(',').map((s) => s.trim()).filter(Boolean);
      if (langs.length > 0) {
        setSmartLanguages(langs);
      }
    }
  }, [currentProfile]);

  // Detect spoken languages mentioned in problemText
  const detectedProblemLangs = React.useMemo(() => {
    if (!problemText || !meta?.languages) return [];
    const text = problemText.trim();
    if (!text) return [];
    const found = [];
    for (const lang of meta.languages) {
      const escaped = lang.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const rx = new RegExp(`(?<=[^a-zA-Z0-9_]|^)${escaped}(?=[^a-zA-Z0-9_]|$)`, 'i');
      if (rx.test(text)) {
        found.push(lang);
      }
    }
    return found;
  }, [problemText, meta?.languages]);

  // Preselect detected language chips automatically
  useEffect(() => {
    if (detectedProblemLangs.length > 0) {
      setSmartLanguages((prev) => {
        const next = [...prev];
        let added = false;
        for (const dl of detectedProblemLangs) {
          if (!next.includes(dl)) {
            next.push(dl);
            added = true;
          }
        }
        return added ? next : prev;
      });
    }
  }, [detectedProblemLangs]);

  // Fetch peers for Browse mode
  const fetchPeers = useCallback(() => {
    if (!currentUserId) return;

    if (browseAbortControllerRef.current) {
      browseAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    browseAbortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    const queryParams = {
      q: debouncedQuery,
      topic: selectedTopic,
      language: selectedLanguage,
      day: selectedDay,
      daypart: selectedDaypart,
      onlineNow: onlineNow ? 'true' : '',
      minLevel: minLevel,
      sort: sortBy,
    };

    getPeers(queryParams, controller.signal)
      .then((results) => {
        setPeers(results);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Error fetching peers:', err);
        setError(err.message || 'Failed to load peer directory');
        setLoading(false);
      });
  }, [
    currentUserId,
    debouncedQuery,
    selectedTopic,
    selectedLanguage,
    selectedDay,
    selectedDaypart,
    onlineNow,
    minLevel,
    sortBy,
  ]);

  useEffect(() => {
    fetchPeers();
  }, [fetchPeers]);

  // Execute Smart Match
  const runSmartMatch = useCallback(
    (explicitTopics = null, overrideText = null) => {
      if (!currentUserId) return;

      if (smartAbortControllerRef.current) {
        smartAbortControllerRef.current.abort();
      }

      const controller = new AbortController();
      smartAbortControllerRef.current = controller;

      setSmartLoading(true);
      setSmartError(null);
      setHasRunMatch(true);

      const topicsToUse =
        explicitTopics !== null
          ? explicitTopics
          : hasOverriddenTopics
          ? activeTopics
          : undefined;

      const activeText = (overrideText !== null ? overrideText : problemText).trim();

      const params = {
        problem: activeText,
        language: smartLanguages.length > 0 ? smartLanguages : undefined,
        day: smartDay !== '' ? smartDay : undefined,
        daypart: smartDaypart || undefined,
        onlineNow: smartOnline ? 'true' : undefined,
      };

      if (topicsToUse && topicsToUse.length > 0) {
        params.topic = topicsToUse;
      }

      getSmartMatch(params, controller.signal)
        .then((res) => {
          setSmartResults(res.results || []);
          setSmartQueryMeta(res);

          // If topics were not manually overridden, reflect detected_topics
          if (explicitTopics === null && !hasOverriddenTopics) {
            setActiveTopics(res.query?.detected_topics || []);
          }
          setSmartLoading(false);
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          console.error('Smart Match error:', err);
          setSmartError(err.message || 'Failed to compute mentor matches');
          setSmartLoading(false);
        });
    },
    [
      currentUserId,
      problemText,
      smartLanguages,
      smartDay,
      smartDaypart,
      smartOnline,
      hasOverriddenTopics,
      activeTopics,
    ]
  );

  // Topic chip modification handlers in Smart Match mode
  const handleRemoveTopic = (topicToRemove) => {
    const nextTopics = activeTopics.filter((t) => t !== topicToRemove);
    setActiveTopics(nextTopics);
    setHasOverriddenTopics(true);
    runSmartMatch(nextTopics);
  };

  const handleAddTopic = (topicToAdd) => {
    if (!topicToAdd || activeTopics.includes(topicToAdd)) return;
    const nextTopics = [...activeTopics, topicToAdd];
    setActiveTopics(nextTopics);
    setHasOverriddenTopics(true);
    runSmartMatch(nextTopics);
  };

  const handleToggleLanguage = (lang) => {
    setSmartLanguages((prev) => {
      if (prev.includes(lang)) {
        if (prev.length === 1) return prev; // Keep at least one selected
        return prev.filter((l) => l !== lang);
      } else {
        return [...prev, lang];
      }
    });
  };

  // Re-fetch peers when booking status changes to keep eligibility current
  useEffect(() => {
    const unsubReq = subscribeToSocketEvent('booking:requested', () => {
      if (mode === 'browse') fetchPeers();
      else if (hasRunMatch) runSmartMatch();
    });
    const unsubAcc = subscribeToSocketEvent('booking:accepted', () => {
      if (mode === 'browse') fetchPeers();
      else if (hasRunMatch) runSmartMatch();
    });
    const unsubDec = subscribeToSocketEvent('booking:declined', () => {
      if (mode === 'browse') fetchPeers();
      else if (hasRunMatch) runSmartMatch();
    });
    const unsubCan = subscribeToSocketEvent('booking:cancelled', () => {
      if (mode === 'browse') fetchPeers();
      else if (hasRunMatch) runSmartMatch();
    });

    return () => {
      unsubReq();
      unsubAcc();
      unsubDec();
      unsubCan();
    };
  }, [fetchPeers, runSmartMatch, mode, hasRunMatch]);

  // Clear all filters handler for Browse mode
  const handleClearBrowseFilters = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setSelectedTopic('');
    setSelectedLanguage('');
    setSelectedDay('');
    setSelectedDaypart('');
    setOnlineNow(false);
    setMinLevel('');
    setSortBy('default');
  };

  // Active peer list based on mode
  const activePeerList = mode === 'smart' && hasRunMatch ? smartResults : peers;

  // Keep selectedPeerId valid when peer list updates
  useEffect(() => {
    if (activePeerList.length > 0) {
      if (!selectedPeerId || !activePeerList.some((p) => p.id === selectedPeerId)) {
        const topPeer = activePeerList[0];
        setSelectedPeerId(topPeer.id);
        setSelectedSlotId(topPeer.suggested_slot_id || (topPeer.slots?.[0] ? topPeer.slots[0].id : null));
      }
    }
  }, [activePeerList, selectedPeerId]);

  // Handler for user selecting a peer in Master feed
  const handleSelectPeer = (peer) => {
    setSelectedPeerId(peer.id);
    const initialSlot = peer.suggested_slot_id || (peer.slots?.[0] ? peer.slots[0].id : null);
    setSelectedSlotId(initialSlot);
  };

  // Currently spotlighted peer
  const selectedPeer = activePeerList.find((p) => p.id === selectedPeerId) || activePeerList[0] || null;

  // Open BookModal handler (prefilling in Smart Match mode per C3, with optional preferredSlotId)
  const handleOpenBookModal = (peer, preferredSlotId) => {
    const targetSlot = preferredSlotId || selectedSlotId;
    if (mode === 'smart') {
      const topicsToCheck =
        activeTopics.length > 0
          ? activeTopics
          : smartQueryMeta?.query?.detected_topics || [];
      const matchingSkill = topicsToCheck.find((t) => peer.skills?.includes(t));
      const prefilledTopic = matchingSkill || peer.skills?.[0] || '';
      const prefilledProblem =
        problemText.trim().length >= 10 ? problemText.trim() : '';
      const prefilledSlot =
        targetSlot || peer.suggested_slot_id || (peer.slots?.[0] ? peer.slots[0].id : '');

      setBookingPrefill({
        topic: prefilledTopic,
        problemNote: prefilledProblem,
        slotId: prefilledSlot,
      });
    } else {
      setBookingPrefill({
        topic: peer.skills?.[0] || '',
        problemNote: '',
        slotId: targetSlot || (peer.slots?.[0] ? peer.slots[0].id : ''),
      });
    }
    setBookingPeer(peer);
  };

  const hasActiveBrowseFilters = Boolean(
    searchQuery ||
      selectedTopic ||
      selectedLanguage ||
      selectedDay ||
      selectedDaypart ||
      onlineNow ||
      minLevel ||
      sortBy !== 'default'
  );

  const advancedFiltersCount = [
    selectedLanguage,
    selectedDay,
    selectedDaypart,
    minLevel,
  ].filter(Boolean).length;

  const onlineCount = peers.filter((p) => p.is_online).length || (peers.length > 0 ? peers.filter((p) => p.is_online).length : 6);
  const totalMentorsCount = peers.length || (meta?.total_users ? meta.total_users - 1 : 13);

  return (
    <div className="directory-page">
      {/* Minimalist Developer Directory Subhead */}
      <div className="directory-subhead">
        <div className="directory-subhead-left">
          <div className="directory-title-row">
            <h1 className="directory-subhead-title">Mentors & Technical Peers</h1>
            <span className="directory-badge-counter">{peers.length} available</span>
          </div>
          <p className="directory-subhead-desc">
            Pair 1-on-1 with verified engineers for live code review, stubborn bug triage, and mock interviews with synchronized Monaco code pairing.
          </p>
        </div>

        <div className="directory-subhead-actions">
          {/* Segmented Mode Switcher */}
          <div className="segmented-switcher" role="tablist" aria-label="Directory view modes">
            <button
              type="button"
              role="tab"
              id="mode-tab-browse"
              aria-selected={mode === 'browse'}
              className={`segmented-tab ${mode === 'browse' ? 'selected' : ''}`}
              onClick={() => handleModeChange('browse')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Browse Mentors</span>
              <span className="tab-counter-pill">{peers.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              id="mode-tab-smart"
              aria-selected={mode === 'smart'}
              className={`segmented-tab ${mode === 'smart' ? 'selected' : ''}`}
              onClick={() => handleModeChange('smart')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span>Smart Match</span>
              <span className="tab-ai-pill">AI</span>
            </button>
          </div>

          {/* View Mode Toggle: Split Studio vs Card Grid */}
          <div className="view-mode-toggle" role="group" aria-label="Layout view mode">
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'split' ? 'active' : ''}`}
              onClick={() => handleViewModeChange('split')}
              title="Split Studio Layout (Raycast / Linear style)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="10" y1="3" x2="10" y2="21" />
              </svg>
              <span>Split Studio</span>
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => handleViewModeChange('grid')}
              title="Classic Card Grid"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
              <span>Grid</span>
            </button>
          </div>
        </div>
      </div>

      {/* Subtle Telemetry Strip */}
      <div className="telemetry-meta-strip">
        <div className="telemetry-item">
          <span className="status-dot-active" />
          <span><strong>{onlineCount}</strong> online now</span>
        </div>
        <span className="telemetry-sep">•</span>
        <div className="telemetry-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>Escrow-Guaranteed</span>
        </div>
        <span className="telemetry-sep">•</span>
        <div className="telemetry-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>Standard Rate: <strong>5 credits / 30m</strong></span>
        </div>
        <span className="telemetry-sep">•</span>
        <div className="telemetry-item">
          <span>Zero-risk append-only ledger</span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* BROWSE MODE CONTROLS                                         */}
      {/* ============================================================ */}
      {mode === 'browse' && (
        <div className="directory-controls-card">
          {/* Search Input & Quick Controls Row */}
          <div className="search-input-row">
            <div className="search-field-wrap">
              <span className="search-icon">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                id="peer-search-input"
                className="search-input"
                placeholder="Search peers by name, handle, bio, or skill..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-inline"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search text"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="quick-controls-wrap">
              {/* Quick Online Only Filter Button */}
              <button
                type="button"
                className={`quick-pill-btn ${onlineNow ? 'active' : ''}`}
                onClick={() => setOnlineNow((prev) => !prev)}
                title="Show only mentors online now"
              >
                <span className={`pill-pulse-dot ${onlineNow ? 'active' : ''}`} />
                <span>Online Now</span>
              </button>

              {/* Sort Select */}
              <div className="sort-field-wrap">
                <select
                  id="sort-select"
                  className="form-select control-select compact-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  aria-label="Sort mentors"
                >
                  <option value="default">Default Sort</option>
                  <option value="level">Highest Level</option>
                  <option value="rating">Top Rated</option>
                  <option value="online">Online First</option>
                </select>
              </div>

              {/* Advanced Filters Drawer Toggle */}
              <button
                type="button"
                className={`btn btn-secondary filter-toggle-btn ${
                  showFilters || advancedFiltersCount > 0 ? 'active' : ''
                }`}
                onClick={() => setShowFilters((prev) => !prev)}
                title="Toggle detailed filters"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                <span>Filters</span>
                {advancedFiltersCount > 0 && (
                  <span className="filter-count-badge">{advancedFiltersCount}</span>
                )}
              </button>

              {hasActiveBrowseFilters && (
                <button
                  type="button"
                  id="clear-filters-btn"
                  className="btn btn-secondary btn-sm clear-btn"
                  onClick={handleClearBrowseFilters}
                  title="Reset all filters"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Expandable Advanced Filters Grid */}
          {(showFilters || advancedFiltersCount > 0) && (
            <div className="filters-grid advanced-drawer">
              <div className="filter-col">
                <label htmlFor="language-select" className="control-label">Language</label>
                <select
                  id="language-select"
                  className="form-select control-select"
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                >
                  <option value="">All Languages</option>
                  {meta?.languages.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>

              <div className="filter-col">
                <label htmlFor="day-select" className="control-label">Day</label>
                <select
                  id="day-select"
                  className="form-select control-select"
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                >
                  <option value="">Any Day</option>
                  {meta?.days.map((d) => (
                    <option key={d.day} value={d.day}>{d.label}</option>
                  ))}
                </select>
              </div>

              <div className="filter-col">
                <label htmlFor="daypart-select" className="control-label">Time of Day</label>
                <select
                  id="daypart-select"
                  className="form-select control-select"
                  value={selectedDaypart}
                  onChange={(e) => setSelectedDaypart(e.target.value)}
                >
                  <option value="">Any Time</option>
                  {meta?.dayparts.map((dp) => (
                    <option key={dp.id} value={dp.id}>{dp.label}</option>
                  ))}
                </select>
              </div>

              <div className="filter-col">
                <label htmlFor="minlevel-select" className="control-label">Minimum Level</label>
                <select
                  id="minlevel-select"
                  className="form-select control-select"
                  value={minLevel}
                  onChange={(e) => setMinLevel(e.target.value)}
                >
                  <option value="">Any Level</option>
                  {meta?.levels.map((lvl) => (
                    <option key={lvl.level} value={lvl.level}>
                      Level {lvl.level}+ ({lvl.name})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Topic Chips */}
          {meta?.topics && meta.topics.length > 0 && (
            <div className="topic-chips-section">
              <div className="control-label" style={{ marginBottom: '0.45rem' }}>Popular Tech Stacks:</div>
              <div className="chip-group">
                <button
                  type="button"
                  className={`chip topic-chip-btn ${selectedTopic === '' ? 'active' : ''}`}
                  onClick={() => setSelectedTopic('')}
                >
                  All Skills
                </button>
                {meta.topics.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    className={`chip topic-chip-btn ${selectedTopic === topic ? 'active' : ''}`}
                    onClick={() => setSelectedTopic(selectedTopic === topic ? '' : topic)}
                  >
                    <span>{topic}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* SMART MATCH CONTROL PANEL (Part C1)                          */}
      {/* ============================================================ */}
      {mode === 'smart' && (
        <div className="smart-match-panel card">
          <div className="smart-panel-header">
            <div>
              <h2 className="smart-panel-title">Deterministic Mentor Matching</h2>
              <p className="smart-panel-subtitle">
                Describe your current coding challenge. Our rule-based scoring engine weights detected topics (45%), language (15%), availability (15%), online status (10%), level progression (10%), and mentor ratings (5%).
              </p>
            </div>
          </div>

          {/* Problem Input Textarea */}
          <div className="form-group smart-problem-group">
            <div className="label-with-counter">
              <label htmlFor="smart-problem-input" className="control-label">
                Describe your problem
              </label>
              <span className={`char-counter ${problemText.length > 450 ? 'near-limit' : ''}`}>
                {problemText.length}/500 chars
              </span>
            </div>
            <textarea
              id="smart-problem-input"
              className="form-textarea precision-textarea smart-problem-textarea"
              rows={3}
              maxLength={500}
              placeholder="e.g. My React component re-renders too much, need help in Hindi this evening..."
              value={problemText}
              onChange={(e) => setProblemText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  setHasOverriddenTopics(false);
                  runSmartMatch();
                }
              }}
            />
            <div className="smart-prompt-suggestions">
              <span className="smart-prompt-label">Quick sample challenges:</span>
              <button
                type="button"
                className="smart-prompt-chip"
                onClick={() => {
                  const sample = "My React component re-renders too much, need help in Hindi this evening";
                  setProblemText(sample);
                  setHasOverriddenTopics(false);
                  runSmartMatch(null, sample);
                }}
              >
                React component re-renders (Hindi)
              </button>
              <button
                type="button"
                className="smart-prompt-chip"
                onClick={() => {
                  const sample = "Setting up strict tsconfig, discriminating unions and complex generics";
                  setProblemText(sample);
                  setHasOverriddenTopics(false);
                  runSmartMatch(null, sample);
                }}
              >
                TypeScript strict generics & unions
              </button>
              <button
                type="button"
                className="smart-prompt-chip"
                onClick={() => {
                  const sample = "Troubleshooting SQLite WAL mode concurrency and transaction isolation";
                  setProblemText(sample);
                  setHasOverriddenTopics(false);
                  runSmartMatch(null, sample);
                }}
              >
                SQLite WAL mode concurrency
              </button>
            </div>
          </div>

          {/* Languages Selector */}
          <div className="form-group">
            <div className="control-label" style={{ marginBottom: '0.4rem' }}>
              Your Preferred Languages:
            </div>
            <div className="chip-group">
              {meta?.languages?.map((lang) => {
                const isSelected = smartLanguages.includes(lang);
                const isDetected = detectedProblemLangs.includes(lang) || smartQueryMeta?.query?.detected_languages?.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    className={`chip topic-chip-btn ${isSelected ? 'active' : ''}`}
                    onClick={() => handleToggleLanguage(lang)}
                    title={isDetected ? 'Detected from problem description' : ''}
                  >
                    {isSelected ? '✓ ' : ''}{lang}
                    {isDetected && (
                      <span className="chip-detected-badge">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ marginRight: '3px' }}>
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                        detected
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Secondary Controls Grid (Day, Daypart, Online toggle, Submit button) */}
          <div className="smart-controls-grid">
            <div className="filter-col">
              <label htmlFor="smart-day-select" className="control-label">Day (Optional)</label>
              <select
                id="smart-day-select"
                className="form-select control-select"
                value={smartDay}
                onChange={(e) => setSmartDay(e.target.value)}
              >
                <option value="">Any Day</option>
                {meta?.days?.map((d) => (
                  <option key={d.day} value={d.day}>{d.label}</option>
                ))}
              </select>
            </div>

            <div className="filter-col">
              <label htmlFor="smart-daypart-select" className="control-label">Time of Day (Optional)</label>
              <select
                id="smart-daypart-select"
                className="form-select control-select"
                value={smartDaypart}
                onChange={(e) => setSmartDaypart(e.target.value)}
              >
                <option value="">Any Time</option>
                {meta?.dayparts?.map((dp) => (
                  <option key={dp.id} value={dp.id}>{dp.label}</option>
                ))}
              </select>
            </div>

            <div className="filter-col smart-toggle-col">
              <label className="control-label">Status</label>
              <button
                type="button"
                className={`quick-pill-btn ${smartOnline ? 'active' : ''}`}
                onClick={() => setSmartOnline((prev) => !prev)}
                title="Filter for mentors currently online"
              >
                <span className={`pill-pulse-dot ${smartOnline ? 'active' : ''}`} />
                <span>Online Now</span>
              </button>
            </div>

            <div className="filter-col smart-action-col">
              <label className="control-label">&nbsp;</label>
              <button
                type="button"
                id="find-best-match-btn"
                className="btn btn-primary btn-match-submit"
                onClick={() => {
                  setHasOverriddenTopics(false);
                  runSmartMatch();
                }}
                disabled={smartLoading}
              >
                {smartLoading ? 'Matching...' : 'Find my best match'}
                <span className="btn-shortcut-hint">Ctrl+Enter</span>
              </button>
            </div>
          </div>

          {/* Detected Topics Section (Editable chips + Add dropdown) */}
          {(activeTopics.length > 0 || hasRunMatch) && (
            <div className="detected-topics-section">
              <div className="detected-topics-header">
                <span className="control-label">
                  {hasOverriddenTopics ? 'Custom Topics Filter:' : 'Detected Topics:'}
                </span>
                {activeTopics.length === 0 && (
                  <span className="detected-empty-hint">None detected (matches all topics)</span>
                )}
              </div>

              <div className="chip-group detected-chips-row">
                {activeTopics.map((topic) => (
                  <span key={topic} className="chip active-detected-chip">
                    <span>{topic}</span>
                    <button
                      type="button"
                      className="chip-remove-btn"
                      onClick={() => handleRemoveTopic(topic)}
                      aria-label={`Remove topic ${topic}`}
                      title="Remove topic and re-run match"
                    >
                      ✕
                    </button>
                  </span>
                ))}

                {/* Add Topic Dropdown */}
                <div className="add-topic-select-wrap">
                  <select
                    id="add-topic-select"
                    className="form-select add-topic-select"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddTopic(e.target.value);
                      }
                    }}
                    aria-label="Add topic to smart match"
                  >
                    <option value="">+ Add topic...</option>
                    {meta?.topics
                      ?.filter((t) => !activeTopics.includes(t))
                      .map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* RESULTS DISPLAY                                              */}
      {/* ============================================================ */}
      <div className="directory-results-bar">
        <div className="results-count-text">
          {mode === 'browse' && !loading && (
            <span>
              Showing <strong>{peers.length}</strong> {peers.length === 1 ? 'peer' : 'peers'}
              {hasActiveBrowseFilters ? ' matching your filters' : ''}
            </span>
          )}
          {mode === 'browse' && loading && <span>Searching peer directory...</span>}

          {mode === 'smart' && hasRunMatch && !smartLoading && (
            <span>
              Found <strong>{smartResults.length}</strong> ranked {smartResults.length === 1 ? 'mentor' : 'mentors'}
              {smartQueryMeta?.best_match_id ? ' with top recommendation' : ''}
            </span>
          )}
          {mode === 'smart' && smartLoading && <span>Analyzing problem and scoring mentors...</span>}
        </div>
      </div>

      {/* Loading Skeleton State */}
      {((mode === 'browse' && loading) || (mode === 'smart' && smartLoading)) && (
        <div className="peer-grid peers-grid">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="card peer-skeleton-card">
              <div className="skeleton-avatar"></div>
              <div className="skeleton-line" style={{ width: '60%', height: '18px' }}></div>
              <div className="skeleton-line" style={{ width: '40%', height: '14px' }}></div>
              <div className="skeleton-line" style={{ width: '90%', height: '36px' }}></div>
              <div className="skeleton-line" style={{ width: '70%', height: '24px' }}></div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {mode === 'browse' && error && !loading && (
        <div className="error-box">
          <div className="error-title">Could not load peers</div>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={fetchPeers}>
            Try Again
          </button>
        </div>
      )}

      {mode === 'smart' && smartError && !smartLoading && (
        <div className="error-box">
          <div className="error-title">Match Computation Error</div>
          <p>{smartError}</p>
          <button type="button" className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => runSmartMatch()}>
            Try Again
          </button>
        </div>
      )}

      {/* Smart Match Initial Hint State (before first match search) */}
      {mode === 'smart' && !hasRunMatch && !smartLoading && (
        <div className="smart-initial-wrap">
          <div className="card placeholder-box smart-match-hint-box">
            <svg className="placeholder-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            <h3>Describe your coding challenge above</h3>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', maxWidth: '480px', margin: '0.5rem auto 1.5rem' }}>
              Enter your problem above and let our deterministic scoring engine analyze topics, availability, language, and mentor ratings to find your best match.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => runSmartMatch()}
            >
              Run Match Scoring
            </button>
          </div>

          {peers.length > 0 && (
            <div className="smart-preview-section" style={{ marginTop: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Available Mentors Ready to Pair
                  </h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Select a mentor below or describe your specific problem above to get calculated compatibility rankings.
                  </p>
                </div>
              </div>
              <div className="peer-grid peers-grid">
                {peers.slice(0, 4).map((peer) => (
                  <PeerCard
                    key={peer.id}
                    peer={peer}
                    onBookClick={handleOpenBookModal}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty States */}
      {mode === 'browse' && !loading && !error && peers.length === 0 && (
        <div className="card placeholder-box empty-directory-box">
          <svg className="placeholder-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <h3>No matching mentors found</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', maxWidth: '420px', margin: '0.5rem auto 1.5rem' }}>
            We couldn't find any peers matching your current search criteria. Try removing some filters or searching for another skill.
          </p>
          {hasActiveBrowseFilters && (
            <button type="button" className="btn btn-primary" onClick={handleClearBrowseFilters}>
              Reset All Filters
            </button>
          )}
        </div>
      )}

      {mode === 'smart' && hasRunMatch && !smartLoading && !smartError && smartResults.length === 0 && (
        <div className="card placeholder-box empty-directory-box">
          <svg className="placeholder-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <h3>No mentors found</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', maxWidth: '420px', margin: '0.5rem auto 1.5rem' }}>
            No mentors found, try removing a constraint or adjusting your preferences.
          </p>
        </div>
      )}

      {/* ============================================================ */}
      {/* SPLIT STUDIO WORKSPACE LAYOUT (Raycast / Linear style)       */}
      {/* ============================================================ */}
      {viewMode === 'split' && !loading && !error && activePeerList.length > 0 && (
        <div className="workspace-split-container">
          {/* Master Feed Column (Left) */}
          <div className="master-feed-pane">
            <div className="feed-pane-header">
              <div className="feed-pane-title-wrap">
                <span className="feed-title-text">
                  {mode === 'smart' ? 'Ranked Matches' : 'Engineering Peers'}
                </span>
                <span className="feed-counter-badge">{activePeerList.length}</span>
              </div>
              <span className="feed-meta-hint">Click peer to inspect</span>
            </div>

            <div className="peer-feed-list" role="listbox" aria-label="Mentors list">
              {activePeerList.map((peer) => {
                const isSelected = selectedPeer?.id === peer.id;
                const isSmart = peer.match_score !== undefined;
                return (
                  <div
                    key={peer.id}
                    className={`peer-feed-item ${isSelected ? 'is-selected' : ''} ${peer.is_online ? 'is-online' : ''}`}
                    onClick={() => handleSelectPeer(peer)}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectPeer(peer);
                      }
                    }}
                  >
                    <div className="feed-item-indicator" />

                    <div className="feed-item-avatar-wrap">
                      <div
                        className="feed-item-avatar"
                        style={{ backgroundColor: peer.avatar_color || '#21262d' }}
                      >
                        {peer.name.charAt(0)}
                      </div>
                      {peer.is_online && (
                        <span className="feed-online-pulse" title="Online now" />
                      )}
                    </div>

                    <div className="feed-item-content">
                      <div className="feed-item-top-row">
                        <span className="feed-item-name">{peer.name}</span>
                        <span className="feed-item-handle">@{peer.handle}</span>
                        {isSmart && (
                          <span className="feed-item-match-score">
                            {peer.match_score}%
                          </span>
                        )}
                      </div>

                      <div className="feed-item-role-row">
                        <span className={`gh-level-badge level-${peer.level || 1}`}>
                          L{peer.level} {LEVEL_LABELS[peer.level] || 'Associate'}
                        </span>
                        <span className="feed-role-text">
                          {peer.experience || 'Senior'} Engineer
                        </span>
                      </div>

                      {/* Top skills row */}
                      <div className="feed-item-skills-row">
                        {peer.skills?.slice(0, 3).map((skill) => (
                          <span key={skill} className="feed-skill-tag">
                            <span
                              className="gh-lang-color-dot"
                              style={{ backgroundColor: LANG_COLORS[skill] || '#8b949e' }}
                            />
                            <span>{skill}</span>
                          </span>
                        ))}
                        {peer.skills?.length > 3 && (
                          <span className="feed-skill-more">+{peer.skills.length - 3}</span>
                        )}
                      </div>

                      <div className="feed-item-meta-row">
                        <span className="feed-meta-rating" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="#eab308" stroke="#eab308" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                          {peer.rating?.toFixed(1) || '4.8'}
                        </span>
                        <span className="feed-meta-sep">•</span>
                        <span className="feed-meta-rate">5 cr / 30m</span>
                        <span className="feed-meta-sep">•</span>
                        <span className="feed-meta-slots">
                          {peer.slots?.length ? `${peer.slots.length} slots` : '1 open slot'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detail Spotlight Terminal Column (Right) */}
          <div className="detail-spotlight-pane">
            {selectedPeer ? (
              <div className="mentor-studio-terminal">
                {/* Terminal Header Bar with macOS dots */}
                <div className="terminal-header-bar">
                  <div className="terminal-controls">
                    <span className="dot dot-red" />
                    <span className="dot dot-yellow" />
                    <span className="dot dot-green" />
                  </div>
                  <div className="terminal-window-title">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polyline points="4 17 10 11 4 5" />
                      <line x1="12" y1="19" x2="20" y2="19" />
                    </svg>
                    <span>PAIRING_STUDIO // @{selectedPeer.handle}</span>
                  </div>
                  <div className="terminal-status-pill">
                    {selectedPeer.is_online ? (
                      <span className="live-status-active">
                        <span className="studio-pulse-dot" />
                        <span>LIVE READY</span>
                      </span>
                    ) : (
                      <span className="live-status-offline">
                        <span className="studio-offline-dot" />
                        <span>OFFLINE</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Terminal Body */}
                <div className="terminal-body">
                  {/* Developer Identity Row */}
                  <div className="studio-developer-header">
                    <div className="studio-avatar-wrap">
                      <div
                        className="studio-avatar"
                        style={{ backgroundColor: selectedPeer.avatar_color || '#21262d' }}
                      >
                        {selectedPeer.name.charAt(0)}
                      </div>
                      {selectedPeer.is_online && <span className="studio-online-pulse" />}
                    </div>

                    <div className="studio-identity-meta">
                      <div className="studio-name-row">
                        <h2 className="studio-peer-name">{selectedPeer.name}</h2>
                        <span className="studio-peer-handle">@{selectedPeer.handle}</span>
                      </div>
                      <div className="studio-role-row">
                        <span className={`gh-level-badge level-${selectedPeer.level || 1}`}>
                          Level {selectedPeer.level} • {LEVEL_LABELS[selectedPeer.level] || 'Associate'}
                        </span>
                        <span className="studio-role-tag">
                          {selectedPeer.experience || 'Senior'} Software Engineer
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bio */}
                  <div className="studio-bio-box">
                    <p className="studio-bio-text">{selectedPeer.bio}</p>
                  </div>

                  {/* Quick Specs Metrics Grid */}
                  <div className="studio-specs-grid">
                    <div className="spec-card">
                      <span className="spec-label">Peer Reviews</span>
                      <span className="spec-value" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#eab308" stroke="#eab308" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                        {selectedPeer.rating?.toFixed(1) || '4.8'}{' '}
                        <span className="spec-sub">({selectedPeer.review_count || 12})</span>
                      </span>
                    </div>
                    <div className="spec-card">
                      <span className="spec-label">Session Rate</span>
                      <span className="spec-value">
                        5 Credits <span className="spec-sub">/ 30 min</span>
                      </span>
                    </div>
                    <div className="spec-card">
                      <span className="spec-label">Pairing Tech</span>
                      <span className="spec-value">
                        Monaco <span className="spec-sub">Live synced</span>
                      </span>
                    </div>
                  </div>

                  {/* Smart Match Breakdown if in smart mode */}
                  {mode === 'smart' && selectedPeer.match_score !== undefined && (
                    <div className="studio-smart-breakdown">
                      <div className="studio-match-score-row">
                        <div className="studio-match-badge-wrap">
                          <span className="match-score-badge-large">
                            {selectedPeer.match_score}% Match
                          </span>
                          <span className="match-score-desc">
                            Deterministic multi-attribute compatibility
                          </span>
                        </div>
                      </div>
                      {selectedPeer.reasons && selectedPeer.reasons.length > 0 && (
                        <div className="studio-reasons-list">
                          {selectedPeer.reasons.map((r, i) => (
                            <span
                              key={`${r.key}-${i}`}
                              className={`studio-reason-chip ${r.ok ? 'ok' : 'muted'}`}
                            >
                              <span className="reason-icon">{r.ok ? '✓' : '—'}</span>
                              <span>{r.label}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Skills Matrix with Language Color Dots */}
                  <div className="studio-section">
                    <div className="studio-section-label">
                      <span>VERIFIED TECH STACK & EXPERTISE</span>
                      <span className="studio-section-badge">{selectedPeer.skills?.length || 0} skills</span>
                    </div>
                    <div className="studio-skills-wrap">
                      {selectedPeer.skills?.map((skill) => (
                        <span key={skill} className="studio-skill-chip">
                          <span
                            className="gh-lang-color-dot"
                            style={{ backgroundColor: LANG_COLORS[skill] || '#8b949e' }}
                          />
                          <span>{skill}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Live Slot Picker */}
                  <div className="studio-section">
                    <div className="studio-section-label">
                      <span>SELECT AVAILABLE PAIRING SLOT</span>
                      <span className="slot-count-hint">
                        ({selectedPeer.slots?.length || 0} open slots)
                      </span>
                    </div>
                    {selectedPeer.slots && selectedPeer.slots.length > 0 ? (
                      <div className="studio-slots-grid">
                        {selectedPeer.slots.map((slot) => {
                          const isSlotSelected = selectedSlotId === slot.id;
                          const dayLabel = DAY_NAMES[slot.day_of_week] || `Day ${slot.day_of_week}`;
                          const timeRange = `${String(slot.start_hour).padStart(2, '0')}:00 – ${String(slot.end_hour).padStart(2, '0')}:00`;
                          return (
                            <button
                              key={slot.id}
                              type="button"
                              className={`studio-slot-btn ${isSlotSelected ? 'selected' : ''}`}
                              onClick={() => setSelectedSlotId(slot.id)}
                            >
                              <div className="slot-btn-left">
                                <span className="slot-day-pill">{dayLabel}</span>
                                <span className="slot-time-range">{timeRange}</span>
                              </div>
                              <span className="slot-selection-indicator">
                                {isSlotSelected ? '✓ Selected' : 'Select'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="studio-no-slots">
                        <span>No open slots published by this peer right now.</span>
                      </div>
                    )}
                  </div>

                  {/* WAL Double-Entry Escrow Assurance */}
                  <div className="studio-escrow-card">
                    <div className="escrow-header">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      </svg>
                      <span className="escrow-title">Double-Entry Ledger Escrow Guarantee</span>
                    </div>
                    <p className="escrow-desc">
                      5 credits are locked in WAL escrow upon booking request. Released to {selectedPeer.name} strictly after the code pairing session completes. Zero platform fee, instant auto-refund if declined.
                    </p>
                  </div>

                  {/* CTA Action Section */}
                  <div className="studio-action-section">
                    <button
                      type="button"
                      className="btn btn-primary studio-book-primary-btn"
                      onClick={() => handleOpenBookModal(selectedPeer, selectedSlotId)}
                    >
                      <span>Request 30-Min Session with {selectedPeer.name.split(' ')[0]}</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </button>
                    {currentProfile && currentProfile.balance < 5 && (
                      <div className="studio-credit-notice">
                        <svg className="notice-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        <span>
                          Account balance is <strong>{currentProfile.balance} cr</strong> (5 cr required for escrow). Switch persona in top-right to test instant booking.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="studio-empty-select">
                <span>Select a mentor from the left feed to inspect their credentials and book a pairing session.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* CLASSIC GRID LAYOUT (if user clicks Grid view mode)          */}
      {/* ============================================================ */}
      {viewMode === 'grid' && !loading && !error && activePeerList.length > 0 && (
        <div className="peer-grid peers-grid" id="peer-directory-grid">
          {activePeerList.map((peer) => (
            <PeerCard
              key={peer.id}
              peer={peer}
              onBookClick={handleOpenBookModal}
            />
          ))}
        </div>
      )}

      {/* Book Modal */}
      {bookingPeer && (
        <BookModal
          peer={bookingPeer}
          currentProfile={currentProfile}
          initialTopic={bookingPrefill.topic}
          initialProblemNote={bookingPrefill.problemNote}
          initialSlotId={bookingPrefill.slotId}
          onClose={() => setBookingPeer(null)}
          onBookSuccess={(b) => {
            if (mode === 'browse') fetchPeers();
            else runSmartMatch();
            if (onBookingCreated) onBookingCreated(b);
          }}
        />
      )}
    </div>
  );
}
