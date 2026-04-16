import { Play, Pause, SkipForward, SkipBack, Loader2 } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useMockServer } from '../store/mockServer';
import { useEffect, useState } from 'react';
import { FullPlayer } from './FullPlayer';
import { CachedImage } from './CachedImage';
import { AnimatePresence } from 'motion/react';
import { getAverageColor } from '../lib/colorExtractor';
import { getImageFile } from '../lib/db';
import { useNavigate } from 'react-router-dom';
import { resolveArtistId } from '../lib/artistRouting';
import { toStringArray } from '../lib/safe';

export function MiniPlayer() {
  const navigate = useNavigate();
  const { currentTrackId, currentAlbumId, isPlaying, togglePlay, nextTrack, prevTrack, isLoading, currentTime, duration, seek } = usePlayerStore();
  const tracks = useMockServer(state => state.tracks);
  const albums = useMockServer(state => state.albums);
  const artists = useMockServer(state => state.artists);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [miniDragTime, setMiniDragTime] = useState<number | null>(null);
  const [isMiniDragging, setIsMiniDragging] = useState(false);
  const [miniTrackColor, setMiniTrackColor] = useState('#8b5cf6');
  const track = currentTrackId ? tracks[currentTrackId] : null;
  const album = currentAlbumId ? albums[currentAlbumId] : null;
  const isAlbumContext = Boolean(album);

  const miniProgress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const miniDisplayTime = isMiniDragging && miniDragTime !== null ? miniDragTime : currentTime;
  const miniDisplayProgress = duration > 0 ? (miniDisplayTime / duration) * 100 : 0;
  const miniThumbColor = miniTrackColor;
  const artistRefs = toStringArray(track?.artistIds);
  const artistNames = artistRefs.length > 0 ? artistRefs.join(', ') : 'Unknown artist';

  useEffect(() => {
    let objectUrl: string | undefined;
    if (track?.coverUrl) {
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
  }, [track?.coverUrl]);

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
  }, [currentTrackId, currentAlbumId, track?.id, currentTime, duration, isAlbumContext]);

  if (!track) {
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
          setIsFullPlayerOpen(true);
        }}
      >
        <div className="w-10 h-10 bg-violet-100 rounded-[2px] overflow-hidden flex-shrink-0">
          {(album?.coverUrl || track.coverUrl) ? (
            <CachedImage src={album?.coverUrl || track.coverUrl || ''} alt={album?.title || track.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">No Cover</div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-700 truncate">
            {isAlbumContext ? `${album?.title || ''} · ${track.title}` : track.title}
          </div>
          <div className="text-xs text-slate-400 truncate">
            {artistRefs.length > 0 ? (
              <>
                {artistRefs.map((artistRef, index) => {
                  const artistId = resolveArtistId(artistRef, artists);
                  const key = `${track.id}-mini-artist-${artistRef}-${index}`;
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
              artistNames
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 pr-2" onClick={e => e.stopPropagation()}>
          {isAlbumContext && (
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
      </div>

      <AnimatePresence mode="wait">
        {isFullPlayerOpen && (
          <FullPlayer key="fullplayer" onClose={() => setIsFullPlayerOpen(false)} track={track} />
        )}
      </AnimatePresence>
    </>
  );
}
