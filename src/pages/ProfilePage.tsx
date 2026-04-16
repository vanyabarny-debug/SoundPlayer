import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useMockServer } from '../store/mockServer';
import { usePlayerStore } from '../store/playerStore';
import { useNavigate } from 'react-router-dom';
import { LogOut, Edit2, Plus, Heart, X } from 'lucide-react';
import { ArtistCard } from '../components/ArtistCard';
import { CollectionCard } from '../components/CollectionCard';

export function ProfilePage() {
  const { currentUserId, logout } = useAuthStore();
  const { users, updateUser, tracks, playlists, albums, artists } = useMockServer();
  const navigate = useNavigate();
  
  const user = currentUserId ? users[currentUserId] : null;
  
  const [isEditing, setIsEditing] = useState(false);
  const [hoveredArtistIndex, setHoveredArtistIndex] = useState<number | null>(null);
  const [hoveredCollectionIndex, setHoveredCollectionIndex] = useState<number | null>(null);
  const [isCreateChooserOpen, setIsCreateChooserOpen] = useState(false);
  const [artistsScrollLeft, setArtistsScrollLeft] = useState(0);
  const [collectionsScrollLeft, setCollectionsScrollLeft] = useState(0);
  const artistHoverTimerRef = useRef<number | null>(null);
  const collectionHoverTimerRef = useRef<number | null>(null);
  const createChooserRef = useRef<HTMLDivElement>(null);
  const [emoji, setEmoji] = useState(user?.avatarEmoji || '🎵');
  const [gradient, setGradient] = useState(user?.avatarGradient || 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)');

  if (!user) return null;

  const handleSave = () => {
    updateUser(user.id, { avatarEmoji: emoji, avatarGradient: gradient });
    setIsEditing(false);
  };

  const gradients = [
    'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
    'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)',
    'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  ];

  const allTracks = Object.values(tracks);
  const allArtists = Object.values(artists);
  const allAlbums = Object.values(albums);
  const allPlaylists = Object.values(playlists);
  const getCollapsedRingStyle = (index: number) => {
    const ringPhase = ((index % 7) + 7) % 7;
    const scaleMap = [0.9, 0.96, 1.02, 1.08, 1.02, 0.96, 0.9];
    const rotateMap = [-13, -8, -4, 0, 4, 8, 13];
    const shadowMap = [
      '0 12px 20px rgba(15,23,42,0.10)',
      '0 14px 24px rgba(15,23,42,0.12)',
      '0 16px 28px rgba(15,23,42,0.14)',
      '0 24px 40px rgba(15,23,42,0.20)',
      '0 16px 28px rgba(15,23,42,0.14)',
      '0 14px 24px rgba(15,23,42,0.12)',
      '0 12px 20px rgba(15,23,42,0.10)',
    ];
    return {
      scale: scaleMap[ringPhase],
      rotate: rotateMap[ringPhase],
      shadow: shadowMap[ringPhase],
      zIndex: ringPhase === 3 ? 30 : 20 - Math.abs(3 - ringPhase),
    };
  };
  const getInteractiveRingStyle = (
    index: number,
    hoveredIndex: number | null,
    scrollLeft: number
  ): { transform: string; zIndex: number; boxShadow: string } => {
    const base = getCollapsedRingStyle(index);
    const baseZIndex = base.zIndex;
    const depthStrength = (base.scale - 0.9) / (1.08 - 0.9);
    const parallaxX = (scrollLeft * (0.03 + depthStrength * 0.09)) % 18;

    if (hoveredIndex === null) {
      return {
        transform: `translateX(${parallaxX}px) rotate(${base.rotate}deg) scale(${base.scale})`,
        zIndex: baseZIndex,
        boxShadow: base.shadow,
      };
    }

    const distance = Math.abs(index - hoveredIndex);
    if (distance === 0) {
      return {
        // Hovered card pops forward and aligns straight.
        transform: `translateX(${parallaxX + 2}px) rotate(0deg) scale(1.13) translateY(-4px)`,
        zIndex: 999,
        boxShadow: '0 26px 42px rgba(15,23,42,0.24)',
      };
    }

    if (distance === 1) {
      const side = index < hoveredIndex ? -1 : 1;
      return {
        transform: `translateX(${parallaxX}px) rotate(${base.rotate + side * 6}deg) scale(${base.scale * 1.05}) translateY(1px)`,
        zIndex: baseZIndex,
        boxShadow: '0 16px 30px rgba(15,23,42,0.16)',
      };
    }

    if (distance === 2) {
      const side = index < hoveredIndex ? -1 : 1;
      return {
        transform: `translateX(${parallaxX}px) rotate(${base.rotate + side * 3}deg) scale(${base.scale * 1.02})`,
        zIndex: baseZIndex,
        boxShadow: '0 12px 22px rgba(15,23,42,0.12)',
      };
    }

    return {
      transform: `translateX(${parallaxX}px) rotate(${base.rotate}deg) scale(${Math.max(base.scale - 0.02, 0.84)})`,
      zIndex: baseZIndex,
      boxShadow: '0 10px 18px rgba(15,23,42,0.09)',
    };
  };
  const allArtistsWithTracks = allArtists.filter((artist) =>
    allTracks.some((track) => {
      const refs = [...(track.artistIds || []), ...(track.features || [])].map((value) => String(value).trim().toLowerCase());
      return refs.includes(artist.id.trim().toLowerCase()) || refs.includes(artist.name.trim().toLowerCase());
    })
  );
  const likedTracks = (user.favoriteTrackIds || [])
    .map((trackId) => tracks[trackId])
    .filter(Boolean);
  const dislikedArtistNames = user.dislikedArtistNames || [];
  const removeLikedTrack = (trackId: string) => {
    const favoriteTrackIds = user.favoriteTrackIds || [];
    updateUser(user.id, { favoriteTrackIds: favoriteTrackIds.filter((id) => id !== trackId) });
  };
  const removeDislikedArtist = (artistName: string) => {
    updateUser(user.id, {
      dislikedArtistNames: dislikedArtistNames.filter((name) => name !== artistName),
    });
  };

  useEffect(() => {
  }, [user.id, isEditing]);

  useEffect(() => {
    return () => {
      if (artistHoverTimerRef.current) window.clearTimeout(artistHoverTimerRef.current);
      if (collectionHoverTimerRef.current) window.clearTimeout(collectionHoverTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!isCreateChooserOpen) return;
      if (!createChooserRef.current) return;
      if (createChooserRef.current.contains(event.target as Node)) return;
      setIsCreateChooserOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsCreateChooserOpen(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isCreateChooserOpen]);

  const setArtistHoverWithDelay = (index: number | null) => {
    if (artistHoverTimerRef.current) {
      window.clearTimeout(artistHoverTimerRef.current);
      artistHoverTimerRef.current = null;
    }
    const delay = index === null ? 140 : 180;
    artistHoverTimerRef.current = window.setTimeout(() => {
      setHoveredArtistIndex(index);
      artistHoverTimerRef.current = null;
    }, delay);
  };

  const setCollectionHoverWithDelay = (index: number | null) => {
    if (collectionHoverTimerRef.current) {
      window.clearTimeout(collectionHoverTimerRef.current);
      collectionHoverTimerRef.current = null;
    }
    const delay = index === null ? 140 : 180;
    collectionHoverTimerRef.current = window.setTimeout(() => {
      setHoveredCollectionIndex(index);
      collectionHoverTimerRef.current = null;
    }, delay);
  };

  return (
    <div className="p-4 pt-8 h-full overflow-y-auto scrollbar-hide">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Профиль</h1>
        <button onClick={logout} className="p-2 text-slate-400 hover:text-violet-500">
          <LogOut className="w-6 h-6" />
        </button>
      </div>

      <div className="flex flex-col items-center mb-8">
        <div 
          className="w-32 h-32 rounded-full flex items-center justify-center text-5xl mb-4 relative group"
          style={{ background: isEditing ? gradient : user.avatarGradient }}
        >
          {isEditing ? emoji : user.avatarEmoji}
          
          {!isEditing && (
            <button 
              onClick={() => setIsEditing(true)}
              className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full flex items-center justify-center border-2 border-violet-100 text-violet-500"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
        </div>
        
        <h2 className="text-2xl font-bold">{user.username}</h2>
      </div>

      {isEditing && (
        <div className="bg-white/80 border border-violet-100 p-6 rounded-3xl mb-8">
          <h3 className="text-lg font-bold mb-4">Редактировать аватар</h3>
          
          <div className="mb-4">
            <label className="block text-sm text-slate-400 mb-2">Эмодзи</label>
            <input 
              type="text" 
              value={emoji} 
              onChange={e => setEmoji(e.target.value)}
              maxLength={2}
              className="w-full bg-violet-50 text-slate-700 px-4 py-3 rounded-xl text-center text-2xl border border-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm text-slate-400 mb-2">Фон</label>
            <div className="grid grid-cols-3 gap-3">
              {gradients.map(g => (
                <button
                  key={g}
                  onClick={() => setGradient(g)}
                  className={`h-12 rounded-xl border-2 ${gradient === g ? 'border-violet-500' : 'border-transparent'}`}
                  style={{ background: g }}
                />
              ))}
            </div>
          </div>

          <button 
            onClick={handleSave}
            className="w-full bg-violet-500 text-white font-bold py-3 rounded-xl hover:bg-violet-600 transition-colors"
          >
            Сохранить
          </button>
        </div>
      )}

      <div>
        <div className="mb-8 overflow-visible">
          <h3 className="text-xl font-bold mb-4">Артисты</h3>
          {allArtistsWithTracks.length > 0 && (
            <div
              className="-mx-6 px-6 py-10 overflow-x-auto overflow-y-visible"
              onScroll={(e) => setArtistsScrollLeft(e.currentTarget.scrollLeft)}
            >
              <div className="flex items-center overflow-visible min-h-[220px]">
              {allArtistsWithTracks.map((artist, index) => {
                const ringStyle = getInteractiveRingStyle(index, hoveredArtistIndex, artistsScrollLeft);
                return (
                <div
                  key={`collapsed-artist-${artist.id}`}
                  className="w-28 sm:w-32 shrink-0 transition-[transform,box-shadow,filter] duration-500 ease-out will-change-transform"
                  style={{
                    marginLeft: index === 0 ? '0px' : '-20px',
                    transform: ringStyle.transform,
                    zIndex: ringStyle.zIndex,
                    boxShadow: ringStyle.boxShadow,
                  }}
                  onMouseEnter={() => setArtistHoverWithDelay(index)}
                  onMouseLeave={() => setArtistHoverWithDelay(null)}
                >
                  <ArtistCard
                    artist={{ ...artist, name: artist.name }}
                    hideSubtitle
                    onClick={() => navigate(`/artist/${artist.id}`)}
                    isFavorite={Boolean(user.favoriteArtistIds?.includes(artist.id))}
                    onToggleFavorite={(e) => {
                      e.stopPropagation();
                      const currentFavorites = user.favoriteArtistIds || [];
                      const isFavorite = currentFavorites.includes(artist.id);
                      const newFavorites = isFavorite
                        ? currentFavorites.filter((id) => id !== artist.id)
                        : [...currentFavorites, artist.id];
                      updateUser(user.id, { favoriteArtistIds: newFavorites });
                    }}
                  />
                </div>
                );
              })}
              </div>
            </div>
          )}
          {allArtistsWithTracks.length === 0 && (
            <div className="text-center text-zinc-500 py-8">Нет артистов.</div>
          )}
        </div>

        <div className="overflow-visible">
          <div className="flex items-center justify-between mb-4 relative" ref={createChooserRef}>
            <h3 className="text-xl font-bold">Плейлисты и альбомы</h3>
            <button
              type="button"
              onClick={() => setIsCreateChooserOpen((prev) => !prev)}
              className="h-9 w-9 rounded-full bg-white/85 border border-violet-100 text-violet-600 hover:bg-white transition-colors flex items-center justify-center"
              aria-label="Создать плейлист или альбом"
            >
              <Plus className="w-5 h-5" />
            </button>
            {isCreateChooserOpen && (
              <div className="absolute right-0 top-11 z-50 w-56 rounded-2xl border border-violet-100 bg-white shadow-xl p-2">
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-violet-50"
                  onClick={() => {
                    setIsCreateChooserOpen(false);
                    navigate('/playlist/new?type=playlist');
                  }}
                >
                  Создать плейлист
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-violet-50"
                  onClick={() => {
                    setIsCreateChooserOpen(false);
                    navigate('/playlist/new?type=album');
                  }}
                >
                  Создать альбом
                </button>
              </div>
            )}
          </div>
          {(allPlaylists.length > 0 || allAlbums.length > 0) && (
            <div
              className="-mx-6 px-6 py-10 overflow-x-auto overflow-y-visible"
              onScroll={(e) => setCollectionsScrollLeft(e.currentTarget.scrollLeft)}
            >
              <div className="flex items-center overflow-visible min-h-[220px]">
              {[
                ...allPlaylists.map((playlist) => ({ type: 'playlist' as const, id: playlist.id })),
                ...allAlbums.map((album) => ({ type: 'album' as const, id: album.id })),
              ]
                .map((item, index) => {
                  const ringStyle = getInteractiveRingStyle(index, hoveredCollectionIndex, collectionsScrollLeft);
                  if (item.type === 'playlist') {
                    const playlist = playlists[item.id];
                    if (!playlist) return null;
                    return (
                      <div
                        key={`collapsed-playlist-${playlist.id}`}
                        className="w-28 sm:w-32 shrink-0 transition-[transform,box-shadow,filter] duration-500 ease-out will-change-transform"
                        style={{
                          marginLeft: index === 0 ? '0px' : '-20px',
                          transform: ringStyle.transform,
                          zIndex: ringStyle.zIndex,
                          boxShadow: ringStyle.boxShadow,
                        }}
                        onMouseEnter={() => setCollectionHoverWithDelay(index)}
                        onMouseLeave={() => setCollectionHoverWithDelay(null)}
                        onClick={() => navigate(`/playlist/${playlist.id}`)}
                      >
                        <CollectionCard
                          title={playlist.title}
                          subtitle="Плейлист"
                          coverUrl={playlist.coverUrl}
                          type="playlist"
                          footerActions={(
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const currentFavorites = user.favoritePlaylistIds || [];
                                const isFavorite = currentFavorites.includes(playlist.id);
                                const newFavorites = isFavorite
                                  ? currentFavorites.filter((id) => id !== playlist.id)
                                  : [...currentFavorites, playlist.id];
                                updateUser(user.id, { favoritePlaylistIds: newFavorites });
                              }}
                              className="p-1 text-violet-500 hover:text-rose-500 transition-colors"
                              aria-label="Добавить плейлист в избранное"
                            >
                              <Heart
                                className={`w-5 h-5 ${
                                  user.favoritePlaylistIds?.includes(playlist.id) ? 'fill-rose-500 text-rose-500' : 'text-violet-500'
                                }`}
                              />
                            </button>
                          )}
                        />
                      </div>
                    );
                  }
                  const album = albums[item.id];
                  if (!album) return null;
                  return (
                    <div
                      key={`collapsed-album-${album.id}`}
                      className="w-28 sm:w-32 shrink-0 transition-[transform,box-shadow,filter] duration-500 ease-out will-change-transform"
                      style={{
                        marginLeft: index === 0 ? '0px' : '-20px',
                        transform: ringStyle.transform,
                        zIndex: ringStyle.zIndex,
                        boxShadow: ringStyle.boxShadow,
                      }}
                      onMouseEnter={() => setCollectionHoverWithDelay(index)}
                      onMouseLeave={() => setCollectionHoverWithDelay(null)}
                      onClick={() => navigate(
                        album.itunesCollectionId
                          ? `/album/itunes-${album.itunesCollectionId}`
                          : (/^itunes-album-(\d+)$/.test(album.id)
                            ? `/album/itunes-${album.id.replace('itunes-album-', '')}`
                            : `/album/${album.id}`)
                      )}
                    >
                      <CollectionCard
                        title={album.title}
                        subtitle={album.status || 'Альбом'}
                        coverUrl={album.coverUrl}
                        type="album"
                        footerActions={(
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const currentFavorites = user.favoriteAlbumIds || [];
                              const isFavorite = currentFavorites.includes(album.id);
                              const newFavorites = isFavorite
                                ? currentFavorites.filter((id) => id !== album.id)
                                : [...currentFavorites, album.id];
                              updateUser(user.id, { favoriteAlbumIds: newFavorites });
                            }}
                            className="p-1 text-violet-500 hover:text-rose-500 transition-colors"
                            aria-label="Добавить альбом в избранное"
                          >
                            <Heart
                              className={`w-5 h-5 ${
                                user.favoriteAlbumIds?.includes(album.id) ? 'fill-rose-500 text-rose-500' : 'text-violet-500'
                              }`}
                            />
                          </button>
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {allPlaylists.length === 0 && allAlbums.length === 0 && (
            <div className="text-center text-zinc-500 py-8">Нет плейлистов и альбомов.</div>
          )}
        </div>

        <div className="mt-8 mb-8">
          <h3 className="text-xl font-bold mb-4">Лайки</h3>
          {likedTracks.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {likedTracks.slice(0, 24).map((track) => (
                <div
                  key={`profile-liked-${track.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate('/browse')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') navigate('/browse');
                  }}
                  className="text-left rounded-2xl border border-violet-100 bg-white/85 p-3 hover:bg-white transition-colors relative"
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeLikedTrack(track.id);
                    }}
                    className="absolute top-2 right-2 text-slate-400 hover:text-rose-500"
                    aria-label="Убрать лайк"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="font-semibold text-sm line-clamp-2">{track.title}</div>
                  <div className="text-xs text-slate-500 mt-1 line-clamp-1">{(track.artistIds || []).join(', ')}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-zinc-500">Пока нет лайков.</div>
          )}
        </div>

        <div className="mb-8">
          <h3 className="text-xl font-bold mb-4">Дизлайки</h3>
          {dislikedArtistNames.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {dislikedArtistNames.slice(0, 24).map((artistName) => (
                <div
                  key={`profile-disliked-artist-${artistName}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/artist/itunes-${encodeURIComponent(artistName)}?source=itunes&name=${encodeURIComponent(artistName)}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      navigate(`/artist/itunes-${encodeURIComponent(artistName)}?source=itunes&name=${encodeURIComponent(artistName)}`);
                    }
                  }}
                  className="text-left rounded-2xl border border-rose-200 bg-rose-50/70 p-3 hover:bg-rose-50 transition-colors relative"
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeDislikedArtist(artistName);
                    }}
                    className="absolute top-2 right-2 text-rose-400 hover:text-rose-600"
                    aria-label="Убрать дизлайк"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="font-semibold text-sm line-clamp-2">{artistName}</div>
                  <div className="text-xs text-rose-500 mt-1">Скрыт из Radooga</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-zinc-500">Пока нет дизлайков.</div>
          )}
        </div>
      </div>
    </div>
  );
}
