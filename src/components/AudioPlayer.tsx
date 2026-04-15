import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { getAudioFile } from '../lib/db';

export function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { currentTrackId, isPlaying, volume, isMuted, repeatMode, setTime, setDuration, nextTrack, setLoading, seekRequest, clearSeekRequest } = usePlayerStore();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTrackId) return;

    let objectUrl: string | null = null;

    const loadAudio = async () => {
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
  }, [currentTrackId]);

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

  return (
    <audio
      ref={audioRef}
      src={audioUrl || undefined}
      onTimeUpdate={handleTimeUpdate}
      onLoadedMetadata={handleLoadedMetadata}
      onEnded={handleEnded}
    />
  );
}
