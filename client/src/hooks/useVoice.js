import { useState, useEffect, useRef, useCallback } from 'react';
import { getRtcConfig } from '../api';
import { getSocket, subscribeToSocketEvent } from '../socket';

/**
 * Custom hook for 1:1 audio-only WebRTC calling inside live session rooms.
 * Handles signaling, media streams, peer connection lifecycle, audio levels, and cleanup.
 * 
 * @param {object} params
 * @param {string} params.roomId
 * @param {object} params.booking
 * @param {string} params.currentUserId
 * @returns {object}
 */
export function useVoice({ roomId, booking, currentUserId, onVoicePeersChange }) {
  const [voiceState, setVoiceState] = useState('idle');
  // Possible states: 'unsupported' | 'idle' | 'requesting-mic' | 'denied' | 'waiting-for-peer' | 'connecting' | 'connected' | 'failed' | 'disabled' | 'replaced'
  const [isMuted, setIsMuted] = useState(false);
  const [peerInVoice, setPeerInVoice] = useState(false);
  const [localAudioLevel, setLocalAudioLevel] = useState(0);
  const [remoteAudioLevel, setRemoteAudioLevel] = useState(0);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const localStreamRef = useRef(null);
  const pcRef = useRef(null);
  const audioElRef = useRef(null);
  const isInitiatorRef = useRef(false);
  const iceServersRef = useRef([{ urls: 'stun:stun.l.google.com:19302' }]);
  const iceQueueRef = useRef([]);
  const hasRemoteDescriptionRef = useRef(false);

  const connectTimerRef = useRef(null);
  const disconnectTimerRef = useRef(null);
  const localCleanupRef = useRef(null);
  const remoteCleanupRef = useRef(null);

  const otherUserId = booking
    ? booking.learner_id === currentUserId
      ? booking.mentor_id
      : booking.learner_id
    : null;

  // 1. Initial support & secure context check
  const isSupported = Boolean(
    typeof window !== 'undefined' &&
    (window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    window.RTCPeerConnection
  );

  useEffect(() => {
    if (!isSupported) {
      setVoiceState('unsupported');
      return;
    }

    // Check RTC configuration from backend
    getRtcConfig()
      .then((cfg) => {
        if (!cfg || cfg.enabled === false) {
          setVoiceState('disabled');
        } else if (cfg.iceServers) {
          iceServersRef.current = cfg.iceServers;
        }
      })
      .catch((err) => {
        console.warn('[Voice] Failed to load RTC config, using default STUN:', err);
      });
  }, [isSupported]);

  // Cleanup helper for streams, peer connection, and audio contexts
  const cleanupMediaAndPc = useCallback(() => {
    // Clear connection timeouts
    if (connectTimerRef.current) {
      clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
    }
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }

    // Stop audio volume analysers
    if (localCleanupRef.current) {
      localCleanupRef.current();
      localCleanupRef.current = null;
    }
    if (remoteCleanupRef.current) {
      remoteCleanupRef.current();
      remoteCleanupRef.current = null;
    }
    setLocalAudioLevel(0);
    setRemoteAudioLevel(0);
    setIsLocalSpeaking(false);
    setIsRemoteSpeaking(false);

    // Stop and release local microphone tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (_) {}
      });
      localStreamRef.current = null;
    }

    // Close and reset PeerConnection
    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.close();
      } catch (_) {}
      pcRef.current = null;
    }

    // Reset remote audio element
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
    }

    iceQueueRef.current = [];
    hasRemoteDescriptionRef.current = false;
  }, []);

  // AnalyserNode setup for audio meter and speaking indicator
  const setupAudioAnalyser = useCallback((stream, isLocal) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let animId;

      const checkVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        const speaking = normalized > 10;

        if (isLocal) {
          setLocalAudioLevel(normalized);
          setIsLocalSpeaking(speaking);
        } else {
          setRemoteAudioLevel(normalized);
          setIsRemoteSpeaking(speaking);
        }

        animId = requestAnimationFrame(checkVolume);
      };

      animId = requestAnimationFrame(checkVolume);

      return () => {
        cancelAnimationFrame(animId);
        try {
          ctx.close();
        } catch (_) {}
      };
    } catch (_) {
      return null;
    }
  }, []);

  // Create and initialize RTCPeerConnection
  const createPeerConnection = useCallback(() => {
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (_) {}
    }

    const socket = getSocket();
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    pcRef.current = pc;
    hasRemoteDescriptionRef.current = false;
    iceQueueRef.current = [];

    // Add local audio tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle remote audio stream
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      if (audioElRef.current) {
        audioElRef.current.srcObject = remoteStream;
        audioElRef.current.play().catch(() => {});
      }
      if (remoteCleanupRef.current) remoteCleanupRef.current();
      remoteCleanupRef.current = setupAudioAnalyser(remoteStream, false);
    };

    // Relay local ICE candidates
    pc.onicecandidate = (event) => {
      if (socket) {
        socket.emit('rtc:signal', {
          roomId,
          data: {
            kind: 'ice',
            candidate: event.candidate ? event.candidate.toJSON() : null,
          },
        });
      }
    };

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        if (connectTimerRef.current) {
          clearTimeout(connectTimerRef.current);
          connectTimerRef.current = null;
        }
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
        setVoiceState('connected');
        setErrorMessage(null);
      } else if (state === 'failed') {
        setVoiceState('failed');
        setErrorMessage('Connection failed');
      }
    };

    // ICE connection state monitoring (detect disconnection > 8s)
    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      if (iceState === 'connected' || iceState === 'completed') {
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
        setVoiceState('connected');
        setErrorMessage(null);
      } else if (iceState === 'disconnected' || iceState === 'failed') {
        if (!disconnectTimerRef.current) {
          disconnectTimerRef.current = setTimeout(() => {
            setVoiceState('failed');
            setErrorMessage('Connection lost');
          }, 8000);
        }
      }
    };

    return pc;
  }, [roomId, setupAudioAnalyser]);

  // Flush queued ICE candidates after remote description is set
  const flushIceQueue = useCallback(async (pc) => {
    hasRemoteDescriptionRef.current = true;
    while (iceQueueRef.current.length > 0) {
      const candidateData = iceQueueRef.current.shift();
      if (candidateData) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidateData));
        } catch (_) {}
      }
    }
  }, []);

  // User Action: Join Voice
  const joinVoice = useCallback(async () => {
    if (!isSupported) {
      setVoiceState('unsupported');
      return;
    }

    setVoiceState('requesting-mic');
    setErrorMessage(null);

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localStreamRef.current = stream;
      setIsMuted(false);

      // Start local audio level monitoring
      if (localCleanupRef.current) localCleanupRef.current();
      localCleanupRef.current = setupAudioAnalyser(stream, true);
    } catch (err) {
      console.warn('[Voice] Microphone access denied or unavailable:', err);
      setVoiceState('denied');
      setErrorMessage(
        err.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Please allow microphone access in your browser address bar.'
          : 'Could not access audio device.'
      );
      return;
    }

    const socket = getSocket();
    if (!socket) {
      setVoiceState('failed');
      setErrorMessage('Chat socket not connected');
      cleanupMediaAndPc();
      return;
    }

    socket.emit('rtc:join', { roomId }, (ack) => {
      if (!ack || !ack.ok) {
        setVoiceState('failed');
        setErrorMessage(ack?.error || 'Failed to join voice room');
        cleanupMediaAndPc();
        return;
      }

      isInitiatorRef.current = Boolean(ack.initiator);
      const peers = Array.isArray(ack.peers) ? ack.peers : [];
      const isPeerPresent = peers.includes(otherUserId);
      setPeerInVoice(isPeerPresent);
      onVoicePeersChange?.(peers);

      if (isPeerPresent) {
        setVoiceState('connecting');
      } else {
        setVoiceState('waiting-for-peer');
      }
    });
  }, [isSupported, roomId, otherUserId, setupAudioAnalyser, cleanupMediaAndPc, onVoicePeersChange]);

  // User Action: Leave Voice
  const leaveVoice = useCallback(() => {
    cleanupMediaAndPc();

    const socket = getSocket();
    if (socket && roomId) {
      socket.emit('rtc:leave', { roomId }, () => {});
    }

    setVoiceState('idle');
    setErrorMessage(null);
  }, [cleanupMediaAndPc, roomId]);

  // User Action: Toggle Mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  // User Action: Retry Connection
  const retry = useCallback(() => {
    leaveVoice();
    setTimeout(() => {
      joinVoice();
    }, 200);
  }, [leaveVoice, joinVoice]);

  // Listen for real-time signaling events from Socket.io
  useEffect(() => {
    if (!roomId) return;

    // rtc:ready -> server tells initiator to create offer
    const unsubReady = subscribeToSocketEvent('rtc:ready', async () => {
      if (!isInitiatorRef.current || !localStreamRef.current) return;

      setVoiceState('connecting');
      setErrorMessage(null);

      // 15s connection timeout
      if (connectTimerRef.current) clearTimeout(connectTimerRef.current);
      connectTimerRef.current = setTimeout(() => {
        setVoiceState('failed');
        setErrorMessage('Connection timed out');
      }, 15000);

      try {
        const pc = createPeerConnection();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const socket = getSocket();
        if (socket) {
          socket.emit('rtc:signal', {
            roomId,
            data: {
              kind: 'offer',
              sdp: { type: offer.type, sdp: offer.sdp },
            },
          });
        }
      } catch (err) {
        setVoiceState('failed');
        setErrorMessage('Failed to create voice offer');
      }
    });

    // rtc:signal -> handle incoming offer, answer, or ice candidate
    const unsubSignal = subscribeToSocketEvent('rtc:signal', async (msg) => {
      if (!msg || msg.roomId !== roomId || !msg.data) return;
      const { data } = msg;

      try {
        if (data.kind === 'offer') {
          // Mentor answers the offer
          setVoiceState('connecting');
          setErrorMessage(null);

          if (connectTimerRef.current) clearTimeout(connectTimerRef.current);
          connectTimerRef.current = setTimeout(() => {
            setVoiceState('failed');
            setErrorMessage('Connection timed out');
          }, 15000);

          const pc = createPeerConnection();
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          await flushIceQueue(pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          const socket = getSocket();
          if (socket) {
            socket.emit('rtc:signal', {
              roomId,
              data: {
                kind: 'answer',
                sdp: { type: answer.type, sdp: answer.sdp },
              },
            });
          }
        } else if (data.kind === 'answer') {
          // Learner receives answer from mentor
          if (pcRef.current) {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
            await flushIceQueue(pcRef.current);
          }
        } else if (data.kind === 'ice') {
          // Incoming ICE candidate
          if (data.candidate) {
            if (pcRef.current && hasRemoteDescriptionRef.current) {
              try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch (_) {}
            } else {
              iceQueueRef.current.push(data.candidate);
            }
          }
        }
      } catch (err) {
        console.warn('[Voice] Signal processing error:', err);
      }
    });

    // rtc:peer-joined
    const unsubPeerJoined = subscribeToSocketEvent('rtc:peer-joined', (payload) => {
      if (payload?.userId === otherUserId) {
        setPeerInVoice(true);
      }
    });

    // rtc:peer-left -> peer left voice
    const unsubPeerLeft = subscribeToSocketEvent('rtc:peer-left', (payload) => {
      if (payload?.userId === otherUserId) {
        setPeerInVoice(false);
        // Tear down peer connection but retain local mic stream
        if (pcRef.current) {
          try {
            pcRef.current.close();
          } catch (_) {}
          pcRef.current = null;
        }
        if (remoteCleanupRef.current) {
          remoteCleanupRef.current();
          remoteCleanupRef.current = null;
        }
        setRemoteAudioLevel(0);
        setIsRemoteSpeaking(false);
        if (voiceState === 'connected' || voiceState === 'connecting') {
          setVoiceState('waiting-for-peer');
        }
      }
    });

    // rtc:replaced -> voice session opened in another tab
    const unsubReplaced = subscribeToSocketEvent('rtc:replaced', (payload) => {
      if (payload?.roomId === roomId) {
        cleanupMediaAndPc();
        setVoiceState('replaced');
        setErrorMessage('Voice moved to another tab');
      }
    });

    // rtc:ended -> room voice ended by server
    const unsubEnded = subscribeToSocketEvent('rtc:ended', (payload) => {
      if (payload?.roomId === roomId) {
        cleanupMediaAndPc();
        setVoiceState('idle');
      }
    });

    // session:ended -> session completed/settled
    const unsubSessionEnded = subscribeToSocketEvent('session:ended', (payload) => {
      if (payload?.roomId === roomId) {
        cleanupMediaAndPc();
        setVoiceState('idle');
      }
    });

    // demo:reset
    const unsubDemoReset = subscribeToSocketEvent('demo:reset', () => {
      cleanupMediaAndPc();
      setVoiceState('idle');
    });

    return () => {
      unsubReady();
      unsubSignal();
      unsubPeerJoined();
      unsubPeerLeft();
      unsubReplaced();
      unsubEnded();
      unsubSessionEnded();
      unsubDemoReset();
    };
  }, [roomId, otherUserId, createPeerConnection, flushIceQueue, cleanupMediaAndPc, voiceState]);

  // Page unload & unmount mic release (C4)
  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanupMediaAndPc();
      const socket = getSocket();
      if (socket && roomId) {
        socket.emit('rtc:leave', { roomId }, () => {});
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanupMediaAndPc();
      const socket = getSocket();
      if (socket && roomId) {
        socket.emit('rtc:leave', { roomId }, () => {});
      }
    };
  }, [cleanupMediaAndPc, roomId]);

  return {
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
  };
}
