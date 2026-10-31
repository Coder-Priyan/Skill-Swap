import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getCommunityNotes, publishCommunityNote, upvoteCommunityNote } from '../api';
import { subscribeToSocketEvent } from '../socket';

const LANG_COLORS = {
  React: '#61dafb',
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  SQL: '#e38c00',
  'SQL/Database Design': '#e38c00',
  Docker: '#2496ed',
  Redis: '#dc382d',
  Git: '#f05032',
  'Node.js': '#026e00',
  'System Design': '#8a63d2',
  DSA: '#e34c26',
};

const TOPICS = [
  'All',
  'React',
  'TypeScript',
  'JavaScript',
  'Python',
  'SQL',
  'Docker',
  'Redis',
  'Git',
  'Node.js',
];

export default function CommunityNotes({ currentProfile, onCreditChange }) {
  const [notes, setNotes] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [downloadedId, setDownloadedId] = useState(null);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formTopic, setFormTopic] = useState('React');
  const [formSummary, setFormSummary] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formLanguage, setFormLanguage] = useState('javascript');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchNotes = useCallback(async (topic = 'All', q = '') => {
    try {
      setLoading(true);
      setError(null);
      const res = await getCommunityNotes(topic, q);
      setNotes(res.notes || []);
    } catch (err) {
      setError(err.message || 'Failed to load community cheat-sheets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes(selectedTopic, debouncedQuery);
  }, [fetchNotes, selectedTopic, debouncedQuery]);

  // Real-time socket sync
  useEffect(() => {
    const unsub = subscribeToSocketEvent('ledger:updated', () => {
      fetchNotes(selectedTopic, debouncedQuery);
    });
    return () => unsub();
  }, [fetchNotes, selectedTopic, debouncedQuery]);

  const handleCopyCode = (id, code) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadSnippet = (note) => {
    if (!note.code_snippet) return;
    const extMap = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      sql: 'sql',
      dockerfile: 'dockerfile',
      css: 'css',
      shell: 'sh',
    };
    const ext = extMap[note.language?.toLowerCase()] || 'txt';
    const filename = `${note.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 30)}.${ext}`;
    const blob = new Blob([note.code_snippet], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setDownloadedId(note.id);
    setTimeout(() => setDownloadedId(null), 2000);
  };

  const handleUpvote = async (id) => {
    try {
      const res = await upvoteCommunityNote(id);
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, upvotes: res.upvotes } : n))
      );
    } catch (err) {
      console.error('Failed to upvote:', err);
    }
  };

  const handleSubmitNote = async (e) => {
    e.preventDefault();
    if (!formTitle.trim() || !formSummary.trim()) {
      setFormError('Please enter a title and summary for your cheat-sheet.');
      return;
    }

    try {
      setFormSubmitting(true);
      setFormError(null);
      const res = await publishCommunityNote({
        title: formTitle,
        topic: formTopic,
        summary: formSummary,
        code_snippet: formCode,
        language: formLanguage,
      });

      if (res.success) {
        setToastMessage(`Cheat-sheet published. +${res.reward} credits credited to ledger.`);
        setTimeout(() => setToastMessage(null), 5000);
        setShowModal(false);
        setFormTitle('');
        setFormSummary('');
        setFormCode('');
        if (onCreditChange) onCreditChange();
        fetchNotes(selectedTopic, debouncedQuery);
      }
    } catch (err) {
      setFormError(err.message || 'Failed to publish cheat-sheet');
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <div className="page-container community-page">
      {/* Subhead Header */}
      <div className="directory-subhead">
        <div className="directory-subhead-left">
          <div className="directory-title-row">
            <h1 className="directory-subhead-title">Dev Cheat-Sheets & Battle-Tested Snippets</h1>
            <span className="directory-badge-counter">{notes.length} published</span>
          </div>
          <p className="directory-subhead-desc">
            Production-grade patterns curated for engineers. Share tips from peer sessions, learn multi-stage Docker builds, Redis mutex caching, SQL window functions, and earn +2 credits per publication.
          </p>
        </div>
        <div className="directory-subhead-actions">
          <button
            type="button"
            className="btn btn-primary share-notes-btn"
            onClick={() => setShowModal(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Share Cheat-sheet (+2 cr)</span>
          </button>
        </div>
      </div>

      {/* Telemetry Strip */}
      <div className="telemetry-meta-strip" style={{ marginBottom: '1.5rem' }}>
        <div className="telemetry-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>Production Verified Snippets</span>
        </div>
        <span className="telemetry-sep">•</span>
        <div className="telemetry-item">
          <span className="status-dot-active" />
          <span>+2 Credits per Verified Publication</span>
        </div>
        <span className="telemetry-sep">•</span>
        <div className="telemetry-item">
          <span>Real-time Search & Download</span>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="alert alert-success community-toast-banner" style={{ marginBottom: '1.5rem' }}>
          {toastMessage}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="cheat-sheet-toolbar">
        <div className="cheat-sheet-search-wrap">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="cheat-sheet-search-input"
            placeholder="Search cheat-sheets by keyword, error, or concept (e.g. Docker, Redis, Window, Reflog)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Topic Filter Chips */}
      <div className="community-topic-chips">
        {TOPICS.map((t) => (
          <button
            key={t}
            type="button"
            className={`topic-chip ${selectedTopic === t ? 'active' : ''}`}
            onClick={() => setSelectedTopic(t)}
          >
            {t !== 'All' && (
              <span
                className="gh-lang-color-dot"
                style={{ backgroundColor: LANG_COLORS[t] || '#8b949e', marginRight: '6px' }}
              />
            )}
            <span>{t}</span>
          </button>
        ))}
      </div>

      {/* Notes Grid */}
      {loading && notes.length === 0 ? (
        <div className="loading-box">
          <div className="loading-spinner" />
          <p>Loading dev cheat-sheets...</p>
        </div>
      ) : error ? (
        <div className="error-box">
          <p>{error}</p>
        </div>
      ) : notes.length === 0 ? (
        <div className="card placeholder-box">
          <p>No cheat-sheets found matching your criteria. Try adjusting your search query or topic filter.</p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '1rem' }}
            onClick={() => setShowModal(true)}
          >
            Publish New Cheat-Sheet
          </button>
        </div>
      ) : (
        <div className="community-notes-grid">
          {notes.map((note) => (
            <div key={note.id} className="community-note-card">
              <div className="note-card-header">
                <div className="note-author-info">
                  <div className="note-author-avatar">
                    {note.author_name ? note.author_name.charAt(0) : 'U'}
                  </div>
                  <div>
                    <div className="note-author-name">{note.author_name}</div>
                    <div className="note-author-handle">@{note.author_handle}</div>
                  </div>
                </div>

                <div className="note-topic-badge gh-lang-tag">
                  <span
                    className="gh-lang-color-dot"
                    style={{ backgroundColor: LANG_COLORS[note.topic] || '#8b949e' }}
                  />
                  <span>{note.topic}</span>
                </div>
              </div>

              <h3 className="note-card-title">{note.title}</h3>
              <p className="note-card-summary">{note.summary}</p>

              {note.code_snippet && (
                <div className="note-code-wrapper">
                  <div className="note-code-header">
                    <span className="note-code-lang">{note.language || 'code'}</span>
                    <div className="note-code-actions">
                      <button
                        type="button"
                        className="copy-code-btn"
                        onClick={() => handleCopyCode(note.id, note.code_snippet)}
                        title="Copy snippet"
                      >
                        {copiedId === note.id ? '✓ Copied' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        className="download-snippet-btn"
                        onClick={() => handleDownloadSnippet(note)}
                        title="Download snippet file"
                      >
                        {downloadedId === note.id ? '✓ Saved' : 'Download'}
                      </button>
                    </div>
                  </div>
                  <pre className="note-code-pre">
                    <code>{note.code_snippet}</code>
                  </pre>
                </div>
              )}

              <div className="note-card-footer">
                <button
                  type="button"
                  className="upvote-btn"
                  onClick={() => handleUpvote(note.id)}
                  title="Upvote helpful snippet"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                  <span>{note.upvotes || 0} Helpful</span>
                </button>

                <span className="note-date">
                  {new Date(note.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Share Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-card community-publish-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </span>
                <h2 className="modal-title">Share Dev Cheat-Sheet</h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitNote} className="publish-note-form">
              <div className="modal-credit-incentive">
                <span>Publication Incentive: <strong>+2 Credits</strong> credited to your double-entry ledger upon verified publication.</span>
              </div>

              {formError && (
                <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                  {formError}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Title / Problem Solved *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. PostgreSQL Indexing Strategy: When B-Tree Fails"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  maxLength={90}
                  required
                />
              </div>

              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Tech Topic *</label>
                  <select
                    className="form-input"
                    value={formTopic}
                    onChange={(e) => setFormTopic(e.target.value)}
                  >
                    {TOPICS.filter((t) => t !== 'All').map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Code Language</label>
                  <select
                    className="form-input"
                    value={formLanguage}
                    onChange={(e) => setFormLanguage(e.target.value)}
                  >
                    <option value="javascript">JavaScript</option>
                    <option value="typescript">TypeScript</option>
                    <option value="python">Python</option>
                    <option value="sql">SQL</option>
                    <option value="dockerfile">Dockerfile</option>
                    <option value="shell">Shell / Bash</option>
                    <option value="css">CSS</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Key Engineering Insight / Summary *</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder="Explain why this pattern matters, what edge case it catches, and how to apply it..."
                  rows={2}
                  value={formSummary}
                  onChange={(e) => setFormSummary(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Code Snippet (Optional)</label>
                <textarea
                  className="form-input form-textarea monospace"
                  placeholder="// Paste clean, tested code or configuration..."
                  rows={6}
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                />
              </div>

              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={formSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={formSubmitting}
                >
                  {formSubmitting ? 'Publishing...' : 'Publish & Claim +2 Credits →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
