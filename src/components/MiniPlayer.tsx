import { Play, Pause, SkipForward, SkipBack, Loader2, Download } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useMockServer } from '../store/mockServer';
import { useEffect, useRef, useState } from 'react';
import { FullPlayer } from './FullPlayer';
import { CachedImage } from './CachedImage';
import { AnimatePresence } from 'motion/react';
import { getAverageColor } from '../lib/colorExtractor';
import { getImageFile, saveAudioFile, saveImageFile } from '../lib/db';
import { useNavigate, useLocation } from 'react-router-dom';
import { resolveArtistId } from '../lib/artistRouting';
import { toStringArray } from '../lib/safe';
import { useAuthStore } from '../store/authStore';
import { ensureArtistBannerFromTrackCover } from '../lib/artistBannerCache';
import { resolveArtistDescriptionRu } from '../lib/wikiDescriptions';

export function MiniPlayer() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentTrackId,
    currentAlbumId,
    currentPreviewKey,
    previewTitle,
    previewArtist,
    previewArtworkUrl,
    isPlaying,
    togglePlay,
    nextTrack,
    prevTrack,
    playTrack,
    isLoading,
    currentTime,
    duration,
    seek,
    repeatMode
  } = usePlayerStore();
  const tracks = useMockServer(state => state.tracks);
  const albums = useMockServer(state => state.albums);
  const artists = useMockServer(state => state.artists);
  const addTrack = useMockServer(state => state.addTrack);
  const addArtist = useMockServer(state => state.addArtist);
  const users = useMockServer(state => state.users);
  const updateUser = useMockServer(state => state.updateUser);
  const { currentUserId } = useAuthStore();
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [miniDragTime, setMiniDragTime] = useState<number | null>(null);
  const [isMiniDragging, setIsMiniDragging] = useState(false);
  const [miniTrackColor, setMiniTrackColor] = useState('#8b5cf6');
  const [isPreviewDownloading, setIsPreviewDownloading] = useState(false);
  const repeatModeSnapshotRef = useRef<'off' | 'all' | 'one' | null>(null);
  const track = currentTrackId ? tracks[currentTrackId] : null;
  const album = currentAlbumId ? albums[currentAlbumId] : null;
  const isAlbumContext = Boolean(album);
  const isPreviewContext = Boolean(!track && currentPreviewKey);

  const miniProgress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const miniDisplayTime = isMiniDragging && miniDragTime !== null ? miniDragTime : currentTime;
  const miniDisplayProgress = duration > 0 ? (miniDisplayTime / duration) * 100 : 0;
  const miniThumbColor = miniTrackColor;
  const artistRefs = toStringArray(track?.artistIds);
  const artistNames = isPreviewContext
    ? (previewArtist || 'Preview')
    : (artistRefs.length > 0 ? artistRefs.join(', ') : 'Unknown artist');

  useEffect(() => {
    if (!isPreviewContext) {
      if (repeatModeSnapshotRef.current) {
        usePlayerStore.setState({ repeatMode: repeatModeSnapshotRef.current });
        repeatModeSnapshotRef.current = null;
      }
      return;
    }
    if (!repeatModeSnapshotRef.current) {
      repeatModeSnapshotRef.current = repeatMode;
    }
    if (repeatMode !== 'one') {
      usePlayerStore.setState({ repeatMode: 'one' });
    }
  }, [isPreviewContext, repeatMode]);

  const getAudioDurationFromBlob = async (audioBlob: Blob): Promise<number> => {
    const objectUrl = URL.createObjectURL(audioBlob);
    try {
      return await new Promise<number>((resolve) => {
        const audio = document.createElement('audio');
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
        audio.onerror = () => resolve(0);
        audio.src = objectUrl;
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const downloadPreviewTrack = async () => {
    if (!isPreviewContext || !previewTitle || !previewArtist || isPreviewDownloading) return;
    setIsPreviewDownloading(true);
    try {
      const normalizedArtist = previewArtist.trim();
      const normalizedTitle = previewTitle
        .replace(new RegExp(`^${normalizedArtist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-–—:]\\s*`, 'i'), '')
        .replace(/\s+/g, ' ')
        .trim() || previewTitle.trim();
      const query = `${previewArtist} - ${previewTitle}`;
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          url: query,
          title: previewTitle,
          artist: previewArtist,
          artworkUrl: previewArtworkUrl || '',
        }),
      });
      if (!response.ok) throw new Error('Failed to download preview');
      const blob = await response.blob();
      const trackId = `mini-preview-${Date.now()}`;
      await saveAudioFile(trackId, blob);

      let coverId: string | undefined;
      if (previewArtworkUrl) {
        try {
          const coverResponse = await fetch(previewArtworkUrl);
          if (coverResponse.ok) {
            coverId = `cover-${trackId}`;
            await saveImageFile(coverId, await coverResponse.blob());
          }
        } catch {
          // Keep download flow working without artwork.
        }
      }

      const existingArtist = Object.values(artists).find(
        (artist) => artist.name.trim().toLowerCase() === normalizedArtist.toLowerCase()
      );
      let artistRef = normalizedArtist;
      if (existingArtist) {
        artistRef = existingArtist.id;
        await ensureArtistBannerFromTrackCover({
          artist: existingArtist,
          coverBlob: coverId ? await getImageFile(coverId) : null,
          coverUrl: previewArtworkUrl || undefined,
          updateArtist: useMockServer.getState().updateArtist,
        });
      } else {
        const wikiProfile = await resolveArtistDescriptionRu(normalizedArtist, {
          fallbackDescription: `${normalizedArtist} - imported from mini player preview.`,
        });
        artistRef = `artist-${Date.now()}-${normalizedArtist.toLowerCase().replace(/\s+/g, '-')}`;
        addArtist({
          id: artistRef,
          name: normalizedArtist,
          description: wikiProfile.description,
          ownerId: currentUserId || undefined,
        });
        await ensureArtistBannerFromTrackCover({
          artist: {
            id: artistRef,
            name: normalizedArtist,
            description: wikiProfile.description,
            ownerId: currentUserId || undefined,
          },
          coverBlob: coverId ? await getImageFile(coverId) : null,
          coverUrl: previewArtworkUrl || undefined,
          updateArtist: useMockServer.getState().updateArtist,
        });
      }

      addTrack({
        id: trackId,
        title: normalizedTitle,
        artistIds: [normalizedArtist],
        duration: await getAudioDurationFromBlob(blob),
        isExplicit: false,
        isSingle: true,
        format: 'mp3',
        coverUrl: coverId,
        ownerId: currentUserId || 'system',
      });

      const user = currentUserId ? users[currentUserId] : null;
      if (user) {
               const nextFavorites = user.favoriteTrackIds.includes(trackId)
          ? user.favoriteTrackIds
          : [trackId, ...user.favoriteTrackIds];
        updateUser(user.id, { favoriteTrackIds: nextFavorites });
      }
      playTrack(trackId, [trackId], null);
    } finally {
      setIsPreviewDownloading(false);
    }
  };

  useEffect(() => {
    let objectUrl: string | undefined;
    const colorSource = track?.coverUrl || previewArtworkUrl;
    if (colorSource) {
      const colorSourcePromise = colorSource.startsWith('http')
        ? getAverageColor(colorSource)
        : getImageFile(colorSource).then(blob => {
            if (blob) {
              objectUrl = URL.createObjectURL(blob);
              return getAverageColor(objectUrl);
            }
            return Promise.reject('No blob');
          });

      colorSourcePromise
        .then(color => setMiniTrackColor(color))
        .catch(() => setMiniTrackColor('#8b5cf6'))
        .finally(() => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        });
    } else {
      setMiniTrackColor('#8b5cf6');
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [track?.coverUrl, previewArtworkUrl]);

  const commitMiniSeek = () => {
    if (miniDragTime !== null) {
      seek(miniDragTime);
      setMiniDragTime(null);
    }
    setIsMiniDragging(false);
  };

  useEffect(() => {
  }, [track?.id, currentTime, duration, miniProgress, miniDisplayProgress, miniThumbColor]);

  useEffect(() => {
  }, [isFullPlayerOpen, track?.id]);

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf06a6'},body:JSON.stringify({sessionId:'bf06a6',runId:'run3',hypothesisId:'H10',location:'src/components/MiniPlayer.tsx:240',message:'mini route snapshot',data:{path:`${location.pathname}${location.search}`,isFullPlayerOpen,trackId:track?.id||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [location.pathname, location.search, isFullPlayerOpen, track?.id]);

  useEffect(() => {
  }, [currentTrackId, currentAlbumId, track?.id, currentTime, duration, isAlbumContext]);

  if (!track && !isPreviewContext) {
    return null;
  }

  return (
    <>
      <div
        className="bg-white/85 backdrop-blur-md p-2 mx-2 mb-2 rounded-xl flex items-center gap-3 cursor-pointer shadow-lg shadow-violet-100/70 relative overflow-hidden"
        onClick={(e) => {
          if (e.target instanceof HTMLInputElement) return;
          if (isAlbumContext && album?.id) {
            navigate(`/album/${album.id}`);
            return;
          }
          if (isPreviewContext) return;
          // #region agent log
          fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf06a6'},body:JSON.stringify({sessionId:'bf06a6',runId:'run1',hypothesisId:'H3',location:'src/components/MiniPlayer.tsx:258',message:'opening fullplayer from mini',data:{fromPath:`${location.pathname}${location.search}`,trackId:track?.id||null,isAlbumContext,isPreviewContext},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          setIsFullPlayerOpen(true);
        }}
      >
        <div className="w-10 h-10 bg-violet-100 rounded-[2px] overflow-hidden flex-shrink-0">
          {(album?.coverUrl || track?.coverUrl || previewArtworkUrl) ? (
            <CachedImage src={album?.coverUrl || track?.coverUrl || previewArtworkUrl || ''} alt={album?.title || track?.title || previewTitle || 'Preview'} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">No Cover</div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-700 truncate">
            {isPreviewContext
              ? (previewTitle || 'Preview')
              : (isAlbumContext ? `${album?.title || ''} · ${track?.title || ''}` : track?.title)}
          </div>
          <div className="text-xs text-slate-400 truncate">
            {!isPreviewContext && artistRefs.length > 0 ? (
              <>
                {artistRefs.map((artistRef, index) => {
                  const artistId = resolveArtistId(artistRef, artists);
                  const key = `${track?.id || 'preview'}-mini-artist-${artistRef}-${index}`;
                  if (!artistId) {
                    return <span key={key}>{index > 0 ? `, ${artistRef}` : artistRef}</span>;
                  }
                  return (
                    <span key={key}>
                      {index > 0 && ', '}
                      <button
                        className="hover:text-violet-500 transition-colors underline-offset-2 hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/artist/${artistId}`);
                        }}
                      >
                        {artistRef}
                      </button>
                    </span>
                  );
                })}
              </>
            ) : (
              isPreviewContext ? (
                <button
                  className="hover:text-violet-500 transition-colors underline-offset-2 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/artist/itunes-${encodeURIComponent(previewArtist || '')}?source=itunes&name=${encodeURIComponent(previewArtist || '')}`);
                  }}
                >
                  {artistNames}
                </button>
              ) : artistNames
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 pr-2" onClick={e => e.stopPropagation()}>
          {isPreviewContext && (
            <button
              onClick={() => void downloadPreviewTrack()}
              className="p-2 text-slate-600 hover:text-violet-500"
              disabled={isPreviewDownloading}
              aria-label="Download preview"
            >
              {isPreviewDownloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            </button>
          )}
          {isAlbumContext && !isPreviewContext && (
            <button onClick={prevTrack} className="p-2 text-slate-600 hover:text-violet-500">
              <SkipBack className="w-5 h-5 fill-current" />
            </button>
          )}
          <button onClick={togglePlay} className="p-2 text-slate-600 hover:text-violet-500" disabled={isLoading}>
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />)}
          </button>
          <button onClick={nextTrack} className="p-2 text-slate-600 hover:text-violet-500">
            <SkipForward className="w-5 h-5 fill-current" />
          </button>
        </div>
        {!isPreviewContext && (
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={miniDisplayTime}
            onPointerDown={(e) => {
              e.stopPropagation();
              setIsMiniDragging(true);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              commitMiniSeek();
            }}
            onPointerCancel={() => commitMiniSeek()}
            onBlur={() => commitMiniSeek()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const next = Number(e.target.value);
              setMiniDragTime(next);
            }}
            className="absolute left-0 right-0 bottom-0 h-1.5 bg-slate-200 appearance-none cursor-pointer dynamic-thumb [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full"
            style={{
              background: `linear-gradient(to right, ${miniTrackColor} ${miniDisplayProgress}%, rgb(203 213 225) ${miniDisplayProgress}%)`,
              ['--thumb-color' as string]: miniThumbColor,
              accentColor: miniThumbColor
            }}
          />
        )}
      </div>

      <AnimatePresence mode="wait">
        {isFullPlayerOpen && track && (
          <FullPlayer onClose={() => {
            // #region agent log
            fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf06a6'},body:JSON.stringify({sessionId:'bf06a6',runId:'run1',hypothesisId:'H4',location:'src/components/MiniPlayer.tsx:372',message:'fullplayer onClose invoked',data:{currentPath:`${location.pathname}${location.search}`,trackId:track.id},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            setIsFullPlayerOpen(false);
          }} track={track} />
        )}
      </AnimatePresence>
    </>
  );
}
