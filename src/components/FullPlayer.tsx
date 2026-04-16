import { ChevronDown, Play, Pause, SkipBack, SkipForward, Heart, ListMusic, FileAudio, MoreVertical, Loader2, Repeat, Repeat1, Volume2, VolumeX, Smartphone, Headphones, Speaker, Disc3 } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useMockServer, TrackMetadata } from '../store/mockServer';
import { useAuthStore } from '../store/authStore';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useState, useEffect } from 'react';
import { AddToPlaylistModal } from './AddToPlaylistModal';
import { CachedImage } from './CachedImage';
import { ScrollingText } from './ScrollingText';
import { getAverageColor } from '../lib/colorExtractor';
import { getImageFile } from '../lib/db';
import { LyricsView } from './LyricsView';
import { useNavigate } from 'react-router-dom';
import { resolveArtistId } from '../lib/artistRouting';
import { toStringArray } from '../lib/safe';

export function FullPlayer({ onClose, track }: { onClose: () => void, track: TrackMetadata }) {
  const navigate = useNavigate();
  const { isPlaying, togglePlay, nextTrack, prevTrack, currentTime, duration, seek, isLoading, volume, setVolume, isMuted, toggleMute, repeatMode, toggleRepeatMode } = usePlayerStore();
  const { currentUserId } = useAuthStore();
  const { users, albums, artists, updateUser } = useMockServer();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [audioOutput, setAudioOutput] = useState('speaker');
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [trackColor, setTrackColor] = useState('#FFFFFF');
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isVolumeSliderOpen, setIsVolumeSliderOpen] = useState(false);

  useEffect(() => {
    let objectUrl: string | undefined;
    if (track.coverUrl) {
      const colorSourcePromise = track.coverUrl.startsWith('http')
        ? getAverageColor(track.coverUrl)
        : getImageFile(track.coverUrl).then(blob => {
            if (blob) {
              objectUrl = URL.createObjectURL(blob);
              return getAverageColor(objectUrl);
            }
            return Promise.reject('No blob');
          });

      colorSourcePromise
        .then(color => {
          setTrackColor(color);
        })
        .catch(() => {
          setTrackColor('#FFFFFF'); // fallback to white
        })
        .finally(() => {
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
          }
        });
    } else {
      setTrackColor('#FFFFFF'); // fallback for tracks with no cover
    }

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }, [track.coverUrl]);

  useEffect(() => {
  }, [track.id, track.title]);
  
  const user = currentUserId ? users[currentUserId] : null;
  const userFavoriteTrackIds = user?.favoriteTrackIds ?? [];
  const normalizeValue = (value: string) => value.trim().toLowerCase();
  const isTrackEquivalent = (source: TrackMetadata, candidate: TrackMetadata) =>
    normalizeValue(source.title) === normalizeValue(candidate.title)
    && normalizeValue(source.artistIds?.[0] || '') === normalizeValue(candidate.artistIds?.[0] || '');
  const favoriteTracks = userFavoriteTrackIds
    .map((trackId) => useMockServer.getState().tracks[trackId])
    .filter((candidate): candidate is TrackMetadata => Boolean(candidate));
  const isFavorite = userFavoriteTrackIds.includes(track.id)
    || favoriteTracks.some((candidate) => isTrackEquivalent(track, candidate));
  const linkedAlbum = track.albumId
    ? albums[track.albumId]
    : Object.values(albums).find((album) => album.trackIds.includes(track.id));
  const artistRefs = toStringArray(track.artistIds);
  const artistNames = artistRefs.length > 0 ? artistRefs.join(', ') : 'Unknown artist';

  const toggleFavorite = () => {
    if (!user) return;
    const favorites = user.favoriteTrackIds ?? [];
    const allTracks = Object.values(useMockServer.getState().tracks);
    const equivalentTrackIds = allTracks
      .filter((candidate) => isTrackEquivalent(track, candidate))
      .map((candidate) => candidate.id);
    const newFavorites = isFavorite 
      ? favorites.filter((id) => !equivalentTrackIds.includes(id))
      : Array.from(new Set([...favorites, track.id, ...equivalentTrackIds]));
    updateUser(user.id, { favoriteTrackIds: newFavorites });
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const displayTime = dragTime !== null ? dragTime : currentTime;
  const displayProgress = duration > 0 ? (displayTime / duration) * 100 : 0;
  const volumeProgress = (isMuted ? 0 : volume) * 100;
  const accentColor = trackColor;

  useEffect(() => {
  }, []);

  useEffect(() => {
  }, [dragTime, currentTime, progress, displayProgress]);

  useEffect(() => {
  }, [volumeProgress, isVolumeSliderOpen]);

  useEffect(() => {
    const coarse = typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)').matches : false;
    setIsCoarsePointer(coarse);
  }, []);

  useEffect(() => {
  }, [isVolumeSliderOpen, isCoarsePointer]);

  const PlayerControls = (
    <div className="flex items-center justify-between mb-2 flex-shrink-0">
      <button 
        onClick={toggleRepeatMode} 
        className={cn("p-2 transition-colors", repeatMode !== 'off' ? "" : "text-slate-400")}
        style={repeatMode !== 'off' ? { color: accentColor } : undefined}
      >
        {repeatMode === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
      </button>
      
      <div className="flex items-center justify-center gap-6">
        <button onClick={prevTrack} className="text-slate-400 transition-colors" style={{ ['--hover-accent' as string]: accentColor }}>
          <SkipBack className="w-8 h-8 fill-current" />
        </button>
        <button 
          onClick={togglePlay} 
          className="w-16 h-16 text-white rounded-full flex items-center justify-center hover:scale-105 transition-transform flex-shrink-0 shadow-lg shadow-violet-200"
          style={{ backgroundColor: accentColor }}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : (isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />)}
        </button>
        <button onClick={nextTrack} className="text-slate-400 transition-colors" style={{ ['--hover-accent' as string]: accentColor }}>
          <SkipForward className="w-8 h-8 fill-current" />
        </button>
      </div>

      <div className="flex items-center gap-2 relative">
        <button
          onClick={() => {
            setIsVolumeSliderOpen(prev => !prev);
          }}
          className="p-2 text-slate-400 transition-colors"
          style={{ color: isVolumeSliderOpen ? accentColor : undefined }}
        >
          {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
        <div className={cn(
          "absolute bottom-full right-0 mb-2 bg-white p-3 rounded-xl shadow-xl md:static md:bg-transparent md:p-0 md:shadow-none",
          isVolumeSliderOpen || isCoarsePointer ? "flex" : "hidden"
        )}>
          <input 
            type="range" 
            min={0} 
            max={1} 
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              if (isMuted) toggleMute();
              setVolume(Number(e.target.value));
            }}
            className="w-24 h-1.5 bg-slate-200 rounded-full appearance-none dynamic-thumb [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full cursor-pointer md:w-20"
            style={{
              background: `linear-gradient(to right, ${trackColor} ${volumeProgress}%, rgb(203 213 225) ${volumeProgress}%)`,
              ['--thumb-color' as string]: trackColor
            }}
          />
        </div>
      </div>
    </div>
  );

  return (
    <AnimatePresence mode="wait">
      <motion.div 
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 1 }}
        className="fixed inset-0 z-[60] bg-gradient-to-b from-violet-50 via-sky-50 to-slate-100 flex flex-col h-[100dvh]"
      >
        <div className="flex items-center justify-between p-4 flex-shrink-0">
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-violet-500">
            <ChevronDown className="w-6 h-6" />
          </button>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-widest">
            {track.albumId ? 'Из альбома' : 'Сингл'}
          </div>
          <button onClick={() => setIsMenuOpen(true)} className="p-2 text-slate-400 hover:text-violet-500">
            <MoreVertical className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 flex flex-col px-6 pb-6 min-h-0 overflow-y-auto scrollbar-hide">
          <div className="flex-1 flex items-center justify-center py-2 min-h-0" onClick={() => setIsLyricsOpen(true)}>
            <div className="w-full aspect-square max-w-[320px] bg-violet-100 rounded-2xl overflow-hidden shadow-2xl shadow-violet-100/80">
              {track.coverUrl ? (
                <CachedImage src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <ListMusic className="w-24 h-24" />
                </div>
              )}
            </div>
          </div>

          <div className="mb-4 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex-1 min-w-0 pr-4">
                <ScrollingText text={track.title} className="text-2xl font-bold text-slate-700 mb-1" />
                {artistRefs.length > 0 ? (
                  <div className="text-lg text-slate-400 truncate">
                    {artistRefs.map((artistRef, index) => {
                      const artistId = resolveArtistId(artistRef, artists);
                      const key = `${track.id}-full-artist-${artistRef}-${index}`;
                      if (!artistId) {
                        return <span key={key}>{index > 0 ? `, ${artistRef}` : artistRef}</span>;
                      }
                      return (
                        <span key={key}>
                          {index > 0 && ', '}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onClose();
                              navigate(`/artist/${artistId}`);
                            }}
                            className="hover:text-violet-500 transition-colors underline-offset-2 hover:underline"
                          >
                            {artistRef}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <ScrollingText text={artistNames} className="text-lg text-slate-400" />
                )}
              </div>
              <div className="flex items-center gap-1">
                {linkedAlbum && (
                  <button
                    onClick={() => navigate(`/album/${linkedAlbum.id}`)}
                    className="p-2 flex-shrink-0 text-slate-400 hover:text-violet-500"
                    title="Открыть альбом"
                  >
                    <Disc3 className="w-6 h-6" />
                  </button>
                )}
                <button onClick={toggleFavorite} className="p-2 flex-shrink-0">
                  <Heart className={cn("w-7 h-7", isFavorite ? "fill-rose-500 text-rose-500" : "text-slate-400")} />
                </button>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 mt-3">
              {track.isExplicit && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase text-white" style={{ backgroundColor: accentColor }}>E</span>
              )}
              <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase flex items-center gap-1 text-white" style={{ backgroundColor: accentColor }}>
                <FileAudio className="w-3 h-3" /> {track.format || 'unknown'}
              </span>
            </div>
          </div>

          <div className="mb-4 flex-shrink-0">
            <input 
              type="range" 
              min={0} 
              max={duration || 100} 
              value={dragTime !== null ? dragTime : currentTime}
              onChange={(e) => setDragTime(Number(e.target.value))}
              onMouseUp={(e) => {
                if (dragTime !== null) {
                  seek(dragTime);
                  setDragTime(null);
                }
              }}
              onTouchEnd={(e) => {
                if (dragTime !== null) {
                  seek(dragTime);
                  setDragTime(null);
                }
              }}
              className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer dynamic-thumb [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full"
              style={{
                background: `linear-gradient(to right, ${trackColor} ${displayProgress}%, rgb(203 213 225) ${displayProgress}%)`,
                ['--thumb-color' as string]: trackColor
              }}
            />
            <div className="flex justify-between text-xs text-slate-400 mt-2 font-mono">
              <span>{formatTime(dragTime !== null ? dragTime : currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {PlayerControls}
        </div>

        {isLyricsOpen && (
          <LyricsView 
            lyrics={track.lyrics || ''} 
            coverUrl={track.coverUrl} 
            onClose={() => setIsLyricsOpen(false)}
          >
            {PlayerControls}
          </LyricsView>
        )}
      </motion.div>
      {isMenuOpen && (
        <div className="fixed inset-0 bg-violet-200/40 z-[70]" onClick={() => setIsMenuOpen(false)}>
          <motion.div 
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 1 }}
            className="absolute bottom-0 left-0 right-0 bg-white p-4 rounded-t-2xl border-t border-violet-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-4 text-center">Воспроизводится на</h3>
            <div className="space-y-2">
              <button 
                onClick={() => setAudioOutput('speaker')}
                className={`w-full flex items-center gap-4 p-3 rounded-lg text-left ${audioOutput === 'speaker' ? 'text-white' : 'hover:bg-violet-50'}`}
                style={audioOutput === 'speaker' ? { backgroundColor: accentColor } : undefined}>
                <Smartphone />
                <span>Динамик телефона</span>
              </button>
              <button 
                onClick={() => setAudioOutput('headphones')}
                className={`w-full flex items-center gap-4 p-3 rounded-lg text-left ${audioOutput === 'headphones' ? 'text-white' : 'hover:bg-violet-50'}`}
                style={audioOutput === 'headphones' ? { backgroundColor: accentColor } : undefined}>
                <Headphones />
                <span>Наушники</span>
              </button>
              <button 
                onClick={() => setAudioOutput('bt-speaker')}
                className={`w-full flex items-center gap-4 p-3 rounded-lg text-left ${audioOutput === 'bt-speaker' ? 'text-white' : 'hover:bg-violet-50'}`}
                style={audioOutput === 'bt-speaker' ? { backgroundColor: accentColor } : undefined}>
                <Speaker />
                <span>Колонка (Bluetooth)</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
