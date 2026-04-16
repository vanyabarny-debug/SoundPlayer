import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TrackFormat = 'mp3' | 'wav' | 'flac' | 'mp4' | 'unknown';

export interface TrackMetadata {
  id: string;
  title: string;
  artistIds: string[];
  duration?: number;
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
      addPlaylist: (playlist) => set((state) => ({ playlists: { ...state.playlists, [playlist.id]: playlist } })),
      updatePlaylist: (id, data) => set((state) => ({ playlists: { ...state.playlists, [id]: { ...state.playlists[id], ...data } } })),
      addAlbum: (album) => set((state) => ({ albums: { ...state.albums, [album.id]: album } })),
      updateAlbum: (id, data) => set((state) => ({ albums: { ...state.albums, [id]: { ...state.albums[id], ...data } } })),
    }),
    {
      name: 'mock-server-storage',
    }
  )
);
