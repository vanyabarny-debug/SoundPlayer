import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMockServer, Artist } from '../store/mockServer';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { Edit2, ArrowLeft, Plus, Music, Link as LinkIcon, Upload, Heart } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { LinkToArtistModal } from '../components/LinkToArtistModal';
import { saveImageFile } from '../lib/db';
import { CachedImage } from '../components/CachedImage';
import { TrackListItem } from '../components/TrackListItem';
import { CollectionCard } from '../components/CollectionCard';
import { resolveArtistId } from '../lib/artistRouting';

export function ArtistPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { artists, updateArtist, addArtist, tracks, albums, users, updateUser } = useMockServer();
  const { playTrack, currentTrackId, isPlaying } = usePlayerStore();
  const { currentUserId } = useAuthStore();
  
  const isNew = id === 'new';
  const artist = isNew ? null : artists[id || ''];
  
  const currentUser = currentUserId ? users[currentUserId] : null;
  const isFavorite = currentUser?.favoriteArtistIds?.includes(artist?.id || '') || false;

  const toggleFavorite = () => {
    if (!currentUser || !artist) return;
    const currentFavorites = currentUser.favoriteArtistIds || [];
    const newFavorites = isFavorite 
      ? currentFavorites.filter(fid => fid !== artist.id)
      : [...currentFavorites, artist.id];
    
    updateUser(currentUser.id, { favoriteArtistIds: newFavorites });
  };
  
  const [isEditing, setIsEditing] = useState(isNew);
  const [name, setName] = useState(artist?.name || '');
  const [description, setDescription] = useState(artist?.description || '');
  
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(artist?.bannerUrl || null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [isLinking, setIsLinking] = useState(false);

  useEffect(() => {
  }, [id, isNew]);

  if (!isNew && !artist) {
    return <div className="p-4 pt-8">Артист не найден</div>;
  }

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setBannerFile(file);
      setBannerPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!currentUserId) return;

    let bannerId = artist?.bannerUrl || '';
    if (bannerFile) {
      bannerId = uuidv4();
      await saveImageFile(bannerId, bannerFile);
    }

    if (isNew) {
      const newId = uuidv4();
      addArtist({ 
        id: newId, 
        name, 
        description, 
        bannerUrl: bannerId || undefined,
        ownerId: currentUserId
      });
      if (currentUser) {
        const favoriteArtistIds = currentUser.favoriteArtistIds || [];
        if (!favoriteArtistIds.includes(newId)) {
          updateUser(currentUser.id, { favoriteArtistIds: [...favoriteArtistIds, newId] });
        }
      }
      navigate(`/artist/${newId}`, { replace: true });
    } else if (artist) {
      updateArtist(artist.id, { 
        name, 
        description, 
        bannerUrl: bannerId || undefined 
      });
    }
    setIsEditing(false);
  };

  const artistTracks = isNew ? [] : Object.values(tracks).filter(t => t.artistIds.includes(artist?.name || ''));
  const artistAlbums = isNew ? [] : Object.values(albums).filter(a => (a.artistIds || []).includes(artist?.id || ''));

  return (
    <div className="pb-10">
      <div className="relative h-[300px] w-full bg-violet-100 overflow-hidden">
        {isEditing ? (
          <div 
            className="absolute inset-0 flex flex-col items-center justify-center bg-violet-500/50 z-10 cursor-pointer hover:bg-violet-500/60 transition-colors"
            onClick={() => bannerInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={bannerInputRef} 
              onChange={handleBannerChange} 
              accept="image/*" 
              className="hidden" 
            />
            <Upload className="w-8 h-8 text-white mb-2" />
            <span className="text-sm text-white font-medium">Изменить баннер</span>
          </div>
        ) : null}
        {bannerPreview ? (
          <CachedImage src={bannerPreview} alt={name || 'Artist'} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-20 h-20 text-slate-400" />
          </div>
        )}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to top, rgba(2,6,23,0.72) 0%, rgba(2,6,23,0.42) 35%, var(--accent-soft-strong) 62%, transparent 82%)'
          }}
        />
        
        <button 
          onClick={() => navigate(-1)}
          className="absolute top-safe left-4 p-2 bg-white/80 rounded-full text-violet-500 backdrop-blur-md z-20 mt-4"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        <div className="absolute bottom-6 left-4 right-4 z-20">
          {isEditing ? (
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)}
              placeholder="Имя артиста"
              className="bg-transparent text-4xl font-bold text-white outline-none w-full placeholder:text-white/70"
              autoFocus
            />
          ) : (
            <div className="space-y-2">
              <h1 className="text-4xl font-bold text-white">{artist?.name}</h1>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-white/90 text-xs backdrop-blur-sm">
                <span>{artistTracks.length} треков</span>
                <span>•</span>
                <span>{artistAlbums.length} релизов</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 relative z-10 -mt-8 space-y-4">
        {!isEditing && (
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-4 shadow-md shadow-violet-100/70 border border-white/70">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Профиль артиста</div>
                <h2 className="text-xl font-bold text-slate-700 truncate">{artist?.name}</h2>
              </div>
              <div className="flex items-center gap-2">
                {!isNew && (
                  <button
                    onClick={toggleFavorite}
                    className="p-2.5 bg-white rounded-full text-slate-500 hover:text-violet-500 transition-colors"
                    title="В избранное"
                  >
                    <Heart
                      className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`}
                      style={isFavorite ? { color: 'var(--accent-color)' } : undefined}
                    />
                  </button>
                )}
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2.5 bg-white rounded-full text-slate-500 hover:text-violet-500 transition-colors"
                  title="Редактировать"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {isEditing ? (
          <div className="space-y-4 bg-white/95 backdrop-blur-sm rounded-2xl p-4 shadow-md shadow-violet-100/70 border border-white/70">
            <div>
              <label className="block text-xs uppercase tracking-wide text-slate-400 mb-2">Имя артиста</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Имя артиста"
                className="w-full bg-white text-slate-700 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200"
              />
            </div>
            <textarea 
              value={description} 
              onChange={e => setDescription(e.target.value)}
              placeholder="Описание артиста"
              rows={4}
              className="w-full bg-white text-slate-700 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 bg-slate-100 text-slate-600 font-semibold py-3 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Отмена
              </button>
              <button 
                onClick={handleSave}
                className="flex-1 bg-violet-500 text-white font-bold py-3 rounded-xl hover:bg-violet-600 transition-colors"
              >
                Сохранить
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-md shadow-violet-100/70 mt-1">
            <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">О исполнителе</div>
            <p className="text-slate-600 leading-relaxed">{artist?.description || 'Нет описания'}</p>
          </div>
        )}

        {!isNew && (
          <div className="space-y-4">
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 shadow-md shadow-violet-100/70">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Популярные треки</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-violet-100 text-violet-600 font-medium">
                    {artistTracks.length}
                  </span>
                  {isEditing && (
                    <button 
                      onClick={() => setIsLinking(true)}
                      className="p-2 text-slate-400 hover:text-violet-500 bg-white rounded-full"
                      title="Привязать существующие треки/альбомы"
                    >
                      <LinkIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
              {artistTracks.slice(0, 5).map((track, index) => (
                <TrackListItem
                  key={track.id}
                  track={track}
                  user={currentUser}
                  isPlaying={isPlaying}
                  isActive={currentTrackId === track.id}
                  searchQuery=""
                  onPlay={() => playTrack(track.id, artistTracks.map(t => t.id), null)}
                  onArtistClick={(artistRef) => {
                    const artistId = resolveArtistId(artistRef, artists);
                    if (artistId) navigate(`/artist/${artistId}`);
                  }}
                  onToggleFavorite={() => {}}
                  onAddToPlaylist={() => {}}
                  onEdit={() => {}}
                  showMenu={false}
                />
              ))}
              {artistTracks.length === 0 && (
                <div className="text-center text-slate-400 py-4 bg-white rounded-xl">Нет треков</div>
              )}
            </div>
            </div>

            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 shadow-md shadow-violet-100/70">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Альбомы и синглы</h2>
                <button onClick={() => navigate('/album/new?type=album')} className="p-2 text-slate-400 hover:text-violet-500">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {artistAlbums.map(album => (
                  <Link key={album.id} to={`/album/${album.id}`}>
                    <CollectionCard
                      title={album.title}
                      subtitle={album.status || 'Альбом'}
                      coverUrl={album.coverUrl}
                      type="album"
                    />
                  </Link>
                ))}
                {artistAlbums.length === 0 && (
                  <div className="col-span-2 text-center text-slate-400 py-8 bg-white/70 rounded-[6px]">
                    Нет релизов
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {isLinking && artist && (
        <LinkToArtistModal 
          artistId={artist.id} 
          artistName={artist.name} 
          onClose={() => setIsLinking(false)} 
        />
      )}
    </div>
  );
}
