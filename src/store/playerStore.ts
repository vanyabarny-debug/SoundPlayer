import { create } from 'zustand';

type PreviewTrack = {
  key: string;
  url: string;
  title: string;
  artist: string;
  artworkUrl?: string;
};

interface PlayerState {
  currentTrackId: string | null;
  currentPreviewKey: string | null;
  previewUrl: string | null;
  previewTitle: string | null;
  previewArtist: string | null;
  previewArtworkUrl: string | null;
  previewQueue: PreviewTrack[];
  currentPreviewIndex: number;
  queue: string[];
  currentAlbumId: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  repeatMode: 'off' | 'all' | 'one';
  audioEnergy: number;
  audioBands: number[];
  audioTick: number;
  
  playTrack: (trackId: string, queue?: string[], albumId?: string | null) => void;
  playPreview: (preview: PreviewTrack, queue?: PreviewTrack[]) => void;
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
  updateAudioMetrics: (metrics: { energy: number; bands: number[] }) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrackId: null,
  currentPreviewKey: null,
  previewUrl: null,
  previewTitle: null,
  previewArtist: null,
  previewArtworkUrl: null,
  previewQueue: [],
  currentPreviewIndex: -1,
  queue: [],
  currentAlbumId: null,
  isPlaying: false,
  isLoading: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  repeatMode: 'off',
  audioEnergy: 0,
  audioBands: [0, 0, 0, 0, 0, 0, 0, 0],
  audioTick: 0,

  playTrack: (trackId, queue, albumId = null) => set((state) => {
    if (trackId === state.currentTrackId && albumId === state.currentAlbumId) {
      return { isPlaying: !state.isPlaying };
    }
    return {
      currentTrackId: trackId, 
      currentPreviewKey: null,
      previewUrl: null,
      previewTitle: null,
      previewArtist: null,
      previewArtworkUrl: null,
      previewQueue: [],
      currentPreviewIndex: -1,
      queue: queue || state.queue,
      currentAlbumId: albumId,
      isPlaying: true,
      isLoading: true
    };
  }),
  playPreview: (preview, queue) => set((state) => {
    if (state.currentPreviewKey === preview.key && state.previewUrl === preview.url) {
      return { isPlaying: !state.isPlaying };
    }
    const previewQueue = queue && queue.length > 0 ? queue : [preview];
    const currentPreviewIndex = Math.max(0, previewQueue.findIndex((item) => item.key === preview.key));
    return {
      currentTrackId: null,
      currentAlbumId: null,
      queue: [],
      currentPreviewKey: preview.key,
      previewUrl: preview.url,
      previewTitle: preview.title,
      previewArtist: preview.artist,
      previewArtworkUrl: preview.artworkUrl || null,
      previewQueue,
      currentPreviewIndex,
      isPlaying: true,
      isLoading: true,
      currentTime: 0,
      duration: 0,
    };
  }),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setLoading: (loading) => set({ isLoading: loading }),
  nextTrack: () => {
    const { currentTrackId, queue, repeatMode, previewQueue, currentPreviewIndex } = get();
    if (!currentTrackId && previewQueue.length > 0) {
      if (repeatMode === 'one' && currentPreviewIndex >= 0) {
        set({ currentTime: 0, isPlaying: true, isLoading: true });
        return;
      }
      const nextPreviewIndex = currentPreviewIndex + 1;
      if (nextPreviewIndex < previewQueue.length) {
        const nextPreview = previewQueue[nextPreviewIndex];
        set({
          currentPreviewIndex: nextPreviewIndex,
          currentPreviewKey: nextPreview.key,
          previewUrl: nextPreview.url,
          previewTitle: nextPreview.title,
          previewArtist: nextPreview.artist,
          previewArtworkUrl: nextPreview.artworkUrl || null,
          currentTime: 0,
          duration: 0,
          isPlaying: true,
          isLoading: true,
        });
      } else {
        set({ isPlaying: false, currentTime: 0 });
      }
      return;
    }
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
  updateAudioMetrics: ({ energy, bands }) =>
    set((state) => ({
      audioEnergy: Math.max(0, Math.min(1, energy)),
      audioBands: bands.slice(0, 8),
      audioTick: state.audioTick + 1,
    })),
}));
