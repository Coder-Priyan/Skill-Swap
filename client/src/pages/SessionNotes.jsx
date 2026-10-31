import React, { useState, useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { getBookingNotes, updateBookingNotes, apiRequest } from '../api';

const EXTENSION_MAP = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  html: 'html',
  css: 'css',
  sql: 'sql',
  json: 'json',
  markdown: 'md',
  cpp: 'cpp',
  java: 'java',
};

export default function SessionNotes({ bookingId, currentUser, onBack }) {
  const [booking, setBooking] = useState(null);
  const [notes, setNotes] = useState(null);
  const [summary, setSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const editorContainerRef = useRef(null);
  const editorInstanceRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [bookingRes, notesRes] = await Promise.all([
          apiRequest(`/api/bookings/${bookingId}`),
          getBookingNotes(bookingId),
        ]);

        if (!mounted) return;
        setBooking(bookingRes);
        setNotes(notesRes);
        setSummary(notesRes.summary || '');
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to load session notes:', err);
        setError(err.message || 'Failed to load session data');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (bookingId) {
      loadData();
    }

    return () => {
      mounted = false;
      if (editorInstanceRef.current) {
        editorInstanceRef.current.dispose();
        editorInstanceRef.current = null;
      }
    };
  }, [bookingId]);

  // Mount read-only Monaco editor once container is ready
  useEffect(() => {
    if (!loading && notes && editorContainerRef.current && !editorInstanceRef.current) {
      const lang = notes.language || 'javascript';
      const code = notes.final_code || '// No code was typed in this session.';

      editorInstanceRef.current = monaco.editor.create(editorContainerRef.current, {
        value: code,
        language: lang,
        theme: 'vs-dark',
        readOnly: true,
        domReadOnly: true,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 14,
        lineNumbers: 'on',
        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      });
    }
  }, [loading, notes]);

  const handleDownload = () => {
    if (!notes) return;
    const lang = notes.language || 'javascript';
    const ext = EXTENSION_MAP[lang] || 'txt';
    const filename = `session-${bookingId}.${ext}`;
    const code = notes.final_code || '';

    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleSaveSummary = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const updated = await updateBookingNotes(bookingId, summary);
      setNotes((prev) => ({ ...prev, ...updated }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to update summary:', err);
      setError(err.message || 'Failed to save summary');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container session-notes-page">
        <div className="skeleton-loading" style={{ height: '80px', marginBottom: '24px' }}></div>
        <div className="skeleton-loading" style={{ height: '400px' }}></div>
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="page-container session-notes-page">
        <div className="alert-box alert-error" role="alert">
          <h3>Failed to load session notes</h3>
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={onBack}>
            Back to Bookings
          </button>
        </div>
      </div>
    );
  }

  const lang = notes?.language || 'javascript';
  const completedDate = booking?.completed_at
    ? new Date(booking.completed_at).toLocaleString()
    : 'Completed';

  return (
    <div className="page-container session-notes-page">
      {/* Page Header */}
      <header className="page-header session-notes-header">
        <div className="header-left">
          <button className="btn btn-back" onClick={onBack} aria-label="Back to bookings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }} aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back to Bookings</span>
          </button>
          <div className="session-meta-tags">
            <span className="meta-tag topic-tag">{booking?.topic}</span>
            <span className="meta-tag status-tag">Completed</span>
            <span className="meta-tag date-tag">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '5px' }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {completedDate}
            </span>
          </div>
          <h1 className="page-title session-title">Session Archive & Artifacts</h1>
          <div className="session-participants">
            <span className="part-item">
              <span className="part-label">Learner</span>
              <strong className="part-name">{booking?.learner?.name}</strong>
            </span>
            <span className="part-divider">•</span>
            <span className="part-item">
              <span className="part-label">Mentor</span>
              <strong className="part-name">{booking?.mentor?.name}</strong>
            </span>
          </div>
        </div>

        <div className="header-actions">
          <button
            className="btn btn-secondary download-btn"
            onClick={handleDownload}
            aria-label="Download code snippet"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download Code (.{EXTENSION_MAP[lang] || 'txt'})
          </button>
        </div>
      </header>

      {error && (
        <div className="alert-box alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="notes-layout-grid">
        {/* Monaco Read-Only Code Viewer */}
        <section className="notes-code-section" aria-label="Editor Code Snapshot">
          <div className="code-card-header">
            <div className="code-lang-badge">
              <span className="lang-dot"></span>
              {lang.toUpperCase()}
            </div>
            <span className="code-subtitle">Snapshot taken automatically at session end</span>
          </div>
          <div
            ref={editorContainerRef}
            className="monaco-readonly-container"
            style={{ height: '420px', width: '100%' }}
          />
        </section>

        {/* Editable Summary Section */}
        <section className="notes-summary-section" aria-label="Session Summary and Notes">
          <div className="summary-card">
            <div className="summary-header">
              <h2 className="summary-title">Collaborative Takeaways & Summary</h2>
              <span className="summary-sub">Editable by either participant</span>
            </div>

            <form onSubmit={handleSaveSummary} className="summary-form">
              <textarea
                className="form-textarea summary-textarea"
                rows={6}
                maxLength={1000}
                placeholder="Add key insights, next steps, resources, or code snippets covered during the pairing session..."
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />

              <div className="summary-footer">
                <span className="char-count">{summary.length}/1000 characters</span>

                <div className="summary-actions">
                  {saveSuccess && (
                    <span className="save-success-msg">✓ Saved successfully!</span>
                  )}
                  <button
                    type="submit"
                    className="btn btn-primary save-btn"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Notes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
