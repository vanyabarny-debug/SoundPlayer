import { TrackMetadata } from '../store/mockServer';

export type RadoogaMode = 'for-you' | 'track-seed';

export type ScoreReason =
  | 'same-artist'
  | 'same-genre'
  | 'title-overlap'
  | 'title-too-similar-penalty'
  | 'liked-artist'
  | 'already-downloaded'
  | 'recently-seen'
  | 'artist-repeat-penalty'
  | 'exploration';

export type SeedTrack = {
  id: string;
  title: string;
  artist: string;
  genre?: string;
};

export type SeedStacks = {
  first: SeedTrack[];
  stack2to10: SeedTrack[];
  stack10to50: SeedTrack[];
  stack50plus: SeedTrack[];
};

export type RadoogaCardSurface = 'default' | 'pexels-popular';

export type RadoogaCandidate = {
  id: string;
  title: string;
  artist: string;
  /** Название релиза из iTunes — подсказка для эстетики (phonk в EP и т.п.). */
  collectionName?: string;
  genre?: string;
  artworkUrl?: string;
  previewUrl?: string;
  source: 'itunes';
  sourceSeedTrackId: string;
  score: number;
  reasons: ScoreReason[];
  /** Спотлайт ленты: самый «сильный» трек в батче — фон из Pexels вместо обложки. */
  cardSurface?: RadoogaCardSurface;
};

type ItunesTrackResult = {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  primaryGenreName?: string;
  /** Реже, чем primaryGenreName, но встречается в ответах lookup. */
  genre?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  artworkUrl600?: string;
};

const DISCOVERY_TERMS = [
  'new music',
  'viral hits',
  'indie pop',
  'alt rock',
  'hyperpop',
  'dream pop',
  'lofi chill',
  'russian pop',
  'electronic dance',
  'sad songs',
  'summer vibes',
  'night drive',
  'synthwave',
  'indie electronic',
  'chill electronic',
];

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const splitTokens = (value: string): string[] =>
  normalize(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

const splitStrongTokens = (value: string): string[] =>
  splitTokens(value).filter((token) => token.length >= 3);

const RAP_GENRE_MARKERS = [
  'hip hop',
  'hip-hop',
  'rap',
  'trap',
  'drill',
  'phonk',
  'grime',
];

const isRapLikeGenre = (value: string): boolean => {
  const normalized = normalize(value);
  return RAP_GENRE_MARKERS.some((marker) => normalized.includes(marker));
};

const tokenSimilarity = (left: string[], right: string[]): number => {
  if (left.length === 0 || right.length === 0) return 0;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  leftSet.forEach((token) => {
    if (rightSet.has(token)) intersection += 1;
  });
  const union = new Set([...leftSet, ...rightSet]).size;
  return union > 0 ? intersection / union : 0;
};

const toHighResArtworkUrl = (url?: string): string | undefined => {
  if (!url) return undefined;
  if (url.includes('100x100bb')) return url.replace('100x100bb', '1000x1000bb');
  if (url.includes('100x100')) return url.replace('100x100', '1000x1000');
  return url;
};

const dedupeCandidates = (items: RadoogaCandidate[]): RadoogaCandidate[] => {
  const seen = new Set<string>();
  const next: RadoogaCandidate[] = [];
  for (const item of items) {
    const key = `${normalize(item.title)}::${normalize(item.artist)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }
  return next;
};

const randomPick = <T>(items: T[]): T | null => {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] || null;
};

const randomSubset = <T>(items: T[], count: number): T[] => shuffle(items).slice(0, count);

const shuffle = <T>(items: T[]): T[] => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const interleaveByArtist = (items: RadoogaCandidate[]): RadoogaCandidate[] => {
  const byArtist = new Map<string, RadoogaCandidate[]>();
  for (const item of items) {
    const artistKey = normalize(item.artist);
    if (!byArtist.has(artistKey)) byArtist.set(artistKey, []);
    byArtist.get(artistKey)?.push(item);
  }
  const buckets = Array.from(byArtist.values()).map((bucket) => shuffle(bucket));
  const output: RadoogaCandidate[] = [];
  let progress = true;
  while (progress) {
    progress = false;
    for (const bucket of buckets) {
      const next = bucket.shift();
      if (!next) continue;
      output.push(next);
      progress = true;
    }
  }
  return output;
};

const REMIX_MARKERS = [
  'remix',
  'mix',
  'edit',
  'sped up',
  'slowed',
  'nightcore',
  'version',
  'flip',
  'bootleg',
  'rework',
];

const extractVariantKey = (title: string): string => {
  const normalized = normalize(title);
  const marker = REMIX_MARKERS.find((token) => normalized.includes(token));
  if (!marker) return 'original';
  return marker;
};

const spreadVariantTypes = (items: RadoogaCandidate[]): RadoogaCandidate[] => {
  if (items.length <= 2) return items;
  const queue = [...items];
  const result: RadoogaCandidate[] = [];

  while (queue.length > 0) {
    const lastA = result[result.length - 1];
    const lastB = result[result.length - 2];
    const lastVariantA = lastA ? extractVariantKey(lastA.title) : '';
    const lastVariantB = lastB ? extractVariantKey(lastB.title) : '';
    const nextIndex = queue.findIndex((candidate) => {
      const variant = extractVariantKey(candidate.title);
      if (!lastVariantA) return true;
      if (variant !== lastVariantA) return true;
      return Boolean(lastVariantB) && variant !== lastVariantB;
    });
    const pickIndex = nextIndex === -1 ? 0 : nextIndex;
    const [picked] = queue.splice(pickIndex, 1);
    if (picked) result.push(picked);
  }

  return result;
};

export const trackToSeed = (track: TrackMetadata): SeedTrack => ({
  id: track.id,
  title: track.title,
  artist: track.artistIds?.[0] || 'Unknown artist',
});

export const pickSeedTrack = (
  allTracks: TrackMetadata[],
  favoriteTrackIds: string[],
  recentlyUsedSeedIds: string[]
): SeedTrack | null => {
  const byId = new Map(allTracks.map((track) => [track.id, track]));
  const favoriteTracks = favoriteTrackIds
    .map((id) => byId.get(id))
    .filter((track): track is TrackMetadata => Boolean(track));

  const candidates = favoriteTracks.length > 0 ? favoriteTracks : allTracks;
  if (candidates.length === 0) return null;

  const fresh = candidates.filter((track) => !recentlyUsedSeedIds.includes(track.id));
  const selected = randomPick(fresh.length > 0 ? fresh : candidates);
  return selected ? trackToSeed(selected) : null;
};

const searchItunesSongs = async (term: string, signal?: AbortSignal): Promise<ItunesTrackResult[]> => {
  const query = term.trim();
  if (!query) return [];
  const response = await fetch(
    `https://itunes.apple.com/search?entity=song&limit=35&term=${encodeURIComponent(query)}`,
    { signal }
  );
  if (!response.ok) return [];
  const payload = await response.json() as { results?: ItunesTrackResult[] };
  return payload.results || [];
};

const searchItunesWithEntropy = async (term: string, signal?: AbortSignal): Promise<ItunesTrackResult[]> => {
  const query = term.trim();
  if (!query) return [];
  const entropyToken = Math.random() > 0.5 ? String(new Date().getUTCFullYear()) : String((Math.floor(Math.random() * 9) + 1) * 11);
  return searchItunesSongs(`${query} ${entropyToken}`, signal);
};

const createCandidate = (seed: SeedTrack, item: ItunesTrackResult): RadoogaCandidate | null => {
  if (!item.trackId || !item.trackName || !item.artistName) return null;
  const genreRaw = item.primaryGenreName || item.genre;
  return {
    id: String(item.trackId),
    title: String(item.trackName),
    artist: String(item.artistName),
    collectionName: item.collectionName ? String(item.collectionName) : undefined,
    genre: genreRaw ? String(genreRaw) : undefined,
    artworkUrl: toHighResArtworkUrl(item.artworkUrl600 || item.artworkUrl100),
    previewUrl: item.previewUrl,
    source: 'itunes',
    sourceSeedTrackId: seed.id,
    score: 0,
    reasons: [],
  };
};

export const fetchCandidatesForSeed = async (seed: SeedTrack, signal?: AbortSignal): Promise<RadoogaCandidate[]> => {
  const titleTokens = splitTokens(seed.title).slice(0, 4);
  const artistTokens = splitTokens(seed.artist).slice(0, 3);
  const queryVariants = Array.from(
    new Set([
      `${seed.artist} ${seed.title}`.trim(),
      seed.artist.trim(),
      `${seed.artist} ${splitTokens(seed.title).slice(0, 2).join(' ')}`.trim(),
      `${artistTokens.slice(0, 2).join(' ')} ${titleTokens.slice(0, 2).join(' ')}`.trim(),
      titleTokens.slice(0, 2).join(' ').trim(),
      artistTokens.slice(0, 2).join(' ').trim(),
      seed.genre?.trim() || '',
    ].filter(Boolean))
  );

  const settled = await Promise.allSettled(
    queryVariants.slice(0, 6).map((term) => searchItunesWithEntropy(term, signal))
  );

  const raw: RadoogaCandidate[] = [];
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    for (const item of result.value) {
      const candidate = createCandidate(seed, item);
      if (candidate) raw.push(candidate);
    }
  }

  return dedupeCandidates(raw).filter((item) => item.previewUrl);
};

const fetchCandidatesForSeedStable = async (seed: SeedTrack, signal?: AbortSignal): Promise<RadoogaCandidate[]> => {
  const titleTokens = splitTokens(seed.title).slice(0, 4);
  const artistTokens = splitTokens(seed.artist).slice(0, 3);
  const queryVariants = Array.from(
    new Set([
      `${seed.artist} ${seed.title}`.trim(),
      seed.artist.trim(),
      `${seed.artist} ${splitTokens(seed.title).slice(0, 2).join(' ')}`.trim(),
      `${artistTokens.slice(0, 2).join(' ')} ${titleTokens.slice(0, 2).join(' ')}`.trim(),
      titleTokens.slice(0, 2).join(' ').trim(),
      artistTokens.slice(0, 2).join(' ').trim(),
      seed.genre?.trim() || '',
    ].filter(Boolean))
  );

  const settled = await Promise.allSettled(
    queryVariants.slice(0, 5).map((term) => searchItunesSongs(term, signal))
  );

  const raw: RadoogaCandidate[] = [];
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    for (const item of result.value) {
      const candidate = createCandidate(seed, item);
      if (candidate) raw.push(candidate);
    }
  }
  return dedupeCandidates(raw).filter((item) => item.previewUrl);
};

const fetchDiscoveryCandidates = async (seed: SeedTrack, signal?: AbortSignal): Promise<RadoogaCandidate[]> => {
  const seedHints = [seed.genre, seed.artist, splitTokens(seed.title).slice(0, 2).join(' ')].filter(Boolean) as string[];
  const terms = randomSubset([...DISCOVERY_TERMS, ...seedHints], 5);
  const settled = await Promise.allSettled(terms.map((term) => searchItunesWithEntropy(term, signal)));
  const raw: RadoogaCandidate[] = [];
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    for (const item of result.value) {
      const candidate = createCandidate(seed, item);
      if (candidate) raw.push(candidate);
    }
  }
  return dedupeCandidates(raw).filter((item) => item.previewUrl);
};

type ScoreInput = {
  seed: SeedTrack;
  anchorSeed?: SeedTrack;
  candidates: RadoogaCandidate[];
  favoriteArtistNames: string[];
  downloadedTrackIds: string[];
  seenCandidateIds: string[];
  recentArtists: string[];
  blockedArtistNames?: string[];
  isDiscoveryStep?: boolean;
};

export const scoreCandidates = ({
  seed,
  anchorSeed,
  candidates,
  favoriteArtistNames,
  downloadedTrackIds,
  seenCandidateIds,
  recentArtists,
  blockedArtistNames = [],
  isDiscoveryStep = false,
}: ScoreInput): RadoogaCandidate[] => {
  const seedArtist = normalize(seed.artist);
  const seedGenre = normalize(seed.genre || '');
  const seedTitleTokens = new Set(splitTokens(seed.title));
  const anchor = anchorSeed || seed;
  const anchorArtist = normalize(anchor.artist);
  const anchorGenre = normalize(anchor.genre || '');
  const anchorTitleTokens = new Set(splitTokens(anchor.title));
  const likedArtists = new Set(favoriteArtistNames.map((name) => normalize(name)));
  const downloaded = new Set(downloadedTrackIds);
  const seen = new Set(seenCandidateIds);
  const recentArtistSet = new Set(recentArtists.map((name) => normalize(name)));
  const blockedArtists = new Set(blockedArtistNames.map((name) => normalize(name)));

  const scored = candidates.map((candidate) => {
    let score = 0;
    const reasons: ScoreReason[] = [];
    const candidateArtist = normalize(candidate.artist);
    const candidateGenre = normalize(candidate.genre || '');
    const candidateTitleTokens = splitTokens(candidate.title);
    const titleSimilarity = tokenSimilarity(candidateTitleTokens, Array.from(seedTitleTokens));
    const anchorTitleSimilarity = tokenSimilarity(candidateTitleTokens, Array.from(anchorTitleTokens));
    if (blockedArtists.has(candidateArtist)) {
      return { ...candidate, score: -9999, reasons: ['artist-repeat-penalty'] };
    }

    if (candidateArtist.includes(seedArtist) || seedArtist.includes(candidateArtist)) {
      score += 45;
      reasons.push('same-artist');
    }

    if (seedGenre && candidateGenre && seedGenre === candidateGenre) {
      score += 30;
      reasons.push('same-genre');
    }

    if (anchorGenre && candidateGenre && anchorGenre === candidateGenre) {
      score += 18;
      reasons.push('same-genre');
    }

    if (candidateArtist.includes(anchorArtist) || anchorArtist.includes(candidateArtist)) {
      score += 12;
      reasons.push('same-artist');
    }

    // Keep the feed style stable: downrank rap-like genres
    // when the current seed itself is not rap-like.
    if (candidateGenre && isRapLikeGenre(candidateGenre) && !isRapLikeGenre(seedGenre)) {
      score -= 42;
      reasons.push('artist-repeat-penalty');
    }

    const titleOverlap = candidateTitleTokens.some((token) => seedTitleTokens.has(token));
    if (titleOverlap) {
      score += 9;
      reasons.push('title-overlap');
    }

    if (titleSimilarity >= 0.72) {
      score -= 26;
      reasons.push('title-too-similar-penalty');
    }

    if (anchorTitleSimilarity < 0.08 && !candidateArtist.includes(anchorArtist) && !anchorArtist.includes(candidateArtist)) {
      score -= 14;
      reasons.push('title-too-similar-penalty');
    }

    if (isDiscoveryStep && anchorTitleSimilarity < 0.06 && seedGenre && candidateGenre && seedGenre !== candidateGenre) {
      score -= 18;
      reasons.push('recently-seen');
    }

    if (likedArtists.has(candidateArtist)) {
      score += 15;
      reasons.push('liked-artist');
    }

    if (downloaded.has(candidate.id)) {
      score -= 35;
      reasons.push('already-downloaded');
    }

    if (seen.has(candidate.id)) {
      score -= 25;
      reasons.push('recently-seen');
    }

    if (recentArtistSet.has(candidateArtist)) {
      score -= 15;
      reasons.push('artist-repeat-penalty');
    }

    const explorationBoost = Math.floor(Math.random() * 7);
    score += explorationBoost;
    reasons.push('exploration');

    return { ...candidate, score, reasons };
  });

  const ranked = scored.sort((left, right) => right.score - left.score);
  const diversified: RadoogaCandidate[] = [];
  const artistUsage = new Map<string, number>();

  for (const candidate of ranked) {
    const artistKey = normalize(candidate.artist);
    const used = artistUsage.get(artistKey) || 0;
    if (used >= 2) continue;
    artistUsage.set(artistKey, used + 1);
    diversified.push(candidate);
  }

  return diversified.length > 0 ? diversified : ranked;
};

const spreadTitleRuns = (items: RadoogaCandidate[]): RadoogaCandidate[] => {
  if (items.length <= 2) return items;
  const queue = [...items];
  const result: RadoogaCandidate[] = [];
  while (queue.length > 0) {
    const last = result[result.length - 1];
    const lastTitle = last ? normalize(last.title) : '';
    const nextIndex = queue.findIndex((candidate) => normalize(candidate.title) !== lastTitle);
    const pickIndex = nextIndex === -1 ? 0 : nextIndex;
    const [picked] = queue.splice(pickIndex, 1);
    if (picked) result.push(picked);
  }
  return result;
};

const hasSharedStrongTokens = (left: string, right: string): boolean => {
  const leftTokens = new Set(splitStrongTokens(left));
  const rightTokens = splitStrongTokens(right);
  return rightTokens.some((token) => leftTokens.has(token));
};

const spreadSemanticRuns = (items: RadoogaCandidate[]): RadoogaCandidate[] => {
  if (items.length <= 2) return items;
  const queue = [...items];
  const result: RadoogaCandidate[] = [];
  while (queue.length > 0) {
    const previous = result[result.length - 1];
    const nextIndex = queue.findIndex((candidate) => {
      if (!previous) return true;
      const titleClash = hasSharedStrongTokens(candidate.title, previous.title);
      const artistClash = hasSharedStrongTokens(candidate.artist, previous.artist);
      return !titleClash && !artistClash;
    });
    const pickIndex = nextIndex === -1 ? Math.floor(Math.random() * queue.length) : nextIndex;
    const [picked] = queue.splice(pickIndex, 1);
    if (picked) result.push(picked);
  }
  return result;
};

type BuildFeedBatchInput = {
  mode: RadoogaMode;
  seedTrack: SeedTrack;
  prioritizedSeeds?: SeedTrack[];
  seedStacks?: SeedStacks;
  favoriteArtistNames: string[];
  downloadedTrackIds: string[];
  seenCandidateIds: string[];
  recentArtists: string[];
  blockedArtistNames?: string[];
  limit?: number;
  signal?: AbortSignal;
};

export type BuildFeedBatchResult = {
  items: RadoogaCandidate[];
  exhausted: boolean;
  seedUsed: SeedTrack;
};

export const buildFeedBatch = async ({
  mode,
  seedTrack,
  prioritizedSeeds = [],
  seedStacks,
  favoriteArtistNames,
  downloadedTrackIds,
  seenCandidateIds,
  recentArtists,
  blockedArtistNames = [],
  limit = 14,
  signal,
}: BuildFeedBatchInput): Promise<BuildFeedBatchResult> => {
  const recentSeenWindow = seenCandidateIds.slice(-80);
  const recentArtistWindow = recentArtists.slice(-24);
  const chunkTitleSet = new Set<string>();
  const chunkKeySet = new Set<string>();
  const chunkItems: RadoogaCandidate[] = [];
  const seenForChunk = new Set<string>(recentSeenWindow);

  const stackEntries: Array<{ items: SeedTrack[]; weight: number }> = [
    { items: seedStacks?.first || [], weight: 0.4 },
    { items: seedStacks?.stack2to10 || [], weight: 0.3 },
    { items: seedStacks?.stack10to50 || [], weight: 0.2 },
    { items: seedStacks?.stack50plus || [], weight: 0.1 },
  ];
  const weightedStacksPool = stackEntries.flatMap((stack) => {
    const repeats = Math.max(1, Math.round(stack.weight * 10));
    return new Array(repeats).fill(0).flatMap(() => stack.items);
  });
  const weightedSeedPicker = (): SeedTrack => {
    const picked = randomPick(weightedStacksPool);
    return picked || seedTrack;
  };

  const personalSeedPool = [seedTrack, ...prioritizedSeeds]
    .filter((seed, index, array) => array.findIndex((item) => item.id === seed.id) === index)
    .slice(0, mode === 'for-you' ? 8 : 5);
  let currentSeed = randomPick(personalSeedPool) || seedTrack;
  const anchorSeed = seedTrack;
  const strictTrackSeedGenre = mode === 'track-seed' ? normalize(seedTrack.genre || '') : '';
  const maxDiscoveryPicks = Math.max(1, Math.floor(limit * (mode === 'for-you' ? 0.3 : 0.2)));
  let discoveryPicks = 0;
  const maxIterations = limit * 5;
  let iteration = 0;

  while (chunkItems.length < limit && iteration < maxIterations) {
    iteration += 1;
    const discoveryBudgetRemaining = discoveryPicks < maxDiscoveryPicks;
    const preferPersonalStep = mode === 'for-you' ? Math.random() < 0.82 : Math.random() < 0.9;
    const isPersonalStep = !discoveryBudgetRemaining ? true : preferPersonalStep;
    const stepSeed = isPersonalStep ? (randomPick([currentSeed, weightedSeedPicker(), ...personalSeedPool]) || currentSeed) : currentSeed;
    const raw = isPersonalStep
      ? await fetchCandidatesForSeedStable(stepSeed, signal)
      : await fetchDiscoveryCandidates(stepSeed, signal);
    const scored = scoreCandidates({
      seed: stepSeed,
      anchorSeed,
      candidates: raw.map((candidate) => ({
        ...candidate,
        score: candidate.score + (isPersonalStep ? 10 : -6),
      })),
      favoriteArtistNames,
      downloadedTrackIds,
      seenCandidateIds: [...recentSeenWindow, ...Array.from(seenForChunk)],
      recentArtists: recentArtistWindow,
      blockedArtistNames,
      isDiscoveryStep: !isPersonalStep,
    });
    const scopedByGenre = strictTrackSeedGenre
      ? scored.filter((candidate) => normalize(candidate.genre || '') === strictTrackSeedGenre)
      : scored;

    const pick = scopedByGenre.find((candidate) => {
      const titleKey = normalize(candidate.title);
      const compoundKey = `${titleKey}::${normalize(candidate.artist)}`;
      if (chunkTitleSet.has(titleKey)) return false;
      if (chunkKeySet.has(compoundKey)) return false;
      if (seenForChunk.has(candidate.id)) return false;
      return true;
    }) || scopedByGenre.find((candidate) => {
      const compoundKey = `${normalize(candidate.title)}::${normalize(candidate.artist)}`;
      return !chunkKeySet.has(compoundKey) && !seenForChunk.has(candidate.id);
    });

    if (!pick) {
      currentSeed = weightedSeedPicker();
      continue;
    }

    const titleKey = normalize(pick.title);
    const compoundKey = `${titleKey}::${normalize(pick.artist)}`;
    chunkItems.push(pick);
    if (!isPersonalStep) discoveryPicks += 1;
    chunkTitleSet.add(titleKey);
    chunkKeySet.add(compoundKey);
    seenForChunk.add(pick.id);
    currentSeed = {
      id: pick.id,
      title: pick.title,
      artist: pick.artist,
      genre: pick.genre,
    };
  }

  const mixed = interleaveByArtist(shuffle(chunkItems));
  const withRemixSpacing = spreadVariantTypes(mixed);
  const withTitleSpacing = spreadTitleRuns(withRemixSpacing);
  const withSemanticSpacing = spreadSemanticRuns(withTitleSpacing);
  const sliced = withSemanticSpacing.slice(0, limit);
  let spotlightIndex = 0;
  for (let i = 1; i < sliced.length; i += 1) {
    if (sliced[i].score > sliced[spotlightIndex].score) spotlightIndex = i;
  }
  const items =
    sliced.length === 0
      ? sliced
      : sliced.map((candidate, index) =>
          (index <= 1 || index === spotlightIndex || index % 2 === 0)
            ? { ...candidate, cardSurface: 'pexels-popular' as const }
            : candidate
        );
  return {
    items,
    exhausted: withSemanticSpacing.length < limit,
    seedUsed: seedTrack,
  };
};
