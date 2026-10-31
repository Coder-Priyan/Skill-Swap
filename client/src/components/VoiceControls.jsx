import React, { Component } from 'react';
import { useVoice } from '../hooks/useVoice';

/**
 * Error boundary component to guarantee voice errors never crash the room, editor, or chat.
 */
export class VoiceErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.warn('[VoiceErrorBoundary] Caught error in VoiceControls:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="voice-controls-panel voice-error-boundary-fallback" role="alert">
          <div className="voice-status-line">
            <span className="voice-state-icon">⚠️</span>
            <span>Voice calling encountered an error. Code editor and chat remain active.</span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: '6px' }}
          >
            Reset Voice
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Internal presentation component for WebRTC voice controls.
 */
function VoiceControlsInner({ roomId, booking, currentUserId, onVoicePeersChange }) {
  const {
    voiceState,
    isMuted,
    peerInVoice,
    localAudioLevel,
    remoteAudioLevel,
    isLocalSpeaking,
    isRemoteSpeaking,
    errorMessage,
    audioElRef,
    joinVoice,
    leaveVoice,
    toggleMute,
    retry,
  } = useVoice({ roomId, booking, currentUserId, onVoicePeersChange });

  if (voiceState === 'disabled') {
    return null;
  }

  const isConnected = voiceState === 'connected';
  const isConnecting = voiceState === 'connecting';
  const isWaiting = voiceState === 'waiting-for-peer';
  const isRequesting = voiceState === 'requesting-mic';
  const isInVoice = isConnected || isConnecting || isWaiting;

  const otherUserName = booking
    ? booking.learner_id === currentUserId
      ? booking.mentor.name
      : booking.learner.name
    : 'Peer';

  return (
    <div className={`voice-controls-panel voice-state-${voiceState}`} role="region" aria-label="Live Voice Call">
      {/* Hidden audio element for remote stream output */}
      <audio ref={audioElRef} autoPlay playsInline style={{ display: 'none' }} />

      <div className="voice-controls-top">
        <div className="voice-header-title">
          <span className="voice-header-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </span>
          <span className="voice-title-text">Voice in Room</span>

          {/* Peer Voice Presence Indicator */}
          <span
            className={`voice-peer-presence-badge ${peerInVoice ? 'active' : ''}`}
            title={peerInVoice ? `${otherUserName} is in voice` : `${otherUserName} not in voice`}
          >
            <span className="peer-presence-dot" />
            <span>{peerInVoice ? `${otherUserName} in voice` : 'Peer offline'}</span>
          </span>
        </div>

        {/* Live Audio Indicators when in voice */}
        {isInVoice && (
          <div className="voice-audio-indicators" aria-hidden="true">
            {/* Local mic level */}
            <div className={`audio-ring-wrap ${isLocalSpeaking ? 'speaking' : ''} ${isMuted ? 'muted' : ''}`} title={isMuted ? 'You are muted' : 'Your mic'}>
              <span className="audio-user-initial">You</span>
              <div className="audio-meter-bar-track">
                <div
                  className="audio-meter-bar-fill"
                  style={{ width: `${isMuted ? 0 : localAudioLevel}%` }}
                />
              </div>
            </div>

            {/* Remote mic level */}
            {isConnected && (
              <div className={`audio-ring-wrap ${isRemoteSpeaking ? 'speaking' : ''}`} title={`${otherUserName}'s audio`}>
                <span className="audio-user-initial">{otherUserName.charAt(0)}</span>
                <div className="audio-meter-bar-track">
                  <div
                    className="audio-meter-bar-fill peer-fill"
                    style={{ width: `${remoteAudioLevel}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Status & Controls Area */}
      <div className="voice-controls-body">
        {/* State: Unsupported (Insecure Origin) */}
        {voiceState === 'unsupported' && (
          <div className="voice-inline-alert alert-warning" role="alert">
            <span className="alert-icon">⚠️</span>
            <span>
              Voice needs a secure origin: open the app via <strong>http://localhost</strong> or <strong>HTTPS</strong>. Chat and editor still work.
            </span>
          </div>
        )}

        {/* State: Denied */}
        {voiceState === 'denied' && (
          <div className="voice-inline-alert alert-danger" role="alert">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span className="alert-icon">🚫</span>
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>Microphone Access Blocked</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.9 }}>
                  Please click the permissions lock icon in your browser address bar, set Microphone to "Allow", and retry.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={retry}
              style={{ marginTop: '8px' }}
              aria-label="Retry microphone request"
            >
              Retry
            </button>
          </div>
        )}

        {/* State: Replaced */}
        {voiceState === 'replaced' && (
          <div className="voice-inline-alert alert-info" role="alert">
            <span className="alert-icon">ℹ️</span>
            <div>
              <p style={{ margin: 0, fontWeight: 600 }}>Voice Moved to Another Tab</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                You joined voice from another tab. Click below to reconnect from this tab.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={joinVoice}
              style={{ marginTop: '8px' }}
              aria-label="Reconnect voice to this tab"
            >
              Reconnect Here
            </button>
          </div>
        )}

        {/* State: Failed */}
        {voiceState === 'failed' && (
          <div className="voice-inline-alert alert-danger" role="alert">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="alert-icon">❌</span>
              <span>{errorMessage || 'Voice connection failed'}</span>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={retry}
              style={{ marginTop: '8px' }}
              aria-label="Retry voice connection"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* State: Idle */}
        {voiceState === 'idle' && (
          <div className="voice-idle-row">
            <button
              type="button"
              id="voice-join-btn"
              className="btn btn-sm btn-primary voice-join-action-btn"
              onClick={joinVoice}
              aria-label="Join voice call"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              <span>Join Voice</span>
            </button>
            <span className="voice-idle-hint">1:1 Audio • P2P</span>
          </div>
        )}

        {/* State: Requesting Mic */}
        {isRequesting && (
          <div className="voice-status-line" aria-live="polite">
            <span className="spinner-sm" />
            <span>Requesting microphone access...</span>
          </div>
        )}

        {/* State: Waiting for Peer */}
        {isWaiting && (
          <div className="voice-active-row">
            <div className="voice-status-line" aria-live="polite">
              <span className="voice-pulse-dot" />
              <span>Waiting for {otherUserName} to join voice...</span>
            </div>
            <div className="voice-btn-group">
              <button
                type="button"
                className={`btn btn-sm ${isMuted ? 'btn-danger' : 'btn-secondary'} voice-mute-btn`}
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? '🔇 Unmute' : '🎙️ Mute'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary voice-leave-btn"
                onClick={leaveVoice}
                aria-label="Leave voice call"
              >
                Leave
              </button>
            </div>
          </div>
        )}

        {/* State: Connecting */}
        {isConnecting && (
          <div className="voice-active-row">
            <div className="voice-status-line" aria-live="polite">
              <span className="spinner-sm" />
              <span>Connecting P2P audio...</span>
            </div>
            <div className="voice-btn-group">
              <button
                type="button"
                className="btn btn-sm btn-secondary voice-leave-btn"
                onClick={leaveVoice}
                aria-label="Cancel connection and leave voice"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* State: Connected */}
        {isConnected && (
          <div className="voice-active-row">
            <div className="voice-status-line" aria-live="polite">
              <span className="voice-connected-dot" />
              <span className="voice-connected-text">Connected</span>
              {isMuted && <span className="voice-muted-tag">Muted</span>}
            </div>

            <div className="voice-btn-group">
              <button
                type="button"
                id="voice-mute-btn"
                className={`btn btn-sm ${isMuted ? 'btn-danger' : 'btn-secondary'} voice-mute-btn`}
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? '🔇 Unmute' : '🎙️ Mute'}
              </button>
              <button
                type="button"
                id="voice-leave-btn"
                className="btn btn-sm btn-secondary voice-leave-btn"
                onClick={leaveVoice}
                aria-label="Leave voice call"
              >
                Leave
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mandatory Privacy & Headphones Note */}
      <footer className="voice-controls-footer">
        <p className="voice-privacy-note">
          🎧 Use headphones to avoid echo. Audio is peer-to-peer and is never recorded or stored.
        </p>
      </footer>
    </div>
  );
}

/**
 * Public VoiceControls component with boundary wrapping.
 */
export default function VoiceControls(props) {
  return (
    <VoiceErrorBoundary>
      <VoiceControlsInner {...props} />
    </VoiceErrorBoundary>
  );
}
