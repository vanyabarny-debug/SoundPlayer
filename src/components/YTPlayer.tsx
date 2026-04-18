import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';

declare global {
  interface Window {
    YT?: {
      Player: new (elementId: string, options: Record<string, unknown>) => YTPlayerInstance;
      PlayerState?: { PLAYING: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YTPlayerInstance = {
  destroy: () => void;
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
};

export function YTPlayer() {
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const {
    ytVideoId,
    isYTPlaying,
    hasYTUserGesture,
    volume,
    isMuted,
    unlockYTUserGesture,
    setYTPlaying,
  } = usePlayerStore();

  useEffect(() => {
    const unlock = () => {
      unlockYTUserGesture();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, [unlockYTUserGesture]);

  useEffect(() => {
    let cancelled = false;
    const mountPlayer = () => {
      if (cancelled || playerRef.current || !window.YT?.Player) return;
      playerRef.current = new window.YT.Player('yt-audio-engine', {
        height: '0',
        width: '0',
        playerVars: { autoplay: 1, controls: 0 },
        events: {
          onStateChange: (event: { data: number }) => {
            const state = window.YT?.PlayerState;
            if (!state) return;
            if (event.data === state.PLAYING) setYTPlaying(true);
            if (event.data === state.PAUSED) setYTPlaying(false);
          },
        },
      });
    };

    if (window.YT?.Player) {
      mountPlayer();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      mountPlayer();
    };

    return () => {
      cancelled = true;
    };
  }, [setYTPlaying]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (isMuted) player.mute();
    else player.unMute();
    player.setVolume(Math.round(Math.max(0, Math.min(1, volume)) * 100));
  }, [isMuted, volume]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ytVideoId) return;
    player.loadVideoById(ytVideoId);
  }, [ytVideoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ytVideoId) return;
    if (!hasYTUserGesture) return;
    if (isYTPlaying) player.playVideo();
    else player.pauseVideo();
  }, [hasYTUserGesture, isYTPlaying, ytVideoId]);

  useEffect(() => () => {
    playerRef.current?.destroy();
    playerRef.current = null;
  }, []);

  return (
    <div
      id="yt-audio-engine"
      style={{ width: 0, height: 0, opacity: 0, pointerEvents: 'none', position: 'fixed' }}
      aria-hidden
    />
  );
}
