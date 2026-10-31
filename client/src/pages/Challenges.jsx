import React, { useState, useEffect, useCallback } from 'react';
import { getChallenges, solveChallenge, getActivityStreak } from '../api';
import { subscribeToSocketEvent } from '../socket';

export default function Challenges({ currentProfile, onCreditChange }) {
  const [challenges, setChallenges] = useState([]);
  const [activityData, setActivityData] = useState(null);
  const [meta, setMeta] = useState({
    daily_date: '',
    daily_count: 5,
    daily_solved: 0,
    today_credits_earned: 0,
    total_available: 10,
    total_solved: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedChallengeId, setSelectedChallengeId] = useState(null);
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'find_output' | 'spot_the_bug' | 'all'
  const [copiedCode, setCopiedCode] = useState(false);

  const fetchAllChallenges = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [res, streakRes] = await Promise.all([
        getChallenges(),
        getActivityStreak(currentProfile?.id).catch(() => null),
      ]);
      const list = res.challenges || [];
      setChallenges(list);
      if (streakRes) setActivityData(streakRes);
      setMeta({
        daily_date: res.daily_date || 'Today',
        daily_count: res.daily_count || 5,
        daily_solved: res.daily_solved || 0,
        today_credits_earned: res.today_credits_earned || 0,
        total_available: res.total_available || list.length,
        total_solved: res.total_solved || 0,
      });

      // Default select
      if (list.length > 0) {
        setSelectedChallengeId((prev) => {
          if (prev && list.some((c) => c.id === prev)) return prev;
          const firstDailyUnsolved = list.find((c) => c.is_daily && !c.is_solved);
          if (firstDailyUnsolved) return firstDailyUnsolved.id;
          const firstDaily = list.find((c) => c.is_daily);
          if (firstDaily) return firstDaily.id;
          return list[0].id;
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to load challenges');
    } finally {
      setLoading(false);
    }
  }, [currentProfile?.id]);

  useEffect(() => {
    fetchAllChallenges();
  }, [fetchAllChallenges]);

  // Subscribe to ledger updates
  useEffect(() => {
    const unsub = subscribeToSocketEvent('ledger:updated', () => {
      fetchAllChallenges();
    });
    return () => unsub();
  }, [fetchAllChallenges]);

  // Filtered challenges based on tab
  const filteredChallenges = challenges.filter((c) => {
    if (activeTab === 'daily') return c.is_daily;
    if (activeTab === 'find_output') return c.type === 'find_output';
    if (activeTab === 'spot_the_bug') return c.type === 'spot_the_bug';
    return true;
  });

  const activeChallenge = challenges.find((c) => c.id === selectedChallengeId) || filteredChallenges[0];

  const handleSelectChallenge = (id) => {
    setSelectedChallengeId(id);
    setSelectedOptionId(null);
    setResultMessage(null);
    setCopiedCode(false);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedOptionId(null);
    setResultMessage(null);
    const subset = challenges.filter((c) => {
      if (tab === 'daily') return c.is_daily;
      if (tab === 'find_output') return c.type === 'find_output';
      if (tab === 'spot_the_bug') return c.type === 'spot_the_bug';
      return true;
    });
    if (subset.length > 0 && !subset.some((c) => c.id === selectedChallengeId)) {
      setSelectedChallengeId(subset[0].id);
    }
  };

  const handleCopyCode = (code) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSubmitSolution = async () => {
    if (!selectedChallengeId || !selectedOptionId || submitting) return;
    try {
      setSubmitting(true);
      setResultMessage(null);
      const res = await solveChallenge(selectedChallengeId, selectedOptionId);
      if (res.correct) {
        setResultMessage({
          success: true,
          text: res.message || `Solution verified. +${res.reward} credits credited to ledger.`,
          explanation: res.explanation,
        });
        if (onCreditChange) onCreditChange();
        fetchAllChallenges();
      } else {
        setResultMessage({
          success: false,
          text: res.message || 'Incorrect answer. Analyze the code execution flow and try again.',
        });
      }
    } catch (err) {
      setResultMessage({
        success: false,
        text: err.message || 'Failed to submit answer',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container challenges-page">
      {/* Minimal Sleek Header */}
      <div className="bug-hunt-minimal-header">
        <div className="minimal-header-left">
          <div className="minimal-title-row">
            <h1 className="minimal-page-title">Bug Hunt</h1>
            <span className="minimal-badge-counter">
              {meta.daily_solved}/5 solved
            </span>
            {activityData?.streak?.current > 0 && (
              <span className="minimal-streak-pill" title={`${activityData.streak.longest}d personal best streak`}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ marginRight: '4px', verticalAlign: '-1px' }}>
                  <path d="M12 2c-.6 3.2-3 5.4-4 8-.9 2.3-.4 4.8 1.2 6.5 1.6 1.7 4 2.5 6.3 1.9 3.2-.8 5.3-3.7 4.9-7-.3-2.5-2.2-4.5-3.4-6.7-1-1.7-1.5-3.6-1.5-5.7-.7.9-1.5 1.8-2.2 2.7-.4-.7-.9-1.3-1.3-2z"/>
                </svg>
                {activityData.streak.current}d streak
              </span>
            )}
          </div>
          <p className="minimal-page-desc">
            Debug real code snippets daily to sharpen fundamentals and earn peer mentorship credits.
          </p>
        </div>

        <div className="minimal-header-right">
          <div className="minimal-reward-counter">
            <span className="reward-label">Today's Earnings</span>
            <span className="reward-value text-green">+{meta.today_credits_earned} cr</span>
          </div>
        </div>
      </div>

      {/* Minimal Toolbar (Tabs on Left, Compact 7-Day Consistency on Right) */}
      <div className="bug-hunt-minimal-toolbar">
        <div className="minimal-tabs-group">
          <button
            type="button"
            className={`minimal-tab-btn ${activeTab === 'daily' ? 'active' : ''}`}
            onClick={() => handleTabChange('daily')}
          >
            <span>Today's 5</span>
            <span className="tab-pill-count">{challenges.filter((c) => c.is_daily).length}</span>
          </button>
          <button
            type="button"
            className={`minimal-tab-btn ${activeTab === 'find_output' ? 'active' : ''}`}
            onClick={() => handleTabChange('find_output')}
          >
            <span>Find Output</span>
            <span className="tab-pill-count">{challenges.filter((c) => c.type === 'find_output').length}</span>
          </button>
          <button
            type="button"
            className={`minimal-tab-btn ${activeTab === 'spot_the_bug' ? 'active' : ''}`}
            onClick={() => handleTabChange('spot_the_bug')}
          >
            <span>Spot Bug</span>
            <span className="tab-pill-count">{challenges.filter((c) => c.type === 'spot_the_bug').length}</span>
          </button>
          <button
            type="button"
            className={`minimal-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => handleTabChange('all')}
          >
            <span>All</span>
            <span className="tab-pill-count">{challenges.length}</span>
          </button>
        </div>

        {/* Compact 7-Day Consistency Dot Tracker */}
        {activityData?.month_calendar?.days && (
          <div className="minimal-week-dots-bar" title="Last 7 days check-in consistency">
            <span className="week-dots-label">7-Day Consistency:</span>
            <div className="week-dots-row">
              {activityData.month_calendar.days.slice(-7).map((d) => (
                <span
                  key={d.date}
                  className={`week-dot ${d.active ? 'active' : ''} ${d.is_today ? 'today' : ''}`}
                  title={`${d.date}: ${d.active ? `${d.count} activities` : 'No activity'}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {loading && challenges.length === 0 ? (
        <div className="loading-box">
          <div className="loading-spinner" />
          <p>Loading code challenges...</p>
        </div>
      ) : error ? (
        <div className="error-box">
          <p>{error}</p>
        </div>
      ) : (
        <div className="challenges-workspace-grid">
          {/* Left: Challenges Feed */}
          <div className="challenges-feed-pane">
            <div className="feed-pane-header">
              <span className="feed-title-text">
                {activeTab === 'daily'
                  ? "Today's 5 Daily Bug Hunts"
                  : activeTab === 'find_output'
                  ? 'Find The Output Questions'
                  : activeTab === 'spot_the_bug'
                  ? 'Spot The Bug Snippets'
                  : 'All Available Challenges'}
              </span>
              <span className="feed-counter-badge">{filteredChallenges.length} Items</span>
            </div>

            <div className="challenge-list">
              {filteredChallenges.length === 0 ? (
                <div className="empty-subfeed-box">
                  <p>No questions found under this filter.</p>
                </div>
              ) : (
                filteredChallenges.map((ch) => {
                  const isSelected = activeChallenge && ch.id === activeChallenge.id;
                  return (
                    <div
                      key={ch.id}
                      className={`challenge-item ${isSelected ? 'is-selected' : ''} ${ch.is_solved ? 'is-solved' : ''}`}
                      onClick={() => handleSelectChallenge(ch.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="challenge-item-top">
                        <div className="challenge-tag-group">
                          {ch.is_daily && (
                            <span className="challenge-daily-pill">
                              Daily #{ch.daily_slot || ''}
                            </span>
                          )}
                          <span className={`challenge-type-pill type-${ch.type}`}>
                            {ch.type === 'find_output' ? 'Output' : 'Bug'}
                          </span>
                          <span className="challenge-topic-tag">{ch.topic}</span>
                        </div>
                        <span className="challenge-reward-tag">+{ch.reward} cr</span>
                      </div>

                      <div className="challenge-item-title">{ch.title}</div>

                      <div className="challenge-item-meta">
                        <span className="challenge-file-hint">
                          <code>{ch.file_name}</code>
                        </span>
                        <div className="challenge-status-indicator">
                          <span className="challenge-diff-pill">{ch.difficulty}</span>
                          {ch.is_solved ? (
                            <span className="solved-badge">✓ Solved</span>
                          ) : (
                            <span className="unsolved-badge">Open</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Challenge Interactive Terminal */}
          <div className="challenge-terminal-pane">
            {activeChallenge ? (
              <div className="challenge-terminal-card">
                {/* Terminal Header */}
                <div className="terminal-header-bar">
                  <div className="terminal-controls">
                    <span className="dot dot-red" />
                    <span className="dot dot-yellow" />
                    <span className="dot dot-green" />
                  </div>
                  <div className="terminal-window-title">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px', verticalAlign: '-1px' }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="terminal-file-name">{activeChallenge.file_name}</span>
                    <span className="terminal-type-subtext">• {activeChallenge.type_label}</span>
                  </div>
                  <div className="terminal-status-pill">
                    {activeChallenge.is_solved ? (
                      <span className="challenge-status-solved">✓ COMPLETED</span>
                    ) : (
                      <span className="challenge-status-ready">+{activeChallenge.reward} CR REWARD</span>
                    )}
                  </div>
                </div>

                <div className="terminal-body">
                  <div className="challenge-main-header">
                    <div className="challenge-header-meta">
                      <span className={`challenge-type-pill type-${activeChallenge.type}`}>
                        {activeChallenge.type === 'find_output' ? 'Output' : 'Bug'}
                      </span>
                      <span className="challenge-topic-tag">{activeChallenge.topic}</span>
                      <span className="challenge-diff-pill">{activeChallenge.difficulty}</span>
                      {activeChallenge.is_daily && (
                        <span className="challenge-daily-pill">Daily #{activeChallenge.daily_slot}</span>
                      )}
                    </div>
                    <h2 className="challenge-title">{activeChallenge.title}</h2>
                    <p className="challenge-desc">{activeChallenge.description}</p>
                  </div>

                  {/* Code Editor Preview */}
                  <div className="challenge-code-container">
                    <div className="code-header-bar">
                      <div className="code-header-left">
                        <span className="code-lang-label">{activeChallenge.topic}</span>
                        <span className="code-file-label">{activeChallenge.file_name}</span>
                      </div>
                      <button
                        type="button"
                        className="copy-code-btn"
                        onClick={() => handleCopyCode(activeChallenge.code)}
                        title="Copy code snippet"
                      >
                        {copiedCode ? '✓ Copied' : 'Copy Snippet'}
                      </button>
                    </div>
                    <pre className="challenge-code-block">
                      <code>{activeChallenge.code}</code>
                    </pre>
                  </div>

                  {/* Solved View or Interactive Form */}
                  {activeChallenge.is_solved ? (
                    <div className="challenge-already-solved-box">
                      <div className="solved-box-header">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <div>
                          <div className="solved-box-title">Challenge Cleared & Verified</div>
                          <div className="solved-box-subtitle">+{activeChallenge.reward} Credits awarded to your account</div>
                        </div>
                      </div>
                      <div className="solved-explanation">
                        <strong>Engineering Explanation:</strong>
                        <p>{activeChallenge.explanation}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="challenge-options-section">
                      <div className="options-title-row">
                        <span className="options-title">
                          {activeChallenge.type === 'find_output'
                            ? 'SELECT THE EXACT CONSOLE OUTPUT / BEHAVIOR:'
                            : 'IDENTIFY THE ROOT CAUSE / BUG:'}
                        </span>
                      </div>

                      <div className="options-list">
                        {activeChallenge.options.map((opt, index) => {
                          const isOptionSelected = selectedOptionId === opt.id;
                          const letter = String.fromCharCode(65 + index);
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              className={`option-btn ${isOptionSelected ? 'selected' : ''}`}
                              onClick={() => setSelectedOptionId(opt.id)}
                            >
                              <span className="option-letter-badge">{letter}</span>
                              <span className="option-text">{opt.text}</span>
                              <span className="option-radio-circle">
                                {isOptionSelected && <span className="option-radio-dot" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Result Feedback Banner */}
                      {resultMessage && (
                        <div className={`challenge-result-banner ${resultMessage.success ? 'success' : 'error'}`}>
                          <div className="result-text">{resultMessage.text}</div>
                          {resultMessage.explanation && (
                            <div className="result-explanation">
                              <strong>Deep Dive:</strong> {resultMessage.explanation}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="challenge-action-row">
                        <button
                          type="button"
                          className="btn btn-primary submit-solution-btn"
                          disabled={!selectedOptionId || submitting}
                          onClick={handleSubmitSolution}
                        >
                          {submitting ? 'Verifying Output...' : `Submit Answer & Claim +${activeChallenge.reward} Credits →`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="card placeholder-box">
                <p>Select a challenge from the feed to debug.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
