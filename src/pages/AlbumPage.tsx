import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMockServer } from '../store/mockServer';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { Edit2, ArrowLeft, Play, Music, Upload, Search, Plus, Heart, MoreHorizontal } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { getAudioFile, saveImageFile } from '../lib/db';
import { CachedImage } from '../components/CachedImage';
import { TrackListItem } from '../components/TrackListItem';
import { resolveArtistId } from '../lib/artistRouting';

export function AlbumPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const typeParam = searchParams.get('type') as 'playlist' | 'album' | null;
  
  const { playlists, albums, tracks, artists, addPlaylist, updatePlaylist, addAlbum, updateAlbum, addArtist, updateTrack, users, updateUser } = useMockServer();
  const { playTrack, togglePlay, currentTrackId, isPlaying } = usePlayerStore();
  const { currentUserId } = useAuthStore();
  
  const isNew = id === 'new';
  const playlistItem = isNew ? null : playlists[id || ''];
  const albumItem = isNew ? null : albums[id || ''];
  const item = albumItem || playlistItem;
  const isAlbum = isNew ? typeParam === 'album' : Boolean(albumItem);
  
  const currentUser = currentUserId ? users[currentUserId] : null;
  const isFavorite = isAlbum
    ? (currentUser?.favoriteAlbumIds?.includes(item?.id || '') || false)
    : (currentUser?.favoritePlaylistIds?.includes(item?.id || '') || false);

  const toggleFavorite = () => {
    if (!currentUser || !item) return;
    if (isAlbum) {
      const currentFavorites = currentUser.favoriteAlbumIds || [];
      const newFavorites = isFavorite
        ? currentFavorites.filter(fid => fid !== item.id)
        : [...currentFavorites, item.id];
      updateUser(currentUser.id, { favoriteAlbumIds: newFavorites });
      return;
    }
    const currentFavorites = currentUser.favoritePlaylistIds || [];
    const newFavorites = isFavorite
      ? currentFavorites.filter(fid => fid !== item.id)
      : [...currentFavorites, item.id];
    updateUser(currentUser.id, { favoritePlaylistIds: newFavorites });
  };
  
  const [isEditing, setIsEditing] = useState(isNew);
  const [title, setTitle] = useState(item?.title || '');
  const [status, setStatus] = useState(item?.status || '');
  const [description, setDescription] = useState(isAlbum && item && 'description' in item ? item.description || '' : '');
  
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(item?.coverUrl || null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [artistName, setArtistName] = useState('');
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);
  const artistInputRef = useRef<HTMLDivElement>(null);
  const [resolvedDurations, setResolvedDurations] = useState<Record<string, number>>({});

  useEffect(() => {
    const currentArtistId = isAlbum && item ? (item.artistIds?.[0] as string | undefined) : undefined;
    if (currentArtistId && artists[currentArtistId]) {
      setArtistName(artists[currentArtistId].name);
    }
  }, [item, isAlbum, artists]);

  useEffect(() => {
  }, [id, isNew, isAlbum]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      // #region agent log
      fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'78e223'},body:JSON.stringify({sessionId:'78e223',runId:'album-click-debug',hypothesisId:'H4',location:'pages/AlbumPage.tsx:global-error',message:'Window error captured',data:{message:event.message,filename:event.filename,lineno:event.lineno,colno:event.colno},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      // #region agent log
      fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'78e223'},body:JSON.stringify({sessionId:'78e223',runId:'album-click-debug',hypothesisId:'H4',location:'pages/AlbumPage.tsx:unhandled-rejection',message:'Unhandled rejection captured',data:{reason:String(event.reason)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  const allArtists = Object.values(artists);
  const filteredArtists = allArtists.filter(a => 
    a.name.toLowerCase().includes(artistName.toLowerCase())
  );

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!currentUserId) return;

    let coverId = item?.coverUrl || '';
    if (coverFile) {
      coverId = uuidv4();
      await saveImageFile(coverId, coverFile);
    }

    let finalArtistId = isAlbum ? item?.artistIds?.[0] : undefined;
    if (isAlbum && artistName) {
      const existingArtist = allArtists.find(a => a.name.toLowerCase() === artistName.toLowerCase());
      if (existingArtist) {
        finalArtistId = existingArtist.id;
      } else {
        const newArtistId = uuidv4();
        addArtist({
          id: newArtistId,
          name: artistName,
          description: '',
          ownerId: currentUserId
        });
        if (currentUser) {
          const favoriteArtistIds = currentUser.favoriteArtistIds || [];
          if (!favoriteArtistIds.includes(newArtistId)) {
            updateUser(currentUser.id, { favoriteArtistIds: [...favoriteArtistIds, newArtistId] });
          }
        }
        finalArtistId = newArtistId;
      }
    }

    if (isNew) {
      const newId = uuidv4();
      if (isAlbum) {
        addAlbum({
          id: newId,
          title,
          coverUrl: coverId || undefined,
          description: description.trim() || undefined,
          status,
          ownerId: currentUserId,
          trackIds: [],
          type: 'album',
          artistIds: finalArtistId ? [finalArtistId] : []
        });
      } else {
        addPlaylist({
          id: newId,
          title,
          coverUrl: coverId || undefined,
          status,
          ownerId: currentUserId,
          trackIds: [],
          type: 'playlist'
        });
      }
      if (currentUser) {
        if (isAlbum) {
          const favoriteAlbumIds = currentUser.favoriteAlbumIds || [];
          if (!favoriteAlbumIds.includes(newId)) {
            updateUser(currentUser.id, { favoriteAlbumIds: [...favoriteAlbumIds, newId] });
          }
        } else {
          const favoritePlaylistIds = currentUser.favoritePlaylistIds || [];
          if (!favoritePlaylistIds.includes(newId)) {
            updateUser(currentUser.id, { favoritePlaylistIds: [...favoritePlaylistIds, newId] });
          }
        }
      }
      navigate(`/playlist/${newId}`, { replace: true });
    } else if (item) {
      if (isAlbum) {
        updateAlbum(item.id, {
          title,
          coverUrl: coverId || undefined,
          description: description.trim() || undefined,
          status,
          artistIds: finalArtistId ? [finalArtistId] : []
        });
      } else {
        updatePlaylist(item.id, {
          title,
          coverUrl: coverId || undefined,
          status
        });
      }
    }
    setIsEditing(false);
  };

  const itemTracks = isNew
    ? []
    : Object.values(tracks).filter(t => item?.trackIds.includes(t.id) || (isAlbum && t.albumId === item?.id));
  const isAlbumQueueActive = Boolean(currentTrackId && itemTracks.some((track) => track.id === currentTrackId));
  const albumDescription = isAlbum && item && 'description' in item ? (item.description || '').trim() : '';
  useEffect(() => {
    let cancelled = false;

    const loadMissingDurations = async () => {
      try {
        const missingTracks = itemTracks.filter((track) => {
          const hasTrackDuration = typeof (track as { duration?: number }).duration === 'number' && (track as { duration?: number }).duration! > 0;
          const hasResolvedDuration = typeof resolvedDurations[track.id] === 'number' && resolvedDurations[track.id] > 0;
          return !hasTrackDuration && !hasResolvedDuration;
        });
        if (missingTracks.length === 0) return;

        const updates: Record<string, number> = {};
        await Promise.all(
          missingTracks.map(async (track) => {
            try {
              const blob = await getAudioFile(track.id);
              if (!blob) return;
              const objectUrl = URL.createObjectURL(blob);
              try {
                const duration = await new Promise<number>((resolve) => {
                  const audio = document.createElement('audio');
                  audio.preload = 'metadata';
                  audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
                  audio.onerror = () => resolve(0);
                  audio.src = objectUrl;
                });
                if (duration > 0) updates[track.id] = duration;
              } finally {
                URL.revokeObjectURL(objectUrl);
              }
            } catch {
              // Keep UI stable even if metadata extraction fails.
            }
          })
        );

        if (!cancelled && Object.keys(updates).length > 0) {
          setResolvedDurations((prev) => ({ ...prev, ...updates }));
          Object.entries(updates).forEach(([trackId, duration]) => {
            updateTrack(trackId, { duration });
          });
        }
      } catch {
        // Defensive guard against runtime crash.
      }
    };

    loadMissingDurations();
    return () => {
      cancelled = true;
    };
  }, [itemTracks, resolvedDurations, updateTrack]);
  const totalDurationSec = itemTracks.reduce((sum, track) => {
    const duration = (track as { duration?: number }).duration ?? resolvedDurations[track.id];
    return sum + (typeof duration === 'number' && duration > 0 ? duration : 0);
  }, 0);
  const formatTotalDuration = (seconds: number) => {
    if (seconds <= 0) return '--:--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  const handleAlbumPlayToggle = () => {
    if (isAlbumQueueActive) {
      togglePlay();
      return;
    }
    if (itemTracks.length > 0) {
      playTrack(itemTracks[0].id, itemTracks.map(t => t.id), isAlbum ? item.id : null);
    }
  };

  if (!isNew && !item) {
    return <div className="p-4 pt-8">Не найдено</div>;
  }

  return (
    <div className="pb-10 h-full overflow-y-auto scrollbar-hide">
      <div
        className="relative pt-12 pb-8 px-4 text-white overflow-hidden"
        style={{
          background: 'linear-gradient(to bottom, var(--accent-color) 0%, var(--accent-color) 52%, rgb(2 6 23) 100%)'
        }}
      >
        <div className="absolute -top-16 -right-12 w-48 h-48 rounded-full bg-violet-300/25 blur-2xl pointer-events-none" />
        <div className="absolute top-28 -left-10 w-40 h-40 rounded-full bg-sky-300/25 blur-2xl pointer-events-none" />
        <div
          className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0))' }}
        />
        <button 
          onClick={() => navigate(-1)}
          className="absolute top-safe left-4 p-2 bg-black/35 rounded-full text-white backdrop-blur-md z-20 mt-4"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        <div className="mt-10 flex gap-4 items-end z-10">
          <div className="w-40 h-40 sm:w-44 sm:h-44 bg-violet-100 rounded-md shadow-2xl shadow-black/40 overflow-hidden relative flex-shrink-0">
          {isEditing ? (
            <div 
              className="absolute inset-0 flex flex-col items-center justify-center bg-violet-500/45 z-10 p-4 cursor-pointer hover:bg-violet-500/55 transition-colors"
              onClick={() => coverInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={coverInputRef} 
                onChange={handleCoverChange} 
                accept="image/*" 
                className="hidden" 
              />
              <Upload className="w-8 h-8 text-white mb-2" />
              <span className="text-xs text-white font-medium text-center">Изменить обложку</span>
            </div>
          ) : null}
          {coverPreview ? (
            <CachedImage src={coverPreview} alt={title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-16 h-16 text-slate-400" />
            </div>
          )}
          </div>
          {!isEditing && (
            <div className="min-w-0 pb-1">
              <div className="text-xs uppercase tracking-wider text-white/80 mb-1">{item?.status || (isAlbum ? 'Альбом' : 'Плейлист')}</div>
              <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight truncate">
                {isAlbum && item?.artistIds?.[0] && artists[item.artistIds[0]] ? (
                  <button
                    onClick={() => navigate(`/artist/${item.artistIds[0]}`)}
                    className="hover:underline underline-offset-4"
                  >
                    {artists[item.artistIds[0]].name}
                  </button>
                ) : null}
                {isAlbum && item?.artistIds?.[0] && artists[item.artistIds[0]] ? ' - ' : ''}
                {item?.title}
              </h1>
              <div className="text-sm text-white/80 mt-2">
                {itemTracks.length} треков · {formatTotalDuration(totalDurationSec)}
              </div>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="w-full max-w-sm space-y-3 mt-4">
            <input 
              type="text" 
              value={title} 
              onChange={e => setTitle(e.target.value)}
              placeholder="Название"
              className="bg-white/90 text-2xl font-bold text-slate-700 px-4 py-2 rounded-xl border border-violet-100 w-full text-center"
              autoFocus
            />
            {isAlbum && (
              <div className="relative" ref={artistInputRef}>
                <input
                  type="text"
                  value={artistName}
                  onChange={e => {
                    setArtistName(e.target.value);
                    setShowArtistDropdown(true);
                  }}
                  onFocus={() => setShowArtistDropdown(true)}
                  placeholder="Имя артиста"
                  className="bg-white/90 text-slate-700 px-4 py-2 rounded-xl border border-violet-100 w-full text-center text-sm"
                  autoComplete="off"
                />
                {showArtistDropdown && artistName && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-violet-100 rounded-xl shadow-xl max-h-48 overflow-y-auto text-left">
                    {filteredArtists.map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setArtistName(a.name);
                          setShowArtistDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-violet-50 text-sm flex items-center gap-2"
                      >
                        <Search className="w-4 h-4 text-slate-400" />
                        {a.name}
                      </button>
                    ))}
                    {!filteredArtists.find(a => a.name.toLowerCase() === artistName.toLowerCase()) && (
                      <button
                        type="button"
                        onClick={() => setShowArtistDropdown(false)}
                        className="w-full text-left px-4 py-2 hover:bg-violet-50 text-sm text-violet-500 flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Создать артиста: <span className="font-bold text-slate-700">{artistName}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            <input 
              type="text" 
              value={status} 
              onChange={e => setStatus(e.target.value)}
              placeholder="Статус (EP, Mixtape...)"
              className="bg-white/90 text-slate-400 px-4 py-2 rounded-xl border border-violet-100 w-full text-center text-sm"
            />
            {isAlbum && (
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Описание альбома"
                rows={4}
                className="bg-white/90 text-slate-600 px-4 py-3 rounded-xl border border-violet-100 w-full text-sm resize-none"
              />
            )}
            <button 
              onClick={handleSave}
              className="w-full bg-violet-500 text-white font-bold py-3 rounded-xl hover:bg-violet-600 transition-colors mt-4"
            >
              Сохранить
            </button>
          </div>
        ) : (
          <div className="w-full mt-5 z-10">
            <div className="flex items-center gap-3">
              {!isNew && (
                <button
                  onClick={handleAlbumPlayToggle}
                  className="h-14 w-14 rounded-full flex items-center justify-center text-black shadow-lg shadow-black/35 hover:scale-[1.02] transition-transform"
                  style={{ backgroundColor: 'var(--accent-color)' }}
                >
                  {isAlbumQueueActive && isPlaying ? (
                    <div className="w-6 h-6 flex items-center justify-center">
                      <span className="w-1.5 h-5 bg-white rounded-sm" />
                      <span className="w-1.5 h-5 bg-white rounded-sm ml-1.5" />
                    </div>
                  ) : (
                    <Play className="w-6 h-6 fill-current ml-0.5 text-white" />
                  )}
                </button>
              )}
              <button
                onClick={toggleFavorite}
                className="h-11 w-11 rounded-full bg-white/15 border border-white/20 text-white hover:bg-white/25 transition-colors"
                style={isFavorite ? { color: '#fda4af', backgroundColor: 'rgba(255,255,255,0.2)' } : undefined}
              >
                <Heart className={`w-5 h-5 mx-auto ${isFavorite ? 'fill-current' : ''}`} />
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="h-11 w-11 rounded-full bg-white/15 border border-white/20 text-white hover:bg-white/25 transition-colors"
              >
                <Edit2 className="w-5 h-5 mx-auto" />
              </button>
              <button className="h-11 w-11 rounded-full bg-white/15 border border-white/20 text-white hover:bg-white/25 transition-colors">
                <MoreHorizontal className="w-5 h-5 mx-auto" />
              </button>
            </div>
            {albumDescription && (
              <div className="text-white/75 text-sm mt-4 leading-relaxed max-w-xl">
                {albumDescription}
              </div>
            )}
          </div>
        )}
      </div>

      {!isNew && !isEditing && (
        <div className="px-4 mt-3">
          <div className="space-y-1">
            {itemTracks.map((track, index) => (
              <div key={track.id} className="flex items-center gap-2">
                <div className="w-6 text-center text-slate-400 text-sm">{index + 1}</div>
                <div className="flex-1">
                  <TrackListItem
                    track={track}
                    user={currentUser}
                    isPlaying={isPlaying}
                    isActive={currentTrackId === track.id}
                    searchQuery=""
                    onPlay={() => {
                      // #region agent log
                      fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'78e223'},body:JSON.stringify({sessionId:'78e223',runId:'album-click-debug',hypothesisId:'H1',location:'pages/AlbumPage.tsx:track-onPlay:before',message:'Track row clicked in album',data:{albumId:item?.id ?? null,trackId:track.id,queueLength:itemTracks.length,isAlbum,currentTrackIdBefore:currentTrackId,isPlayingBefore:isPlaying},timestamp:Date.now()})}).catch(()=>{});
                      // #endregion
                      playTrack(track.id, itemTracks.map(t => t.id), isAlbum ? item?.id || null : null);
                      // #region agent log
                      fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'78e223'},body:JSON.stringify({sessionId:'78e223',runId:'album-click-debug',hypothesisId:'H1',location:'pages/AlbumPage.tsx:track-onPlay:after',message:'playTrack dispatched from album row',data:{albumId:item?.id ?? null,trackId:track.id},timestamp:Date.now()})}).catch(()=>{});
                      // #endregion
                    }}
                    onArtistClick={(artistRef) => {
                      const artistId = resolveArtistId(artistRef, artists) || resolveArtistId(artistName, artists);
                      if (artistId) navigate(`/artist/${artistId}`);
                    }}
                    onToggleFavorite={() => {
                      if (!currentUser) return;
                      const favoriteTrackIds = currentUser.favoriteTrackIds || [];
                      const nextFavorites = favoriteTrackIds.includes(track.id)
                        ? favoriteTrackIds.filter((id) => id !== track.id)
                        : [...favoriteTrackIds, track.id];
                      updateUser(currentUser.id, { favoriteTrackIds: nextFavorites });
                    }}
                    onAddToPlaylist={() => {}}
                    onAddToAlbum={() => {}}
                    onEdit={() => {}}
                    showMenu={false}
                  />
                </div>
              </div>
            ))}
            
            {itemTracks.length === 0 && (
              <div className="text-center text-slate-400 py-10">
                Нет треков
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
