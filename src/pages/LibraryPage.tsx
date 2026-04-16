import { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { useMockServer, TrackMetadata } from '../store/mockServer';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { UploadTrackModal } from '../components/UploadTrackModal';
import { EditTrackModal } from '../components/EditTrackModal';
import { AddToPlaylistModal } from '../components/AddToPlaylistModal';
import { AddToAlbumModal } from '../components/AddToAlbumModal';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { CreateAlbumModal } from '../components/CreateAlbumModal';
import { TrackListItem } from '../components/TrackListItem';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CollectionCard } from '../components/CollectionCard';
import { ArtistCard } from '../components/ArtistCard';
import { escapeRegExp, toStringArray } from '../lib/safe';
import { AlbumTrackListItem } from '../components/AlbumTrackListItem';
import { resolveArtistId } from '../lib/artistRouting';

type Tab = 'tracks' | 'albums' | 'playlists' | 'artists';

const Highlight = ({ text, highlight }: { text: string, highlight: string }) => {
  if (!highlight.trim() || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(highlight)})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === highlight.toLowerCase() ? (
          <span key={i} className="bg-indigo-500/50 text-white rounded px-0.5">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

export function LibraryPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [isCreateAlbumOpen, setIsCreateAlbumOpen] = useState(false);
  const [editingTrack, setEditingTrack] = useState<TrackMetadata | null>(null);
  const [addingToPlaylistTrackId, setAddingToPlaylistTrackId] = useState<string | null>(null);
  const [addingToAlbumTrackId, setAddingToAlbumTrackId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('tracks');

  const { tracks, artists, playlists, albums, users, updateUser } = useMockServer();
  const { playTrack, togglePlay, currentTrackId, isPlaying } = usePlayerStore();
  const currentUserId = useAuthStore(state => state.currentUserId);
  const user = currentUserId ? users[currentUserId] : null;

  const favoriteTracks = user && user.favoriteTrackIds ? user.favoriteTrackIds.map(id => tracks[id]).filter(Boolean) : [];
  const favoriteAlbums = user && user.favoriteAlbumIds ? user.favoriteAlbumIds.map(id => albums[id]).filter(Boolean) : [];
  const favoritePlaylists = user && user.favoritePlaylistIds ? user.favoritePlaylistIds.map(id => playlists[id]).filter(Boolean) : [];
  const favoriteArtists = user && user.favoriteArtistIds ? user.favoriteArtistIds.map(id => artists[id]).filter(Boolean) : [];

  const allTracks = Object.values(tracks);
  const allPlaylists = Object.values(playlists);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const hasQuery = queryTokens.length > 0;
  const normalizeText = (value: unknown) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  const matchesQuery = (value: unknown) => {
    const source = normalizeText(value);
    return queryTokens.every((token) => source.includes(token));
  };

  const searchResultsTracks = favoriteTracks.filter(t =>
    matchesQuery(t.title) ||
    matchesQuery(t.lyrics) ||
    matchesQuery(toStringArray(t.artistIds).join(' '))
  );
  const searchResultsAlbums = favoriteAlbums.filter(a => matchesQuery(a.title));
  const searchResultsPlaylists = allPlaylists.filter(p => matchesQuery(p.title));
  const searchResultsArtists = favoriteArtists.filter(a => matchesQuery(a.name));

  const handleToggleFavoriteArtist = (e: React.MouseEvent, artistId: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) return;
    const currentFavorites = user.favoriteArtistIds || [];
    const isFavorite = currentFavorites.includes(artistId);
    const newFavorites = isFavorite
      ? currentFavorites.filter(id => id !== artistId)
      : [...currentFavorites, artistId];
    updateUser(user.id, { favoriteArtistIds: newFavorites });
  };

  const getAlbumRowMeta = (album: typeof favoriteAlbums[number]) => {
    const albumTracks = album.trackIds
      .map((trackId) => tracks[trackId])
      .filter(Boolean);
    const formatCount = albumTracks.reduce<Record<string, number>>((acc, track) => {
      const key = (track.format || 'unknown').toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const qualityLabel = Object.entries(formatCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
    const isExplicit = albumTracks.some((track) => track.isExplicit);

    const linkedArtistNames = (album.artistIds || []).map((artistId) => artists[artistId]?.name).filter(Boolean);
    const fallbackArtists = Array.from(new Set(albumTracks.flatMap((track) => toStringArray(track.artistIds))));
    const artistName = (linkedArtistNames.length > 0 ? linkedArtistNames : fallbackArtists).join(', ');

    return { qualityLabel, isExplicit, artistName };
  };

  return (
    <div className="p-4 pt-8 h-full overflow-y-auto scrollbar-hide" onClick={() => setActiveMenuId(null)}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Медиатека</h1>
        <button 
          onClick={() => setIsUploadModalOpen(true)}
          className="w-10 h-10 bg-white/85 rounded-full flex items-center justify-center hover:bg-white transition-colors text-violet-500"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
        <input
          type="text"
          placeholder="Поиск в медиатеке..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-white/85 text-slate-700 pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
      </div>

      {/* Вкладки */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
        {(['tracks', 'albums', 'playlists', 'artists'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab
                ? 'bg-violet-500 text-white shadow-sm shadow-violet-200'
                : 'bg-white/70 text-slate-500 hover:bg-white'
            }`}
          >
            {tab === 'tracks' && 'Мои треки'}
            {tab === 'albums' && 'Мои альбомы'}
            {tab === 'playlists' && 'Мои плейлисты'}
            {tab === 'artists' && 'Любимые артисты'}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ТРЕКИ */}
        {activeTab === 'tracks' && (
          <motion.div
            key="tracks"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <h2 className="text-xl font-bold mb-4 flex items-center justify-between">
              Мои треки
            </h2>
            <div className="space-y-2">
              {(hasQuery ? searchResultsTracks : favoriteTracks).length === 0 && (hasQuery ? searchResultsAlbums : favoriteAlbums).length === 0 ? (
                <div className="text-center text-zinc-500 py-10">Нет треков в избранном</div>
              ) : (
                (hasQuery ? searchResultsTracks : favoriteTracks).map((track) => (
                  <TrackListItem
                    track={track}
                    user={user}
                    isPlaying={isPlaying}
                    isActive={currentTrackId === track.id}
                    searchQuery={searchQuery}
                    onPlay={() => playTrack(track.id, (hasQuery ? searchResultsTracks : favoriteTracks).map(t => t.id), null)}
                  onArtistClick={(artistRef) => {
                    const artistId = resolveArtistId(artistRef, artists);
                    if (artistId) navigate(`/artist/${artistId}`);
                  }}
                    onToggleFavorite={() => {
                      if (user) {
                        const favoriteTrackIds = user.favoriteTrackIds || [];
                        const newFavorites = favoriteTrackIds.includes(track.id)
                          ? favoriteTrackIds.filter(id => id !== track.id)
                          : [track.id, ...favoriteTrackIds];
                        updateUser(user.id, { favoriteTrackIds: newFavorites });
                      }
                    }}
                    onAddToPlaylist={() => setAddingToPlaylistTrackId(track.id)}
                    onAddToAlbum={() => setAddingToAlbumTrackId(track.id)}
                    onEdit={() => setEditingTrack(track)}
                  />
                ))
              )}
              {(hasQuery ? searchResultsAlbums : favoriteAlbums).map((album) => {
                const { artistName, qualityLabel, isExplicit } = getAlbumRowMeta(album);
                return (
                  <AlbumTrackListItem
                    key={`fav-album-row-${album.id}`}
                    title={album.title}
                    artistName={artistName}
                    coverUrl={album.coverUrl}
                    trackCount={album.trackIds.length}
                    qualityLabel={qualityLabel}
                    isExplicit={isExplicit}
                    isActive={Boolean(currentTrackId && album.trackIds.includes(currentTrackId))}
                    isPlaying={isPlaying}
                    searchQuery={searchQuery}
                    onOpen={() => navigate(`/album/${album.id}`)}
                    onPlay={() => {
                      if (currentTrackId && album.trackIds.includes(currentTrackId)) {
                        togglePlay();
                        return;
                      }
                      if (album.trackIds.length > 0) {
                        playTrack(album.trackIds[0], album.trackIds, album.id);
                      }
                    }}
                  />
                );
              })}
            </div>
          </motion.div>
        )}

        {/* АЛЬБОМЫ */}
        {activeTab === 'albums' && (
          <motion.div
            key="albums"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Мои альбомы</h2> 
              <button
                onClick={() => setIsCreateAlbumOpen(true)}
                className="p-2 bg-white/85 rounded-lg hover:bg-white transition-colors text-violet-500"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {(searchQuery ? searchResultsAlbums : favoriteAlbums).length === 0 ? (
                <div className="text-center text-zinc-500 py-10 col-span-full">Нет альбомов</div>
              ) : (
                (searchQuery ? searchResultsAlbums : favoriteAlbums).map(album => (
                  <Link key={album.id} to={`/album/${album.id}`}>
                    <CollectionCard
                      title={<Highlight text={album.title} highlight={searchQuery} />}
                      subtitle={album.status || 'Альбом'}
                      coverUrl={album.coverUrl}
                      type="album"
                    />
                  </Link>
                ))
              )}
            </div>
          </motion.div>
        )}

        {/* ПЛЕЙЛИСТЫ */}
        {activeTab === 'playlists' && (
          <motion.div
            key="playlists"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Мои плейлисты</h2> 
              <button
                onClick={() => setIsCreatePlaylistOpen(true)}
                className="p-2 bg-white/85 rounded-lg hover:bg-white transition-colors text-violet-500"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {(searchQuery ? searchResultsPlaylists : allPlaylists).length === 0 ? (
                <div className="text-center text-zinc-500 py-10 col-span-full">Нет плейлистов</div>
              ) : (
                (searchQuery ? searchResultsPlaylists : allPlaylists).map(playlist => (
                  <Link key={playlist.id} to={`/playlist/${playlist.id}`}>
                    <CollectionCard
                      title={<Highlight text={playlist.title} highlight={searchQuery} />}
                      subtitle="Плейлист"
                      coverUrl={playlist.coverUrl}
                      type="playlist"
                    />
                  </Link>
                ))
              )}
            </div>
          </motion.div>
        )}

        {/* АРТИСТЫ */}
        {activeTab === 'artists' && (
          <motion.div
            key="artists"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <h2 className="text-xl font-bold mb-4 flex items-center justify-between">
              Любимые артисты
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {(searchQuery ? searchResultsArtists : favoriteArtists).length === 0 ? (
                <div className="text-center text-zinc-500 py-10 col-span-full">Нет артистов в избранном</div>
              ) : (
                (searchQuery ? searchResultsArtists : favoriteArtists).map(artist => (
                  <Link key={artist.id} to={`/artist/${artist.id}`}>
                    <ArtistCard
                      artist={{ ...artist, name: artist.name }}
                      subtitle={artist.description?.trim() ? <Highlight text={artist.description.trim()} highlight={searchQuery} /> : undefined}
                      isFavorite={Boolean(user?.favoriteArtistIds?.includes(artist.id))}
                      onToggleFavorite={user ? (e) => handleToggleFavoriteArtist(e, artist.id) : undefined}
                    />
                  </Link>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isUploadModalOpen && <UploadTrackModal onClose={() => setIsUploadModalOpen(false)} />}
      {isCreatePlaylistOpen && <CreatePlaylistModal onClose={() => setIsCreatePlaylistOpen(false)} />}
      {isCreateAlbumOpen && <CreateAlbumModal onClose={() => setIsCreateAlbumOpen(false)} />}
      {editingTrack && <EditTrackModal track={editingTrack} onClose={() => setEditingTrack(null)} />}
      {addingToPlaylistTrackId && <AddToPlaylistModal trackId={addingToPlaylistTrackId} onClose={() => setAddingToPlaylistTrackId(null)} />}
      {addingToAlbumTrackId && <AddToAlbumModal trackId={addingToAlbumTrackId} onClose={() => setAddingToAlbumTrackId(null)} />}
    </div>
  );
}
