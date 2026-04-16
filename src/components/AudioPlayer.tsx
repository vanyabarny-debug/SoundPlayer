import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { getAudioFile } from '../lib/db';

export function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { currentTrackId, previewUrl, isPlaying, volume, isMuted, repeatMode, setTime, setDuration, nextTrack, setLoading, seekRequest, clearSeekRequest, updateAudioMetrics } = usePlayerStore();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const analyserContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastMetricsTsRef = useRef(0);

  useEffect(() => {
    let objectUrl: string | null = null;

    const loadAudio = async () => {
      if (previewUrl) {
        setLoading(true);
        setAudioUrl(previewUrl);
        return;
      }
      if (!currentTrackId) {
        setAudioUrl(null);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const file = await getAudioFile(currentTrackId);
        if (file) {
          objectUrl = URL.createObjectURL(file);
          setAudioUrl(objectUrl);
          setLoading(false);
        } else {
          console.log(`Simulating P2P download for track ${currentTrackId}...`);
          // Simulate network delay for P2P
          setTimeout(() => {
            // In a real app, this would fetch from peers.
            // Here we just fail gracefully or we could mock a file if we had one.
            console.log(`P2P download failed or finished for ${currentTrackId}`);
            setAudioUrl(null);
            setLoading(false);
          }, 2000);
        }
      } catch (error) {
        console.error('Audio loading failed', error);
        // #region agent log
        fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'78e223'},body:JSON.stringify({sessionId:'78e223',runId:'album-click-debug',hypothesisId:'H3',location:'components/AudioPlayer.tsx:loadAudio:catch',message:'Audio load threw runtime error',data:{trackId:currentTrackId,error:String(error)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        setAudioUrl(null);
        setLoading(false);
      }
    };

    loadAudio();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [currentTrackId, previewUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    let cancelled = false;

    const setupAnalyser = () => {
      try {
        if (!analyserContextRef.current) {
          analyserContextRef.current = new AudioContext();
        }
        const context = analyserContextRef.current;
        if (context.state === 'suspended') {
          void context.resume().catch(() => undefined);
        }
        if (!sourceNodeRef.current) {
          const stream =
            audio.captureStream?.() ||
            (audio as HTMLAudioElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream?.();
          if (!stream) return;
          sourceNodeRef.current = context.createMediaStreamSource(stream);
        }
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.78;
        sourceNodeRef.current.connect(analyser);
        analyserRef.current = analyser;

        const spectrum = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (cancelled || !analyserRef.current) return;
          const now = performance.now();
          analyserRef.current.getByteFrequencyData(spectrum);

          if (now - lastMetricsTsRef.current >= 33) {
            lastMetricsTsRef.current = now;
            const bucketSize = Math.floor(spectrum.length / 8);
            const bands = new Array<number>(8).fill(0).map((_, bandIndex) => {
              const start = bandIndex * bucketSize;
              const end = bandIndex === 7 ? spectrum.length : start + bucketSize;
              let sum = 0;
              for (let i = start; i < end; i += 1) sum += spectrum[i];
              return sum / Math.max(end - start, 1) / 255;
            });
            const energy = bands.reduce((sum, value) => sum + value, 0) / bands.length;
            updateAudioMetrics({ energy, bands });
          }

          rafRef.current = window.requestAnimationFrame(tick);
        };
        rafRef.current = window.requestAnimationFrame(tick);
      } catch {
        // Keep audio playback running even if analyser fails.
      }
    };

    setupAnalyser();

    return () => {
      cancelled = true;
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch {
          // ignore
        }
        analyserRef.current = null;
      }
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect();
        } catch {
          // ignore
        }
        sourceNodeRef.current = null;
      }
      updateAudioMetrics({ energy: 0, bands: [0, 0, 0, 0, 0, 0, 0, 0] });
    };
  }, [audioUrl, updateAudioMetrics]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.error("Playback failed", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (audioRef.current && seekRequest !== null) {
      audioRef.current.currentTime = seekRequest;
      clearSeekRequest();
    }
  }, [seekRequest, clearSeekRequest]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setTime(audioRef.current.currentTime);
    }
  };

  const handleEnded = () => {
    if (repeatMode === 'one' && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.error("Playback failed", e));
    } else {
      nextTrack();
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      setLoading(false);
    }
  };

  const handleCanPlay = () => {
    setLoading(false);
  };

  const handleError = () => {
    setLoading(false);
  };

  return (
    <audio
      ref={audioRef}
      src={audioUrl || undefined}
      onTimeUpdate={handleTimeUpdate}
      onLoadedMetadata={handleLoadedMetadata}
      onCanPlay={handleCanPlay}
      onError={handleError}
      onEnded={handleEnded}
    />
  );
}
