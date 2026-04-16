import { create } from 'zustand';
import { useAuthStore } from './authStore';
import { useMockServer } from './mockServer';
import {
  buildFeedBatch,
  pickSeedTrack,
  RadoogaCandidate,
  RadoogaMode,
  SeedTrack,
  SeedStacks,
  trackToSeed,
} from '../lib/radoogaRecommendations';

type FeedStats = {
  impressions: number;
  likes: number;
  skips: number;
};

interface RadoogaState {
  mode: RadoogaMode;
  seedTrackId: string | null;
  lastTrackSeedId: string | null;
  trackSeed: SeedTrack | null;
  items: RadoogaCandidate[];
  currentIndex: number;
  seenIds: string[];
  seenArtists: string[];
  likedInSession: string[];
  recentLikedSeedIds: string[];
  blockedArtistNames: string[];
  skippedInSession: string[];
  recentSeedIds: string[];
  isLoading: boolean;
  isPrefetching: boolean;
  isRefreshing: boolean;
  isExhaustedTemporary: boolean;
  error: string | null;
  statsByMode: Record<RadoogaMode, FeedStats>;
  sessionCursor: number;
  sessionExcludedCandidateIds: string[];

  openForYouFeed: () => Promise<void>;
  openTrackFeed: (seedTrackId: string, seedTrack?: SeedTrack) => Promise<void>;
  nextCard: () => Promise<void>;
  prevCard: () => void;
  markSeen: (candidateId: string) => void;
  likeCurrent: () => string | null;
  dislikeCurrentArtist: () => string | null;
  skipCurrent: () => void;
  prefetchNextBatch: () => Promise<void>;
  refreshFeed: () => Promise<void>;
}

const appendUnique = (items: string[], value: string): string[] =>
  items.includes(value) ? items : [...items, value];

const getSeedTrackById = (seedTrackId: string | null): SeedTrack | null => {
  if (!seedTrackId) return null;
  const track = useMockServer.getState().tracks[seedTrackId];
  return track ? trackToSeed(track) : null;
};

const fallbackStats = (): FeedStats => ({ impressions: 0, likes: 0, skips: 0 });
let latestFeedLoadRequestId = 0;

const buildSeedStacks = (): SeedStacks => {
  const state = useMockServer.getState();
  const orderedHistory: string[] = [];
  const pushTrack = (trackId: string) => {
    if (!trackId || orderedHistory.includes(trackId)) return;
    if (state.tracks[trackId]) orderedHistory.push(trackId);
  };

  Object.keys(state.tracks).forEach(pushTrack);
  Object.values(state.albums).forEach((album) => (album.trackIds || []).forEach(pushTrack));
  Object.values(state.playlists).forEach((playlist) => (playlist.trackIds || []).forEach(pushTrack));

  const first = orderedHistory.slice(0, 1).map((id) => trackToSeed(state.tracks[id]));
  const stack2to10 = orderedHistory.slice(1, 10).map((id) => trackToSeed(state.tracks[id]));
  const stack10to50 = orderedHistory.slice(10, 50).map((id) => trackToSeed(state.tracks[id]));
  const stack50plus = orderedHistory.slice(50).map((id) => trackToSeed(state.tracks[id]));

  return { first, stack2to10, stack10to50, stack50plus };
};

const createFeedBatch = async (
  mode: RadoogaMode,
  seedTrackId: string | null,
  explicitSeedTrack: SeedTrack | null,
  seenIds: string[],
  seenArtists: string[],
  recentLikedSeedIds: string[],
  blockedArtistNames: string[],
  sessionExcludedCandidateIds: string[],
  recentSeedIds: string[],
  signal?: AbortSignal
): Promise<{ seedTrack: SeedTrack | null; batch: RadoogaCandidate[]; exhausted: boolean }> => {
  const auth = useAuthStore.getState();
  const state = useMockServer.getState();
  const user = auth.currentUserId ? state.users[auth.currentUserId] : null;
  const allTracks = Object.values(state.tracks);

  let seed = explicitSeedTrack || getSeedTrackById(seedTrackId);
  if (!seed) {
    seed = pickSeedTrack(allTracks, user?.favoriteTrackIds || [], recentSeedIds);
  }

  if (!seed) {
    return { seedTrack: null, batch: [], exhausted: true };
  }

  const favoriteArtistNames = (user?.favoriteArtistIds || [])
    .map((artistId) => state.artists[artistId]?.name || '')
    .filter(Boolean);

  const downloadedTrackIds = allTracks.map((track) => track.id);
  const recentArtists = seenArtists.slice(-16);
  const prioritizedSeeds = recentLikedSeedIds
    .slice(-12)
    .map((id) => state.tracks[id])
    .filter((track): track is typeof allTracks[number] => Boolean(track))
    .map(trackToSeed);
  const seedStacks = buildSeedStacks();

  let mergedBatch: RadoogaCandidate[] = [];
  let exhausted = false;
  let seedCursor = seed;
  const attempts = mode === 'for-you' ? 3 : 1;

  for (let i = 0; i < attempts; i += 1) {
    const response = await buildFeedBatch({
      mode,
      seedTrack: seedCursor,
      prioritizedSeeds,
      favoriteArtistNames,
      downloadedTrackIds: downloadedTrackIds.filter((id) => !id.startsWith('radooga-')),
      seenCandidateIds: [...seenIds, ...sessionExcludedCandidateIds, ...mergedBatch.map((item) => item.id)],
      recentArtists,
      blockedArtistNames,
      seedStacks,
      signal,
    });
    mergedBatch.push(...response.items);
    exhausted = response.exhausted;
    if (mergedBatch.length >= 18 || mode !== 'for-you') break;

    const nextSeed = pickSeedTrack(
      allTracks,
      user?.favoriteTrackIds || [],
      appendUnique(recentSeedIds, seedCursor.id)
    );
    if (!nextSeed || nextSeed.id === seedCursor.id) break;
    seedCursor = nextSeed;
  }

  if (mode === 'for-you' && mergedBatch.length < 8) {
    const nextSeed = pickSeedTrack(allTracks, user?.favoriteTrackIds || [], recentSeedIds);
    if (nextSeed && nextSeed.id !== seed.id) {
      const fallback = await buildFeedBatch({
        mode,
        seedTrack: nextSeed,
        prioritizedSeeds,
        favoriteArtistNames,
        downloadedTrackIds: downloadedTrackIds.filter((id) => !id.startsWith('radooga-')),
        seenCandidateIds: [...seenIds, ...sessionExcludedCandidateIds, ...mergedBatch.map((item) => item.id)],
        recentArtists,
        blockedArtistNames,
        seedStacks,
        signal,
      });
      mergedBatch = [...mergedBatch, ...fallback.items].filter(
        (item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index
      );
      exhausted = fallback.exhausted && mergedBatch.length === 0;
    }
  }

  return { seedTrack: seed, batch: mergedBatch, exhausted };
};

export const useRadoogaStore = create<RadoogaState>((set, get) => ({
  mode: 'for-you',
  seedTrackId: null,
  lastTrackSeedId: null,
  trackSeed: null,
  items: [],
  currentIndex: 0,
  seenIds: [],
  seenArtists: [],
  likedInSession: [],
  recentLikedSeedIds: [],
  blockedArtistNames: [],
  skippedInSession: [],
  recentSeedIds: [],
  isLoading: false,
  isPrefetching: false,
  isRefreshing: false,
  isExhaustedTemporary: false,
  error: null,
  sessionCursor: 0,
  sessionExcludedCandidateIds: [],
  statsByMode: {
    'for-you': fallbackStats(),
    'track-seed': fallbackStats(),
  },

  openForYouFeed: async () => {
    const requestId = ++latestFeedLoadRequestId;
    set({ mode: 'for-you', seedTrackId: null, trackSeed: null, isLoading: true, error: null, items: [], currentIndex: 0 });
    try {
      const state = get();
      const { seedTrack, batch } = await createFeedBatch('for-you', null, null, state.seenIds, state.seenArtists, state.recentLikedSeedIds, state.blockedArtistNames, state.sessionExcludedCandidateIds, state.recentSeedIds);
      if (requestId !== latestFeedLoadRequestId) {
        return;
      }
      set((prev) => ({
        isLoading: false,
        items: batch,
        currentIndex: 0,
        sessionCursor: 0,
        isExhaustedTemporary: false,
        error: batch.length === 0 ? 'Не удалось собрать ленту. Добавьте треки в библиотеку.' : null,
        recentSeedIds: seedTrack ? appendUnique(prev.recentSeedIds.slice(-9), seedTrack.id) : prev.recentSeedIds,
        sessionExcludedCandidateIds: batch.map((item) => item.id).slice(-400),
      }));
    } catch {
      if (requestId === latestFeedLoadRequestId) {
        set({ isLoading: false, error: 'Не удалось загрузить ленту.' });
      }
    }
  },

  openTrackFeed: async (seedTrackId: string, seedTrack?: SeedTrack) => {
    const requestId = ++latestFeedLoadRequestId;
    set({
      mode: 'track-seed',
      seedTrackId,
      lastTrackSeedId: seedTrackId,
      trackSeed: seedTrack || null,
      isLoading: true,
      error: null,
      items: [],
      currentIndex: 0,
    });
    try {
      const state = get();
      const { seedTrack: resolvedSeedTrack, batch } = await createFeedBatch('track-seed', seedTrackId, seedTrack || null, state.seenIds, state.seenArtists, state.recentLikedSeedIds, state.blockedArtistNames, state.sessionExcludedCandidateIds, state.recentSeedIds);
      if (requestId !== latestFeedLoadRequestId) {
        return;
      }
      set((prev) => ({
        isLoading: false,
        items: batch,
        currentIndex: 0,
        sessionCursor: 0,
        isExhaustedTemporary: false,
        error: batch.length === 0 ? 'Пока нет похожих треков для выбранного seed.' : null,
        trackSeed: resolvedSeedTrack || prev.trackSeed,
        recentSeedIds: resolvedSeedTrack ? appendUnique(prev.recentSeedIds.slice(-9), resolvedSeedTrack.id) : prev.recentSeedIds,
        sessionExcludedCandidateIds: batch.map((item) => item.id).slice(-400),
      }));
    } catch {
      if (requestId === latestFeedLoadRequestId) {
        set({ isLoading: false, error: 'Не удалось загрузить ленту по треку.' });
      }
    }
  },

  nextCard: async () => {
    const state = get();
    const hasNext = state.currentIndex < state.items.length - 1;
    if (hasNext) {
      set((prev) => ({
        currentIndex: prev.currentIndex + 1,
        sessionCursor: prev.sessionCursor + 1,
        statsByMode: {
          ...prev.statsByMode,
          [prev.mode]: {
            ...prev.statsByMode[prev.mode],
            impressions: prev.statsByMode[prev.mode].impressions + 1,
          },
        },
      }));
      if (state.items.length - (state.currentIndex + 1) <= 4) {
        void get().prefetchNextBatch();
      }
      return;
    }
    const lengthBefore = state.items.length;
    await get().prefetchNextBatch();
    set((prev) => {
      const hasFresh = prev.items.length > lengthBefore;
      return {
        currentIndex: hasFresh ? Math.min(prev.currentIndex + 1, Math.max(prev.items.length - 1, 0)) : prev.currentIndex,
        sessionCursor: prev.sessionCursor + (hasFresh ? 1 : 0),
        isExhaustedTemporary: !hasFresh,
        statsByMode: {
          ...prev.statsByMode,
          [prev.mode]: {
            ...prev.statsByMode[prev.mode],
            impressions: prev.statsByMode[prev.mode].impressions + 1,
          },
        },
      };
    });
  },

  prevCard: () => {
    set((prev) => ({
      currentIndex: prev.currentIndex > 0 ? prev.currentIndex - 1 : 0,
    }));
  },

  markSeen: (candidateId: string) => {
    set((prev) => {
      const candidate = prev.items.find((item) => item.id === candidateId);
      return {
        seenIds: appendUnique(prev.seenIds, candidateId).slice(-2000),
        seenArtists: candidate?.artist
          ? [...prev.seenArtists, candidate.artist].slice(-2000)
          : prev.seenArtists,
      };
    });
  },

  likeCurrent: () => {
    const state = get();
    const item = state.items[state.currentIndex];
    if (!item) return null;
    set((prev) => ({
      likedInSession: appendUnique(prev.likedInSession, item.id),
      seenIds: appendUnique(prev.seenIds, item.id),
      recentLikedSeedIds: appendUnique(prev.recentLikedSeedIds, item.sourceSeedTrackId || item.id).slice(-50),
      statsByMode: {
        ...prev.statsByMode,
        [prev.mode]: {
          ...prev.statsByMode[prev.mode],
          likes: prev.statsByMode[prev.mode].likes + 1,
        },
      },
    }));
    return item.id;
  },

  dislikeCurrentArtist: () => {
    const state = get();
    const item = state.items[state.currentIndex];
    if (!item?.artist) return null;
    set((prev) => ({
      blockedArtistNames: appendUnique(prev.blockedArtistNames, item.artist),
      items: prev.items.filter((candidate) => candidate.artist.trim().toLowerCase() !== item.artist.trim().toLowerCase()),
      currentIndex: Math.min(prev.currentIndex, Math.max(prev.items.length - 2, 0)),
      sessionExcludedCandidateIds: appendUnique(prev.sessionExcludedCandidateIds, item.id).slice(-800),
    }));
    return item.artist;
  },

  skipCurrent: () => {
    const state = get();
    const item = state.items[state.currentIndex];
    if (!item) return;
    set((prev) => ({
      skippedInSession: appendUnique(prev.skippedInSession, item.id),
      seenIds: appendUnique(prev.seenIds, item.id),
      statsByMode: {
        ...prev.statsByMode,
        [prev.mode]: {
          ...prev.statsByMode[prev.mode],
          skips: prev.statsByMode[prev.mode].skips + 1,
        },
      },
    }));
  },

  prefetchNextBatch: async () => {
    const state = get();
    if (state.isPrefetching) return;
    set({ isPrefetching: true });
    try {
      const { seedTrackId, mode, seenIds, seenArtists, recentLikedSeedIds, blockedArtistNames, sessionExcludedCandidateIds, recentSeedIds } = get();
      const { batch, seedTrack, exhausted } = await createFeedBatch(mode, seedTrackId, mode === 'track-seed' ? state.trackSeed : null, seenIds, seenArtists, recentLikedSeedIds, blockedArtistNames, sessionExcludedCandidateIds, recentSeedIds);
      if (batch.length > 0) {
        set((prev) => ({
          items: [...prev.items, ...batch].filter(
            (item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index
          ),
          recentSeedIds: seedTrack ? appendUnique(prev.recentSeedIds.slice(-9), seedTrack.id) : prev.recentSeedIds,
          isExhaustedTemporary: false,
          error: null,
          sessionExcludedCandidateIds: [...prev.sessionExcludedCandidateIds, ...batch.map((item) => item.id)].slice(-1200),
        }));
      } else if (exhausted) {
        set({ error: 'Пока не нашли новые рекомендации. Потяните ленту, чтобы обновить.', isExhaustedTemporary: true });
      }
    } finally {
      set({ isPrefetching: false });
    }
  },

  refreshFeed: async () => {
    const state = get();
    if (state.isRefreshing) return;
    set({ isRefreshing: true, error: null });
    try {
      const nextSeen = state.seenIds;
      const nextSeenArtists = state.seenArtists;
      const nextRecentSeeds = state.mode === 'track-seed'
        ? state.recentSeedIds
        : [];
      const { seedTrack, batch } = await createFeedBatch(
        state.mode,
        state.mode === 'track-seed' ? state.seedTrackId : null,
        state.mode === 'track-seed' ? state.trackSeed : null,
        nextSeen,
        nextSeenArtists,
        state.recentLikedSeedIds,
        state.blockedArtistNames,
        state.sessionExcludedCandidateIds,
        nextRecentSeeds
      );
      set((prev) => ({
        items: batch,
        currentIndex: 0,
        sessionCursor: 0,
        seenIds: nextSeen,
        seenArtists: nextSeenArtists,
        skippedInSession: [],
        likedInSession: prev.likedInSession,
        isExhaustedTemporary: false,
        recentSeedIds: seedTrack ? appendUnique(prev.recentSeedIds.slice(-9), seedTrack.id) : prev.recentSeedIds,
        sessionExcludedCandidateIds: batch.map((item) => item.id).slice(-400),
        error: batch.length === 0 ? 'Не удалось обновить ленту.' : null,
      }));
    } finally {
      set({ isRefreshing: false });
    }
  },
}));
