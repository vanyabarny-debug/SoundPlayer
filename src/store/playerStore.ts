import { create } from 'zustand';

interface PlayerState {
  currentTrackId: string | null;
  queue: string[];
  currentAlbumId: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  repeatMode: 'off' | 'all' | 'one';
  
  playTrack: (trackId: string, queue?: string[], albumId?: string | null) => void;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  setLoading: (loading: boolean) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  setTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleRepeatMode: () => void;
  seekRequest: number | null;
  seek: (time: number) => void;
  clearSeekRequest: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrackId: null,
  queue: [],
  currentAlbumId: null,
  isPlaying: false,
  isLoading: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  repeatMode: 'off',

  playTrack: (trackId, queue, albumId = null) => set((state) => {
    if (trackId === state.currentTrackId && albumId === state.currentAlbumId) {
      return { isPlaying: !state.isPlaying };
    }
    return {
      currentTrackId: trackId, 
      queue: queue || state.queue,
      currentAlbumId: albumId,
      isPlaying: true,
      isLoading: true
    };
  }),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setLoading: (loading) => set({ isLoading: loading }),
  nextTrack: () => {
    const { currentTrackId, queue, repeatMode } = get();
    if (!currentTrackId || queue.length === 0) return;
    
    if (repeatMode === 'one') {
      set({ currentTime: 0, isPlaying: true });
      return;
    }

    const idx = queue.indexOf(currentTrackId);
    if (idx !== -1) {
      if (idx < queue.length - 1) {
        set({ currentTrackId: queue[idx + 1], isPlaying: true, isLoading: true });
      } else if (repeatMode === 'all') {
        set({ currentTrackId: queue[0], isPlaying: true, isLoading: true });
      } else {
        set({ isPlaying: false, currentTime: 0 });
      }
    }
  },
  prevTrack: () => {
    const { currentTrackId, queue, currentTime } = get();
    if (!currentTrackId || queue.length === 0) return;
    
    if (currentTime > 3) {
      set({ currentTime: 0 });
      return;
    }

    const idx = queue.indexOf(currentTrackId);
    if (idx > 0) {
      set({ currentTrackId: queue[idx - 1], isPlaying: true, isLoading: true });
    } else {
      set({ currentTime: 0 });
    }
  },
  setTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  toggleRepeatMode: () => set((state) => {
    const modes: ('off' | 'all' | 'one')[] = ['off', 'all', 'one'];
    const nextIndex = (modes.indexOf(state.repeatMode) + 1) % modes.length;
    return { repeatMode: modes[nextIndex] };
  }),
  seekRequest: null,
  seek: (time) => set({ seekRequest: time, currentTime: time }),
  clearSeekRequest: () => set({ seekRequest: null }),
}));
