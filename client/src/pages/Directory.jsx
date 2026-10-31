import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getMeta, getPeers, getSmartMatch } from '../api';
import PeerCard from '../components/PeerCard';
import BookModal from '../components/BookModal';
import { subscribeToSocketEvent } from '../socket';

export default function Directory({ currentUserId, currentProfile, onBookingCreated }) {
  // Mode switch: 'smart' (Smart Match default) | 'browse' (Browse)
  const [mode, setMode] = useState(() => {
    try {
      return sessionStorage.getItem('skillswap_directory_mode') || 'smart';
    } catch (_) {
      return 'smart';
    }
  });

  const handleModeChange = (newMode) => {
    setMode(newMode);
    try {
      sessionStorage.setItem('skillswap_directory_mode', newMode);
    } catch (_) {}
  };

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
    if (mode === 'browse') {
      fetchPeers();
    }
  }, [fetchPeers, mode]);

  // Execute Smart Match
  const runSmartMatch = useCallback(
    (explicitTopics = null) => {
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

      const params = {
        problem: problemText.trim(),
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

  // Open BookModal handler (prefilling in Smart Match mode per C3)
  const handleOpenBookModal = (peer) => {
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
        peer.suggested_slot_id || (peer.slots?.[0] ? peer.slots[0].id : '');

      setBookingPrefill({
        topic: prefilledTopic,
        problemNote: prefilledProblem,
        slotId: prefilledSlot,
      });
    } else {
      setBookingPrefill({
        topic: peer.skills?.[0] || '',
        problemNote: '',
        slotId: peer.slots?.[0] ? peer.slots[0].id : '',
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

  return (
    <div className="directory-page">
      {/* GitHub Repository Directory Header */}
      <div className="gh-page-header">
        <div className="gh-title-col">
          <div className="gh-title-row">
            <h1 className="gh-page-heading">Mentors & Peers</h1>
            <span className="gh-badge-counter">{peers.length} active</span>
          </div>
          <p className="gh-page-desc">
            Peer-to-peer technical pairing and code reviews. Standard rate: 5 cr / 30m session.
          </p>
        </div>

        {/* GitHub Segmented Control */}
        <div className="gh-segmented-control" role="tablist" aria-label="Directory view modes">
          <button
            type="button"
            role="tab"
            id="mode-tab-browse"
            aria-selected={mode === 'browse'}
            className={`gh-segment-btn ${mode === 'browse' ? 'active' : ''}`}
            onClick={() => handleModeChange('browse')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>Browse</span>
          </button>
          <button
            type="button"
            role="tab"
            id="mode-tab-smart"
            aria-selected={mode === 'smart'}
            className={`gh-segment-btn ${mode === 'smart' ? 'active' : ''}`}
            onClick={() => handleModeChange('smart')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
            <span>Smart Match</span>
            <span className="gh-subtle-badge">Deterministic</span>
          </button>
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
              <div className="control-label" style={{ marginBottom: '0.4rem' }}>Popular Skills:</div>
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
                    {topic}
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
                      <span className="chip-detected-badge" style={{ marginLeft: '4px', fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>
                        ⚡ detected
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
        <div className="peer-grid">
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
        <div className="card placeholder-box smart-match-hint-box">
          <span className="placeholder-icon">🎯</span>
          <h3>Describe your coding challenge</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', maxWidth: '480px', margin: '0.5rem auto 1.5rem' }}>
            Enter your problem above and let our deterministic scoring engine analyze topics, availability, language, and mentor ratings to find your best match.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => runSmartMatch()}
          >
            Find My Best Match
          </button>
        </div>
      )}

      {/* Empty States */}
      {mode === 'browse' && !loading && !error && peers.length === 0 && (
        <div className="card placeholder-box empty-directory-box">
          <span className="placeholder-icon">🔎</span>
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
          <span className="placeholder-icon">🔎</span>
          <h3>No mentors found</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', maxWidth: '420px', margin: '0.5rem auto 1.5rem' }}>
            No mentors found, try removing a constraint or adjusting your preferences.
          </p>
        </div>
      )}

      {/* Results Grid: Browse Mode */}
      {mode === 'browse' && !loading && !error && peers.length > 0 && (
        <div className="peer-grid" id="peer-directory-grid">
          {peers.map((peer) => (
            <PeerCard
              key={peer.id}
              peer={peer}
              onBookClick={handleOpenBookModal}
            />
          ))}
        </div>
      )}

      {/* Results Grid: Smart Match Mode */}
      {mode === 'smart' && hasRunMatch && !smartLoading && !smartError && smartResults.length > 0 && (
        <div className="peer-grid" id="smart-match-results-grid">
          {smartResults.map((peer) => (
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
