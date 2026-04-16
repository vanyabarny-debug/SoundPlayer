import { ChevronDown, Play, Pause, SkipBack, SkipForward, Heart, ListMusic, FileAudio, MoreVertical, Loader2, Repeat, Repeat1, Volume2, VolumeX, Smartphone, Headphones, Speaker, Disc3, ArrowLeft } from 'lucide-react';
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
import { useNavigate, useLocation } from 'react-router-dom';
import { resolveArtistId } from '../lib/artistRouting';
import { toStringArray } from '../lib/safe';
import { popNavigationEntry } from '../lib/navigationHistory';

export function FullPlayer({ onClose, track }: { onClose: () => void, track: TrackMetadata }) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    isPlaying,
    togglePlay,
    nextTrack,
    prevTrack,
    currentTime,
    duration,
    seek,
    isLoading,
    volume,
    setVolume,
    isMuted,
    toggleMute,
    repeatMode,
    toggleRepeatMode,
    audioOutputDeviceId,
    audioOutputDevices,
    isAudioOutputSwitchSupported,
    setAudioOutputDeviceId,
  } = usePlayerStore();
  const { currentUserId } = useAuthStore();
  const { users, tracks, albums, artists, updateUser } = useMockServer();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [trackColor, setTrackColor] = useState('#FFFFFF');
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isVolumeSliderOpen, setIsVolumeSliderOpen] = useState(false);
  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
  const [coverModalImageUrl, setCoverModalImageUrl] = useState<string | null>(null);
  const [coverZoom, setCoverZoom] = useState(1);
  const [coverOffset, setCoverOffset] = useState({ x: 0, y: 0 });
  const [isCoverDragging, setIsCoverDragging] = useState(false);
  const [dragStartPoint, setDragStartPoint] = useState({ x: 0, y: 0 });
  const [discAlbumId, setDiscAlbumId] = useState<string | null>(null);

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
    let objectUrl: string | undefined;
    if (!track.coverUrl) {
      setCoverModalImageUrl(null);
      return;
    }
    if (track.coverUrl.startsWith('http')) {
      setCoverModalImageUrl(track.coverUrl);
      return;
    }
    getImageFile(track.coverUrl).then((blob) => {
      if (!blob) {
        setCoverModalImageUrl(null);
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setCoverModalImageUrl(objectUrl);
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
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
  useEffect(() => {
    const candidateAlbum = track.albumId
      ? albums[track.albumId]
      : Object.values(albums).find((album) => album.trackIds.includes(track.id));
    const normalize = (value: string) => value.trim().toLowerCase();
    const equivalentAlbum = Object.values(albums).find((album) => {
      if (!album.itunesCollectionId && !album.id.startsWith('itunes-')) return false;
      return (album.trackIds || []).some((albumTrackId) => {
        const albumTrack = tracks[albumTrackId];
        if (!albumTrack) return false;
        return normalize(albumTrack.title) === normalize(track.title)
          && normalize(albumTrack.artistIds?.[0] || '') === normalize(track.artistIds?.[0] || '');
      });
    });
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'711836'},body:JSON.stringify({sessionId:'711836',runId:'run1',hypothesisId:'H1',location:'src/components/FullPlayer.tsx:130',message:'fullplayer album lookup result',data:{trackId:track.id,trackAlbumId:track.albumId||null,candidateAlbumId:candidateAlbum?.id||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'711836'},body:JSON.stringify({sessionId:'711836',runId:'run1',hypothesisId:'H5',location:'src/components/FullPlayer.tsx:132',message:'fullplayer equivalent itunes album lookup',data:{trackId:track.id,trackTitle:track.title,trackArtist:track.artistIds?.[0]||null,equivalentAlbumId:equivalentAlbum?.id||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!candidateAlbum) {
      // #region agent log
      fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'711836'},body:JSON.stringify({sessionId:'711836',runId:'run1',hypothesisId:'H1',location:'src/components/FullPlayer.tsx:134',message:'fullplayer album lookup failed, hiding disc button',data:{trackId:track.id},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setDiscAlbumId(null);
      const searchTerm = `${track.artistIds?.[0] || ''} ${track.title}`.trim();
      if (!searchTerm) return;
      // #region agent log
      fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'711836'},body:JSON.stringify({sessionId:'711836',runId:'run1',hypothesisId:'H7',location:'src/components/FullPlayer.tsx:140',message:'itunes fallback search start',data:{trackId:track.id,searchTerm},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      void fetch(`https://itunes.apple.com/search?entity=song&limit=8&term=${encodeURIComponent(searchTerm)}`)
        .then((response) => {
          if (!response.ok) throw new Error(`itunes search ${response.status}`);
          return response.json() as Promise<{ results?: Array<{ trackName?: string; artistName?: string; collectionId?: number }> }>;
        })
        .then((payload) => {
          const normalizedTitle = normalizeValue(track.title);
          const normalizedArtist = normalizeValue(track.artistIds?.[0] || '');
          const songs = payload.results || [];
          const exact = songs.find((item) =>
            normalizeValue(String(item.trackName || '')) === normalizedTitle
            && normalizeValue(String(item.artistName || '')) === normalizedArtist
          );
          const fallback = songs.find((item) => typeof item.collectionId === 'number');
          const picked = exact || fallback;
          const collectionId = picked?.collectionId ? String(picked.collectionId) : null;
          // #region agent log
          fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'711836'},body:JSON.stringify({sessionId:'711836',runId:'run1',hypothesisId:'H7',location:'src/components/FullPlayer.tsx:152',message:'itunes fallback search result',data:{trackId:track.id,resultsCount:songs.length,collectionId},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          if (!collectionId) return;
          return fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(collectionId)}&entity=song&limit=200`)
            .then((lookupResponse) => {
              if (!lookupResponse.ok) throw new Error(`itunes lookup ${lookupResponse.status}`);
              return lookupResponse.json() as Promise<{ results?: Array<{ wrapperType?: string; trackId?: number }> }>;
            })
            .then((lookupPayload) => {
              const trackCount = (lookupPayload.results || []).filter((item) => item.wrapperType === 'track' && item.trackId).length;
              const shouldShowDisc = trackCount > 1;
              // #region agent log
              fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'711836'},body:JSON.stringify({sessionId:'711836',runId:'run1',hypothesisId:'H8',location:'src/components/FullPlayer.tsx:163',message:'itunes fallback lookup decision',data:{trackId:track.id,collectionId,trackCount,shouldShowDisc},timestamp:Date.now()})}).catch(()=>{});
              // #endregion
              setDiscAlbumId(shouldShowDisc ? `itunes-${collectionId}` : null);
            });
        })
        .catch(() => {
          // #region agent log
          fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'711836'},body:JSON.stringify({sessionId:'711836',runId:'run1',hypothesisId:'H7',location:'src/components/FullPlayer.tsx:170',message:'itunes fallback failed',data:{trackId:track.id},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
        });
      return;
    }

    const isItunesAlbum = Boolean(candidateAlbum.itunesCollectionId) || candidateAlbum.id.startsWith('itunes-');
    const totalTracks =
      typeof candidateAlbum.sourceTrackCount === 'number' && candidateAlbum.sourceTrackCount > 0
        ? candidateAlbum.sourceTrackCount
        : candidateAlbum.trackIds.length;
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'711836'},body:JSON.stringify({sessionId:'711836',runId:'run1',hypothesisId:'H2',location:'src/components/FullPlayer.tsx:138',message:'fullplayer album eligibility inputs',data:{trackId:track.id,albumId:candidateAlbum.id,itunesCollectionId:candidateAlbum.itunesCollectionId||null,isItunesAlbum,sourceTrackCount:candidateAlbum.sourceTrackCount??null,trackIdsCount:candidateAlbum.trackIds.length,totalTracks},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const shouldShowDisc = isItunesAlbum && totalTracks > 1;
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'711836'},body:JSON.stringify({sessionId:'711836',runId:'run1',hypothesisId:'H3',location:'src/components/FullPlayer.tsx:145',message:'fullplayer disc button final decision',data:{trackId:track.id,albumId:candidateAlbum.id,shouldShowDisc,discAlbumId:shouldShowDisc?candidateAlbum.id:null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    setDiscAlbumId(shouldShowDisc ? candidateAlbum.id : null);
  }, [track.id, albums, tracks, track.title, track.artistIds, track.albumId]);

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
      : Array.from(new Set([track.id, ...equivalentTrackIds, ...favorites]));
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
  const controlsTintClass = isLyricsOpen ? 'text-white/90' : 'text-slate-400';

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

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'711836'},body:JSON.stringify({sessionId:'711836',runId:'run2',hypothesisId:'H9',location:'src/components/FullPlayer.tsx:174',message:'fullplayer route snapshot',data:{path:location.pathname,trackId:track.id,discAlbumId:discAlbumId||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [location.pathname, track.id, discAlbumId]);

  useEffect(() => {
    setIsCoverModalOpen(false);
    setCoverZoom(1);
    setCoverOffset({ x: 0, y: 0 });
    setIsCoverDragging(false);
  }, [track.id]);

  const clampCoverZoom = (value: number) => Math.max(1, Math.min(4, value));
  const updateCoverZoom = (nextZoom: number) => {
    const clamped = clampCoverZoom(nextZoom);
    setCoverZoom(clamped);
    if (clamped <= 1) {
      setCoverOffset({ x: 0, y: 0 });
      setIsCoverDragging(false);
    }
  };
  const openCoverModal = () => {
    setCoverZoom(1);
    setCoverOffset({ x: 0, y: 0 });
    setIsCoverDragging(false);
    setIsCoverModalOpen(true);
  };
  const closeCoverModal = () => {
    setIsCoverModalOpen(false);
    setCoverZoom(1);
    setCoverOffset({ x: 0, y: 0 });
    setIsCoverDragging(false);
  };
  const handleBack = () => {
    let historySizeBeforePop = 0;
    try {
      const raw = window.sessionStorage.getItem('navigation-history-v1');
      const parsed = raw ? JSON.parse(raw) : [];
      historySizeBeforePop = Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      historySizeBeforePop = 0;
    }
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf06a6'},body:JSON.stringify({sessionId:'bf06a6',runId:'run2',hypothesisId:'H6',location:'src/components/FullPlayer.tsx:308',message:'fullplayer back pressed',data:{currentPath:`${location.pathname}${location.search}`,trackId:track.id,historySizeBeforePop,stateKeys:Object.keys((location.state||{}) as Record<string, unknown>)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const stacked = popNavigationEntry(`${location.pathname}${location.search}`);
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf06a6'},body:JSON.stringify({sessionId:'bf06a6',runId:'run2',hypothesisId:'H6',location:'src/components/FullPlayer.tsx:312',message:'fullplayer back pop result',data:{currentPath:`${location.pathname}${location.search}`,stackedPath:stacked?.path||null,hasState:Boolean(stacked?.state),historySizeBeforePop,stateFromArtist:Boolean((location.state as { fromArtist?: boolean } | null)?.fromArtist),stateFromBrowse:Boolean((location.state as { fromBrowse?: boolean } | null)?.fromBrowse)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (stacked) {
      // #region agent log
      fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf06a6'},body:JSON.stringify({sessionId:'bf06a6',runId:'run3',hypothesisId:'H9',location:'src/components/FullPlayer.tsx:316',message:'fullplayer back branch stacked navigate',data:{currentPath:`${location.pathname}${location.search}`,targetPath:stacked.path},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      navigate(stacked.path, { replace: true, state: stacked.state });
      onClose();
      return;
    }
    if (historySizeBeforePop > 0) {
      // #region agent log
      fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf06a6'},body:JSON.stringify({sessionId:'bf06a6',runId:'run3',hypothesisId:'H9',location:'src/components/FullPlayer.tsx:324',message:'fullplayer back branch fallback navigate -1',data:{currentPath:`${location.pathname}${location.search}`,historySizeBeforePop},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      navigate(-1);
      onClose();
      return;
    }
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf06a6'},body:JSON.stringify({sessionId:'bf06a6',runId:'post-fix',hypothesisId:'H4',location:'src/components/FullPlayer.tsx:327',message:'fullplayer fallback close only',data:{currentPath:`${location.pathname}${location.search}`,historySizeBeforePop},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    onClose();
  };

  const PlayerControls = (
    <div className="mb-2 flex-shrink-0 grid grid-cols-[1fr_auto_1fr] items-center">
      <div className="flex items-center justify-start">
        <button 
          onClick={toggleRepeatMode} 
          className={cn("transition-colors", isLyricsOpen ? "p-1.5" : "p-2", repeatMode !== 'off' ? "" : controlsTintClass)}
          style={repeatMode !== 'off' ? { color: accentColor } : undefined}
        >
          {repeatMode === 'one'
            ? <Repeat1 className={cn(isLyricsOpen ? "w-4 h-4" : "w-5 h-5")} />
            : <Repeat className={cn(isLyricsOpen ? "w-4 h-4" : "w-5 h-5")} />}
        </button>
      </div>
      
      <div className={cn("flex items-center justify-center", isLyricsOpen ? "gap-4" : "gap-6")}>
        <button onClick={prevTrack} className={cn(controlsTintClass, "transition-colors")} style={{ ['--hover-accent' as string]: accentColor }}>
          <SkipBack className={cn("fill-current", isLyricsOpen ? "w-6 h-6" : "w-8 h-8")} />
        </button>
        <button 
          onClick={togglePlay} 
          className={cn(
            "text-white rounded-full flex items-center justify-center hover:scale-105 transition-transform flex-shrink-0 shadow-lg shadow-violet-200",
            isLyricsOpen ? "w-12 h-12" : "w-16 h-16"
          )}
          style={{ backgroundColor: accentColor }}
          disabled={isLoading}
        >
          {isLoading
            ? <Loader2 className={cn("animate-spin", isLyricsOpen ? "w-6 h-6" : "w-8 h-8")} />
            : (isPlaying
              ? <Pause className={cn("fill-current", isLyricsOpen ? "w-6 h-6" : "w-8 h-8")} />
              : <Play className={cn("fill-current ml-1", isLyricsOpen ? "w-6 h-6" : "w-8 h-8")} />)}
        </button>
        <button onClick={nextTrack} className={cn(controlsTintClass, "transition-colors")} style={{ ['--hover-accent' as string]: accentColor }}>
          <SkipForward className={cn("fill-current", isLyricsOpen ? "w-6 h-6" : "w-8 h-8")} />
        </button>
      </div>

      <div className="flex items-center gap-2 relative justify-end">
        <button
          onClick={() => {
            setIsVolumeSliderOpen(prev => !prev);
          }}
          className={cn(isLyricsOpen ? "p-1.5" : "p-2", "transition-colors", controlsTintClass)}
          style={{ color: isVolumeSliderOpen ? accentColor : undefined }}
        >
          {isMuted || volume === 0
            ? <VolumeX className={cn(isLyricsOpen ? "w-4 h-4" : "w-5 h-5")} />
            : <Volume2 className={cn(isLyricsOpen ? "w-4 h-4" : "w-5 h-5")} />}
        </button>
        <button
          onClick={() => setIsMenuOpen(true)}
          className={cn(isLyricsOpen ? "p-1.5" : "p-2", "transition-colors", controlsTintClass)}
          style={{ ['--hover-accent' as string]: accentColor }}
          title="Выбрать устройство вывода"
          aria-label="Выбрать устройство вывода"
        >
          <Speaker className={cn(isLyricsOpen ? "w-4 h-4" : "w-5 h-5")} />
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
          <div className="w-10" />
          <div className="text-xs font-medium text-slate-400 uppercase tracking-widest">
            {track.albumId ? 'Из альбома' : 'Сингл'}
          </div>
          <button
            type="button"
            onClick={handleBack}
            className="p-2 text-slate-400 hover:text-violet-500 transition-colors"
            aria-label="Назад"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 flex flex-col px-6 pb-6 min-h-0 overflow-y-auto scrollbar-hide">
          <div className="w-full max-w-[420px] mx-auto flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex items-center justify-center py-2 min-h-0">
              <button
                type="button"
                onClick={openCoverModal}
                className="w-full aspect-square bg-violet-100 rounded-2xl overflow-hidden shadow-2xl shadow-violet-100/80"
                aria-label="Открыть обложку в полном размере"
              >
                {track.coverUrl ? (
                  <CachedImage src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    <ListMusic className="w-24 h-24" />
                  </div>
                )}
              </button>
            </div>

            <div className="mb-4 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1 min-w-0 pr-4">
                  <button
                    type="button"
                    onClick={() => setIsLyricsOpen(true)}
                    className="w-full text-left"
                    aria-label="Открыть текст песни"
                  >
                    <ScrollingText text={track.title} className="text-2xl font-bold text-slate-700 mb-1 hover:text-violet-600 transition-colors" />
                  </button>
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
                  {discAlbumId && (
                    <button
                      onClick={() => {
                        // #region agent log
                        fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'711836'},body:JSON.stringify({sessionId:'711836',runId:'run2',hypothesisId:'H10',location:'src/components/FullPlayer.tsx:356',message:'disc button clicked',data:{trackId:track.id,discAlbumId,fromPath:location.pathname},timestamp:Date.now()})}).catch(()=>{});
                        // #endregion
                        onClose();
                        navigate(`/album/${discAlbumId}`);
                      }}
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
        </div>

        {isLyricsOpen && (
          <LyricsView 
            lyrics={track.lyrics || ''} 
            coverUrl={track.coverUrl} 
            accentColor={accentColor}
            trackTitle={track.title}
            artistName={artistNames}
            currentTime={currentTime}
            duration={duration}
            onSeek={seek}
            onClose={() => setIsLyricsOpen(false)}
          >
            {PlayerControls}
          </LyricsView>
        )}
        {isCoverModalOpen && (
          <div className="fixed inset-0 z-[85] bg-black/90 flex flex-col">
            <div className="flex items-center justify-end p-4 text-white">
              <button
                type="button"
                onClick={closeCoverModal}
                className="text-white/90 hover:text-white transition-colors"
                aria-label="Закрыть просмотр обложки"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
            </div>
            <div
              className={cn(
                "flex-1 overflow-hidden flex items-center justify-center px-4 pb-4",
                coverZoom > 1 ? (isCoverDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
              )}
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.2 : 0.2;
                updateCoverZoom(coverZoom + delta);
              }}
              onMouseDown={(e) => {
                if (coverZoom <= 1) return;
                setIsCoverDragging(true);
                setDragStartPoint({ x: e.clientX - coverOffset.x, y: e.clientY - coverOffset.y });
              }}
              onMouseMove={(e) => {
                if (!isCoverDragging || coverZoom <= 1) return;
                setCoverOffset({ x: e.clientX - dragStartPoint.x, y: e.clientY - dragStartPoint.y });
              }}
              onMouseUp={() => setIsCoverDragging(false)}
              onMouseLeave={() => setIsCoverDragging(false)}
              onDoubleClick={() => updateCoverZoom(coverZoom > 1 ? 1 : 2)}
            >
              {coverModalImageUrl ? (
                <img
                  src={coverModalImageUrl}
                  alt={track.title}
                  className="max-w-full max-h-full object-contain select-none"
                  draggable={false}
                  style={{ transform: `translate(${coverOffset.x}px, ${coverOffset.y}px) scale(${coverZoom})` }}
                />
              ) : (
                <div className="w-full max-w-xl aspect-square rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white/70">
                  <ListMusic className="w-24 h-24" />
                </div>
              )}
            </div>
          </div>
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
              {!isAudioOutputSwitchSupported && (
                <div className="rounded-lg bg-violet-50 text-slate-500 text-sm px-3 py-2">
                  Браузер не поддерживает переключение аудиовыхода для веб-плеера.
                </div>
              )}
              <button
                onClick={() => setAudioOutputDeviceId('default')}
                className={`w-full flex items-center gap-4 p-3 rounded-lg text-left ${audioOutputDeviceId === 'default' ? 'text-white' : 'hover:bg-violet-50'}`}
                style={audioOutputDeviceId === 'default' ? { backgroundColor: accentColor } : undefined}
              >
                <Smartphone />
                <span>Системный по умолчанию</span>
              </button>
              {audioOutputDevices.map((device) => {
                const label = device.label.toLowerCase();
                const Icon = label.includes('head') || label.includes('науш')
                  ? Headphones
                  : label.includes('speaker') || label.includes('динам') || label.includes('колон')
                    ? Speaker
                    : Smartphone;
                const isSelected = audioOutputDeviceId === device.deviceId;
                return (
                  <button
                    key={device.deviceId}
                    onClick={() => setAudioOutputDeviceId(device.deviceId)}
                    className={`w-full flex items-center gap-4 p-3 rounded-lg text-left ${isSelected ? 'text-white' : 'hover:bg-violet-50'}`}
                    style={isSelected ? { backgroundColor: accentColor } : undefined}
                  >
                    <Icon />
                    <span>{device.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
