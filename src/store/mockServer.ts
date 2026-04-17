import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TrackFormat = 'mp3' | 'wav' | 'flac' | 'mp4' | 'unknown';

export interface TrackMetadata {
  id: string;
  title: string;
  artistIds: string[];
  duration?: number;
  previewUrl?: string;
  isPreviewOnly?: boolean;
  albumId?: string;
  producer?: string;
  lyrics?: string;
  features?: string[];
  isExplicit: boolean;
  isSingle: boolean;
  format: TrackFormat;
  coverUrl?: string;
  ownerId: string;
}

export interface Artist {
  id: string;
  name: string;
  description: string;
  bannerUrl?: string;
  ownerId?: string;
}

export interface Playlist {
  id: string;
  title: string;
  ownerId: string;
  coverUrl?: string;
  description?: string;
  status?: string;
  trackIds: string[];
  type: 'playlist';
}

export interface Album {
  id: string;
  title: string;
  ownerId: string;
  coverUrl?: string;
  trackIds: string[];
  sourceTrackCount?: number;
  itunesCollectionId?: string;
  type: 'album';
  artistIds: string[];
  description?: string;
  status?: string;
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  avatarEmoji: string;
  avatarGradient: string;
  favoriteTrackIds: string[];
  favoritePlaylistIds?: string[];
  favoriteAlbumIds?: string[];
  favoriteArtistIds?: string[];
  dislikedArtistNames?: string[];
}

interface MockServerState {
  users: Record<string, User>;
  tracks: Record<string, TrackMetadata>;
  artists: Record<string, Artist>;
  playlists: Record<string, Playlist>;
  albums: Record<string, Album>;
  
  addUser: (user: User) => void;
  updateUser: (id: string, data: Partial<User>) => void;
  addTrack: (track: TrackMetadata) => void;
  updateTrack: (id: string, data: Partial<TrackMetadata>) => void;
  deleteTrack: (id: string) => void;
  addArtist: (artist: Artist) => void;
  updateArtist: (id: string, data: Partial<Artist>) => void;
  deleteArtist: (id: string) => void;
  addPlaylist: (playlist: Playlist) => void;
  updatePlaylist: (id: string, data: Partial<Playlist>) => void;
  addAlbum: (album: Album) => void;
  updateAlbum: (id: string, data: Partial<Album>) => void;
}

export const useMockServer = create<MockServerState>()(
  persist(
    (set) => ({
      users: {},
      tracks: {},
      artists: {},
      playlists: {},
      albums: {},

      addUser: (user) => set((state) => ({ users: { ...state.users, [user.id]: user } })),
      updateUser: (id, data) => set((state) => ({ users: { ...state.users, [id]: { ...state.users[id], ...data } } })),
      addTrack: (track) => set((state) => ({ tracks: { ...state.tracks, [track.id]: track } })),
      updateTrack: (id, data) => set((state) => ({ tracks: { ...state.tracks, [id]: { ...state.tracks[id], ...data } } })),
      deleteTrack: (id) => set((state) => {
        const { [id]: _removedTrack, ...restTracks } = state.tracks;
        const updatedUsers = Object.fromEntries(
          Object.entries(state.users).map(([userId, user]) => [
            userId,
            {
              ...user,
              favoriteTrackIds: (user.favoriteTrackIds || []).filter((trackId) => trackId !== id),
            },
          ])
        );
        const updatedPlaylists = Object.fromEntries(
          Object.entries(state.playlists).map(([playlistId, playlist]) => [
            playlistId,
            {
              ...playlist,
              trackIds: (playlist.trackIds || []).filter((trackId) => trackId !== id),
            },
          ])
        );
        const updatedAlbums = Object.fromEntries(
          Object.entries(state.albums).map(([albumId, album]) => [
            albumId,
            {
              ...album,
              trackIds: (album.trackIds || []).filter((trackId) => trackId !== id),
            },
          ])
        );

        return {
          tracks: restTracks,
          users: updatedUsers,
          playlists: updatedPlaylists,
          albums: updatedAlbums,
        };
      }),
      addArtist: (artist) => set((state) => ({ artists: { ...state.artists, [artist.id]: artist } })),
      updateArtist: (id, data) => set((state) => ({ artists: { ...state.artists, [id]: { ...state.artists[id], ...data } } })),
      deleteArtist: (id) => set((state) => {
        const { [id]: removedArtist, ...restArtists } = state.artists;
        const removedName = removedArtist?.name?.trim();

        const updatedUsers = Object.fromEntries(
          Object.entries(state.users).map(([userId, user]) => [
            userId,
            {
              ...user,
              favoriteArtistIds: (user.favoriteArtistIds || []).filter((artistId) => artistId !== id),
            },
          ])
        );

        const updatedTracks = Object.fromEntries(
          Object.entries(state.tracks).map(([trackId, track]) => [
            trackId,
            {
              ...track,
              artistIds: (track.artistIds || []).filter((artistRef) => {
                const normalized = String(artistRef).trim().toLowerCase();
                if (!normalized) return false;
                if (normalized === id.toLowerCase()) return false;
                if (removedName && normalized === removedName.toLowerCase()) return false;
                return true;
              }),
            },
          ])
        );

        const updatedAlbums = Object.fromEntries(
          Object.entries(state.albums).map(([albumId, album]) => [
            albumId,
            {
              ...album,
              artistIds: (album.artistIds || []).filter((artistId) => artistId !== id),
            },
          ])
        );

        return {
          artists: restArtists,
          users: updatedUsers,
          tracks: updatedTracks,
          albums: updatedAlbums,
        };
      }),
      addPlaylist: (playlist) => set((state) => ({ playlists: { ...state.playlists, [playlist.id]: playlist } })),
      updatePlaylist: (id, data) => set((state) => ({ playlists: { ...state.playlists, [id]: { ...state.playlists[id], ...data } } })),
      addAlbum: (album) => set((state) => ({ albums: { ...state.albums, [album.id]: album } })),
      updateAlbum: (id, data) => set((state) => ({ albums: { ...state.albums, [id]: { ...state.albums[id], ...data } } })),
    }),
    {
      name: 'mock-server-storage',
      version: 3,
      migrate: (persistedState: unknown, version: number) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return persistedState as MockServerState;
        }
        const state = persistedState as Partial<MockServerState>;
        const albums = state.albums || {};
        const tracks = state.tracks || {};
        const users = state.users || {};

        const albumIdMap: Record<string, string> = {};
        const migratedAlbums: Record<string, Album> = {};
        for (const [albumId, album] of Object.entries(albums)) {
          if (albumId.startsWith('itunes-album-')) {
            const collectionId = albumId.replace('itunes-album-', '').trim();
            const newId = collectionId ? `itunes-${collectionId}` : albumId;
            albumIdMap[albumId] = newId;
            migratedAlbums[newId] = { ...album, id: newId, itunesCollectionId: collectionId || album.itunesCollectionId };
          } else if (albumId.startsWith('itunes-')) {
            const collectionId = albumId.replace('itunes-', '').trim();
            migratedAlbums[albumId] = { ...album, itunesCollectionId: album.itunesCollectionId || collectionId };
          } else {
            migratedAlbums[albumId] = album;
          }
        }

        const migratedTracks: Record<string, TrackMetadata> = {};
        for (const [trackId, track] of Object.entries(tracks)) {
          const nextAlbumId = track.albumId && albumIdMap[track.albumId] ? albumIdMap[track.albumId] : track.albumId;
          migratedTracks[trackId] = nextAlbumId === track.albumId ? track : { ...track, albumId: nextAlbumId };
        }

        const migratedUsers: Record<string, User> = {};
        for (const [userId, user] of Object.entries(users)) {
          const favoriteAlbumIds = (user.favoriteAlbumIds || []).map((albumId) => albumIdMap[albumId] || albumId);
          migratedUsers[userId] = { ...user, favoriteAlbumIds };
        }

        return {
          ...state,
          albums: migratedAlbums,
          tracks: migratedTracks,
          users: migratedUsers,
        } as MockServerState;
      },
    }
  )
);
