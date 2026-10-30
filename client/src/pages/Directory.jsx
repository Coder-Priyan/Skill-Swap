import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getMeta, getPeers } from '../api';
import PeerCard from '../components/PeerCard';
import BookModal from '../components/BookModal';

export default function Directory({ currentUserId, currentProfile }) {
  // Metadata state from /api/meta
  const [meta, setMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(true);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedDaypart, setSelectedDaypart] = useState('');
  const [onlineNow, setOnlineNow] = useState(false);
  const [minLevel, setMinLevel] = useState('');
  const [sortBy, setSortBy] = useState('default');

  // Directory results state
  const [peers, setPeers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal state
  const [bookingPeer, setBookingPeer] = useState(null);

  // AbortController reference to discard stale queries
  const abortControllerRef = useRef(null);

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

  // Fetch peers whenever filters or current user changes
  const fetchPeers = useCallback(() => {
    if (!currentUserId) return;

    // Cancel in-flight request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

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
        // Discard aborted request errors
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

  // Clear all filters handler
  const handleClearFilters = () => {
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

  const hasActiveFilters = Boolean(
    searchQuery ||
    selectedTopic ||
    selectedLanguage ||
    selectedDay ||
    selectedDaypart ||
    onlineNow ||
    minLevel ||
    sortBy !== 'default'
  );

  return (
    <div className="directory-page">
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Find Peers & Mentors</h1>
        <p className="page-subtitle">
          Connect with experienced developers for 30-minute 1-on-1 pairing sessions. Earn credits by helping, spend credits to learn.
        </p>
      </div>

      {/* Filter and Search Bar Card */}
      <div className="card directory-controls-card">
        {/* Search Input Row */}
        <div className="search-input-row">
          <div className="search-field-wrap">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              id="peer-search-input"
              className="search-input"
              placeholder="Search by mentor name, handle, bio, or skill..."
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

          <div className="sort-field-wrap">
            <label htmlFor="sort-select" className="control-label">Sort by:</label>
            <select
              id="sort-select"
              className="form-select control-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="default">Default (Online & Level)</option>
              <option value="level">Highest Level</option>
              <option value="rating">Top Rated</option>
              <option value="online">Online First</option>
            </select>
          </div>
        </div>

        {/* Filter Dropdowns Grid */}
        <div className="filters-grid">
          {/* Language filter */}
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

          {/* Day filter */}
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

          {/* Day-part filter */}
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

          {/* Min Level filter */}
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

          {/* Online Toggle & Clear Button */}
          <div className="filter-col toggle-col">
            <label className="toggle-label" htmlFor="online-toggle">
              <input
                type="checkbox"
                id="online-toggle"
                checked={onlineNow}
                onChange={(e) => setOnlineNow(e.target.checked)}
              />
              <span className="toggle-custom-box"></span>
              <span>Online Now</span>
            </label>

            {hasActiveFilters && (
              <button
                type="button"
                id="clear-filters-btn"
                className="btn btn-secondary btn-sm"
                onClick={handleClearFilters}
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

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

      {/* Results Header: Result Count */}
      <div className="directory-results-bar">
        <div className="results-count-text">
          {!loading && (
            <span>
              Showing <strong>{peers.length}</strong> {peers.length === 1 ? 'peer' : 'peers'}
              {hasActiveFilters ? ' matching your filters' : ''}
            </span>
          )}
          {loading && <span>Searching peer directory...</span>}
        </div>
      </div>

      {/* Loading Skeleton State */}
      {loading && (
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
      {error && !loading && (
        <div className="error-box">
          <div className="error-title">Could not load peers</div>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={fetchPeers}>
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && peers.length === 0 && (
        <div className="card placeholder-box empty-directory-box">
          <span className="placeholder-icon">🔎</span>
          <h3>No matching mentors found</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', maxWidth: '420px', margin: '0.5rem auto 1.5rem' }}>
            We couldn't find any peers matching your current search criteria. Try removing some filters or searching for another skill.
          </p>
          {hasActiveFilters && (
            <button type="button" className="btn btn-primary" onClick={handleClearFilters}>
              Reset All Filters
            </button>
          )}
        </div>
      )}

      {/* Peer Cards Grid */}
      {!loading && !error && peers.length > 0 && (
        <div className="peer-grid" id="peer-directory-grid">
          {peers.map((peer) => (
            <PeerCard
              key={peer.id}
              peer={peer}
              onBookClick={(p) => setBookingPeer(p)}
            />
          ))}
        </div>
      )}

      {/* Book Modal */}
      {bookingPeer && (
        <BookModal
          peer={bookingPeer}
          currentProfile={currentProfile}
          onClose={() => setBookingPeer(null)}
        />
      )}
    </div>
  );
}
