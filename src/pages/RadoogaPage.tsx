import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Heart, Loader2, Send, ThumbsDown, Volume2, VolumeX } from 'lucide-react';
import { useRadoogaStore } from '../store/radoogaStore';
import { usePlayerStore } from '../store/playerStore';
import { useMockServer } from '../store/mockServer';
import { useAuthStore } from '../store/authStore';
import { saveImageFile } from '../lib/db';
import { CachedImage } from '../components/CachedImage';
import { RadoogaAudioVisualizer } from '../components/RadoogaAudioVisualizer';
import { AddToPlaylistModal } from '../components/AddToPlaylistModal';
import { extractFeaturingArtists, listRadoogaPerformers, resolveArtistRoute, splitArtistField } from '../lib/artistRouting';
import { RadoogaCarousel } from '../components/RadoogaCarousel';
import {
  ArtistMediaItem,
  RadoogaConcertItem,
  RadoogaFactItem,
  RadoogaNewsItem,
  RadoogaPhotoItem,
  RadoogaPexelsClip,
  RadoogaVideoItem,
  buildArtistMediaTimeline,
  resolveArtistPhotos,
  resolveFacts,
  resolveLiveNews,
  resolveLyricsSnippet,
  getPexelsAmbientFallbackClips,
  pickPexelsAmbientFallbackClips,
  markRecentPexelsClipsShown,
  resolvePexelsClips,
  resolveRandomPexelsClips,
  resolveTrackVideo,
  resolveUpcomingConcerts,
} from '../lib/radoogaContentSources';
import { chunkLyricsForDisplay, resolveLyricsChunkByProgress } from '../lib/radoogaLyricsStyle';
import type { RadoogaCandidate, SeedTrack } from '../lib/radoogaRecommendations';
import { pushNavigationEntry } from '../lib/navigationHistory';
import { resolveArtistDescriptionRu } from '../lib/wikiDescriptions';
import { ensureArtistBannerFromTrackCover } from '../lib/artistBannerCache';
import { upsertPreviewOnlyTrack } from '../lib/previewFallback';

type EnrichPayload = {
  lyrics: string | null;
  facts: RadoogaFactItem | null;
  news: RadoogaNewsItem[];
  photos: RadoogaPhotoItem[];
  concerts: RadoogaConcertItem[];
  video: RadoogaVideoItem | null;
  pexelsClips: RadoogaPexelsClip[];
  artistMedia: ArtistMediaItem[];
  resolverErrors: string[];
};

type EnrichActiveLayer = 'lyrics' | 'fact' | 'news' | 'photos' | 'video' | 'concerts' | 'cover';
type FeedDirection = 'next' | 'prev';

/** Слои полноэкранной ротации. Pexels-клипы подгружаются отдельно и отмечаются галочкой на обложке, без отдельного слоя. */
const getEnrichAvailableLayers = (payload: EnrichPayload): EnrichActiveLayer[] => {
  const available: EnrichActiveLayer[] = [];
  if (payload.video) available.push('video');
  if (payload.news.length > 0) available.push('news');
  if (payload.photos.length > 0) available.push('photos');
  if (payload.concerts.length > 0) available.push('concerts');
  if (payload.facts) available.push('fact');
  if (payload.lyrics) available.push('lyrics');
  available.push('cover');
  return available;
};

const FEED_CHUNK_SIZE = 8;
const ENRICH_PREFETCH_CONCURRENCY = 2;

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

/** Пустой список Pexels для spotlight нельзя брать из кеша — иначе после появления API клипы не подтянутся. */
const enrichCacheIsComplete = (track: RadoogaCandidate, cached: EnrichPayload): boolean => {
  if (!Array.isArray(cached.pexelsClips)) return false;
  if (track.cardSurface === 'pexels-popular' && cached.pexelsClips.length === 0) return false;
  return true;
};

export function RadoogaPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const navigateWithHistory = (to: string) => {
    pushNavigationEntry({
      path: `${window.location.pathname}${window.location.search}`,
      state: { restorePageScrollTop: window.scrollY || 0 },
    });
    navigate(to);
  };
  const modeParam = searchParams.get('mode');
  const seedParam = searchParams.get('seed');

  const [downloadInFlightIds, setDownloadInFlightIds] = useState<Record<string, true>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [addingToPlaylistTrackId, setAddingToPlaylistTrackId] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<'idle' | 'downloading' | 'opening' | 'added' | 'exists' | 'error'>('idle');
  const [lyricsSnippet, setLyricsSnippet] = useState<string | null>(null);
  const [factItem, setFactItem] = useState<RadoogaFactItem | null>(null);
  const [isFactExpanded, setIsFactExpanded] = useState(false);
  const [newsItems, setNewsItems] = useState<RadoogaNewsItem[]>([]);
  const [photoItems, setPhotoItems] = useState<RadoogaPhotoItem[]>([]);
  const [concertItems, setConcertItems] = useState<RadoogaConcertItem[]>([]);
  const [videoItem, setVideoItem] = useState<RadoogaVideoItem | null>(null);
  const [pexelsClips, setPexelsClips] = useState<RadoogaPexelsClip[]>([]);
  const [pexelsBgClipIndex, setPexelsBgClipIndex] = useState(0);
  const [resolverErrors, setResolverErrors] = useState<string[]>([]);
  const [isEnrichResolved, setIsEnrichResolved] = useState(false);
  const [activeEnrichLayer, setActiveEnrichLayer] = useState<
    'lyrics' | 'fact' | 'news' | 'photos' | 'video' | 'concerts' | 'cover'
  >('lyrics');
  const [isEnrichLoading, setIsEnrichLoading] = useState(false);
  const [photoCarouselIndex, setPhotoCarouselIndex] = useState(0);
  const [newsCarouselIndex, setNewsCarouselIndex] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [likeAnimKey, setLikeAnimKey] = useState(0);
  const [isInlineWikiExpanded, setIsInlineWikiExpanded] = useState(false);
  const [feedDirection, setFeedDirection] = useState<FeedDirection>('next');
  const rootRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const wheelRefreshCooldownRef = useRef<number>(0);
  const navLockUntilRef = useRef<number>(0);
  const mountedAtRef = useRef<number>(Date.now());
  const didInitFeedRef = useRef(false);
  const prevCardIndexRef = useRef<number>(0);
  const enrichCacheRef = useRef<Record<string, EnrichPayload>>({});
  const enrichInflightRef = useRef<Record<string, Promise<EnrichPayload>>>({});
  const pexelsVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastShownPexelsUrlRef = useRef<string | null>(null);
  /** Направление смены карточки для анимации выхода/входа (как в short-form лентах). */

  const {
    mode,
    seedTrackId,
    lastTrackSeedId,
    trackSeed,
    items,
    currentIndex,
    isLoading,
    isPrefetching,
    isRefreshing,
    isExhaustedTemporary,
    error,
    openForYouFeed,
    openTrackFeed,
    nextCard,
    prevCard,
    likeCurrent,
    likedInSession,
    dislikeCurrentArtist,
    markSeen,
    prefetchNextBatch,
    refreshFeed,
  } = useRadoogaStore();

  const {
    playPreview,
    currentTime,
    duration,
    currentPreviewKey,
    isPlaying,
    isMuted,
    toggleMute,
    setYTTrack,
    playYT,
    stopYT,
  } = usePlayerStore();
  const { currentUserId } = useAuthStore();
  const { users, tracks, artists, addTrack, addArtist, updateUser } = useMockServer();
  const currentUser = currentUserId ? users[currentUserId] : null;
  const resolvedTrackSeedId = seedTrackId || lastTrackSeedId || seedParam || null;

  const activeItem = items[currentIndex] || null;
  const selectedCardSeed: SeedTrack | null = activeItem
    ? {
      id: activeItem.id,
      title: activeItem.title,
      artist: activeItem.artist,
      genre: activeItem.genre,
    }
    : null;
  const activeTrackModeSeed = trackSeed || selectedCardSeed;
  const titleSizeClass = activeItem
    ? (
      activeItem.title.length > 52
        ? 'text-xl'
        : activeItem.title.length > 34
          ? 'text-2xl'
          : 'text-3xl'
    )
    : 'text-3xl';
  const isCurrentCardPreview = currentPreviewKey === (activeItem ? `radooga-${activeItem.id}` : null);
  const previewProgress = isCurrentCardPreview
    ? Math.min(Math.max(currentTime / (duration > 0 ? duration : 30), 0), 1)
    : 0;
  const lyricsChunks = lyricsSnippet ? chunkLyricsForDisplay(lyricsSnippet) : [];
  const currentLyricsChunk = resolveLyricsChunkByProgress(lyricsChunks, previewProgress);
  const chunkIndex = Math.floor(currentIndex / FEED_CHUNK_SIZE);
  const inChunkIndex = currentIndex % FEED_CHUNK_SIZE;
  const chunkSeed = activeItem ? hashString(`${activeItem.id}:${chunkIndex}`) : 0;
  const firstVisualizerSlot = chunkSeed % FEED_CHUNK_SIZE;
  const secondVisualizerSlot = (firstVisualizerSlot + 3 + (chunkSeed % 3)) % FEED_CHUNK_SIZE;
  const visualizerSlotsCount = chunkSeed % 2 === 0 ? 1 : 2;
  const isChunkVisualizerSlot = inChunkIndex === firstVisualizerSlot
    || (visualizerSlotsCount === 2 && inChunkIndex === secondVisualizerSlot);
  const hasNetworkContent =
    Boolean(lyricsSnippet)
    || Boolean(factItem)
    || newsItems.length > 0
    || photoItems.length > 0
    || Boolean(videoItem);
  const currentItem = activeItem;
  const isPopularType = currentItem?.cardSurface === 'pexels-popular';
  const hasClips = pexelsClips.length > 0;
  const currentClipIndex = Math.min(pexelsBgClipIndex, Math.max(0, pexelsClips.length - 1));
  const pexelsBgClip =
    isPopularType && hasClips ? pexelsClips[currentClipIndex] ?? null : null;
  const isPexelsPopularSurface = isPopularType && Boolean(pexelsBgClip) && activeEnrichLayer !== 'photos';
  const shouldUseVisualizer = Boolean(activeItem) && !isPexelsPopularSurface && (
    activeEnrichLayer === 'cover' && activeItem.artworkUrl
      ? false
      : (isChunkVisualizerSlot || !activeItem.artworkUrl || (isEnrichResolved && !hasNetworkContent))
  );
  const isActiveTrackAlreadyDownloaded = Boolean(activeItem) && Object.values(tracks).some(
    (track) =>
      track.title.trim().toLowerCase() === activeItem.title.trim().toLowerCase()
      && (track.artistIds || []).some((artistName) => artistName.trim().toLowerCase() === activeItem.artist.trim().toLowerCase())
  );
  const isActiveTrackLiked = Boolean(activeItem) && (
    likedInSession.includes(activeItem.id)
    || isActiveTrackAlreadyDownloaded
    || (currentUser?.favoriteTrackIds || []).some((trackId) => {
      const track = tracks[trackId];
      return Boolean(
        track
        && track.title.trim().toLowerCase() === activeItem.title.trim().toLowerCase()
        && (track.artistIds || []).some((artistName) => artistName.trim().toLowerCase() === activeItem.artist.trim().toLowerCase())
      );
    })
  );
  const shouldShowInlineWiki = Boolean(
    activeItem
    && factItem
    && !isEnrichLoading
    && hashString(`inline-fact:${activeItem.id}`) % 10 < 6
  );

  const cardVariants = {
    enter: (direction: FeedDirection) => ({
      y: direction === 'next' ? '100%' : '-100%',
      opacity: 1,
    }),
    center: {
      y: '0%',
      opacity: 1,
    },
    exit: (direction: FeedDirection) => ({
      y: direction === 'next' ? '-100%' : '100%',
      opacity: 1,
    }),
  };

  useEffect(() => {
    const previous = prevCardIndexRef.current;
    if (currentIndex > previous) {
      setFeedDirection('next');
    } else if (currentIndex < previous) {
      setFeedDirection('prev');
    }
    prevCardIndexRef.current = currentIndex;
  }, [currentIndex]);

  const selectBestEnrichLayer = (payload: EnrichPayload, cardIndex: number): EnrichActiveLayer => {
    const available = getEnrichAvailableLayers(payload);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('Radooga availableLayers', {
        cardIndex,
        ambientClips: (payload.pexelsClips ?? []).length,
        available,
      });
    }
    const cycle: EnrichActiveLayer[] = [
      'cover', 'photos', 'cover', 'video', 'cover', 'fact',
      'cover', 'photos', 'cover', 'concerts', 'cover', 'lyrics',
      'cover', 'video', 'cover', 'photos', 'cover', 'fact',
      'cover', 'concerts', 'cover', 'photos', 'cover', 'news',
      'cover', 'cover', 'cover', 'photos', 'cover', 'cover',
    ];
    const len = cycle.length;
    const preferred = cycle[cardIndex % len];
    if (available.includes(preferred)) return preferred;
    for (let step = 1; step < len; step += 1) {
      const p = cycle[(cardIndex + step) % len];
      if (available.includes(p)) return p;
    }
    return available.includes('cover') ? 'cover' : available[0] || 'cover';
  };

  const applyEnrichPayload = (payload: EnrichPayload) => {
    setLyricsSnippet(payload.lyrics);
    setFactItem(payload.facts);
    setNewsItems(payload.news);
    setPhotoItems(payload.photos);
    setConcertItems(payload.concerts);
    setVideoItem(payload.video);
    setPexelsClips(payload.pexelsClips ?? []);
    setResolverErrors(payload.resolverErrors);
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a82d9a'},body:JSON.stringify({sessionId:'a82d9a',runId:'run1',hypothesisId:'H3',location:'src/pages/RadoogaPage.tsx:229',message:'applyEnrichPayload payload sizes',data:{index:currentIndex,news:payload.news.length,photos:payload.photos.length,concerts:payload.concerts.length,hasVideo:Boolean(payload.video),hasLyrics:Boolean(payload.lyrics),errors:payload.resolverErrors.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const picked = selectBestEnrichLayer(payload, currentIndex);
    const finalLayer = activeItem?.cardSurface === 'pexels-popular' ? 'cover' : picked;
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('applyEnrich picked layer:', picked, 'ambient clips:', (payload.pexelsClips ?? []).length);
    }
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d7795d'},body:JSON.stringify({sessionId:'d7795d',runId:'post-fix',hypothesisId:'H14',location:'src/pages/RadoogaPage.tsx:349',message:'final enrich layer after pexels guard',data:{trackId:activeItem?.id||null,cardSurface:activeItem?.cardSurface||null,pickedLayer:picked,finalLayer,clips:(payload.pexelsClips??[]).length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    setActiveEnrichLayer(finalLayer);
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d7795d'},body:JSON.stringify({sessionId:'d7795d',runId:'run1',hypothesisId:'H5',location:'src/pages/RadoogaPage.tsx:347',message:'applyEnrichPayload clip selection context',data:{trackId:activeItem?.id||null,cardSurface:activeItem?.cardSurface||null,pickedLayer:picked,clips:(payload.pexelsClips??[]).length,firstClipId:payload.pexelsClips?.[0]?.id||null,firstClipUrl:payload.pexelsClips?.[0]?.videoUrl||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (
      activeItem?.cardSurface === 'pexels-popular'
      && (payload.pexelsClips?.length ?? 0) > 0
    ) {
      markRecentPexelsClipsShown(payload.pexelsClips);
    }
  };

  const fetchEnrichPayload = async (item: typeof activeItem): Promise<EnrichPayload> => {
    if (!item) {
      return {
        lyrics: null,
        facts: null,
        news: [],
        photos: [],
        concerts: [],
        video: null,
        pexelsClips: [],
        artistMedia: [],
        resolverErrors: [],
      };
    }
    const [lyrics, facts, news, photos, concerts, video] = await Promise.allSettled([
      resolveLyricsSnippet(item),
      resolveFacts(item),
      resolveLiveNews(item),
      resolveArtistPhotos(item),
      resolveUpcomingConcerts(item),
      resolveTrackVideo(item),
    ]);
    const factValue = facts.status === 'fulfilled' ? facts.value : null;
    const newsValue = news.status === 'fulfilled' ? news.value : [];
    const sanitizedNews = newsValue.filter((newsItem) => {
      const title = (newsItem.title || '').trim();
      const summary = (newsItem.summary || '').trim();
      if (!title && !summary) return false;
      if (newsItem.placeholder) return false;
      if (title === 'Резерв' || title.startsWith('Слот ·')) return false;
      if (summary.includes('Пустая карточка. Смахните влево/вправо')) return false;
      return true;
    });
    const photosValue = photos.status === 'fulfilled' ? photos.value : [];
    const concertsValue = concerts.status === 'fulfilled' ? concerts.value : [];
    const ensuredNews = sanitizedNews;
    const ensuredPhotos = photosValue.length > 0
      ? photosValue
      : [{
        title: `${item.artist} · fallback`,
        url: `data:image/svg+xml;utf8,${encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#111827"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="Arial" font-size="40">${item.artist}</text></svg>`
        )}`,
      }];
    const ensuredConcerts = concertsValue.length > 0
      ? concertsValue
      : [{
        title: `Следите за концертами ${item.artist}`,
        date: new Date().toISOString(),
        url: `https://www.google.com/search?q=${encodeURIComponent(item.artist + ' concerts')}`,
      }];
    const ensuredVideo = video.status === 'fulfilled' ? video.value : null;
    const lyricsValue = lyrics.status === 'fulfilled' ? lyrics.value : null;
    let pexelsClipsValue: RadoogaPexelsClip[] = [];
    try {
      pexelsClipsValue = item.cardSurface === 'pexels-popular'
        ? await resolveRandomPexelsClips()
        : await resolvePexelsClips(item, { lyricsSnippet: lyricsValue });
    } catch {
      pexelsClipsValue = [];
    }
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d7795d'},body:JSON.stringify({sessionId:'d7795d',runId:'run3',hypothesisId:'H13',location:'src/pages/RadoogaPage.tsx:413',message:'pexels strategy result',data:{trackId:item.id,cardSurface:item.cardSurface||null,clips:pexelsClipsValue.length,firstClipId:pexelsClipsValue[0]?.id||null,firstClipUrl:pexelsClipsValue[0]?.videoUrl||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const hadPexelsFromApi = pexelsClipsValue.length > 0;
    if (item.cardSurface === 'pexels-popular' && !hadPexelsFromApi) {
      const fallbackPool = pickPexelsAmbientFallbackClips(6);
      const rawFallback = getPexelsAmbientFallbackClips();
      const start = fallbackPool.length > 0 ? hashString(item.id) % fallbackPool.length : 0;
      const orderedFallback = fallbackPool.length > 0
        ? [...fallbackPool.slice(start), ...fallbackPool.slice(0, start)]
        : [];
      pexelsClipsValue = orderedFallback.slice(0, Math.min(4, orderedFallback.length));
      // #region agent log
      fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d7795d'},body:JSON.stringify({sessionId:'d7795d',runId:'post-fix',hypothesisId:'H8',location:'src/pages/RadoogaPage.tsx:419',message:'fallback clips rotated by track id',data:{trackId:item.id,fallbackPool:fallbackPool.length,rawFallback:rawFallback.length,start,selected:pexelsClipsValue.length,firstClipId:pexelsClipsValue[0]?.id||null,firstClipUrl:pexelsClipsValue[0]?.videoUrl||null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      // #region agent log
      fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d7795d'},body:JSON.stringify({sessionId:'d7795d',runId:'post-fix',hypothesisId:'H9',location:'src/pages/RadoogaPage.tsx:420',message:'fallback clips after recent-filter',data:{trackId:item.id,selectedIds:pexelsClipsValue.map((c)=>c.id),selectedUrls:pexelsClipsValue.map((c)=>c.videoUrl)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }
    const resolverErrors: string[] = [];
    if (lyrics.status === 'rejected') resolverErrors.push('lyrics: не удалось загрузить лирику');
    if (facts.status === 'rejected') resolverErrors.push('facts: не удалось загрузить факты');
    if (news.status === 'rejected') resolverErrors.push('news: не удалось загрузить новости');
    if (photos.status === 'rejected') resolverErrors.push('photos: не удалось загрузить фото');
    if (concerts.status === 'rejected') resolverErrors.push('concerts: не удалось загрузить концерты');
    if (video.status === 'rejected') resolverErrors.push('video: не удалось загрузить клип');
    if (video.status === 'fulfilled' && !ensuredVideo) resolverErrors.push('video: fallback-клип не найден');
    if (item.cardSurface === 'pexels-popular' && !hadPexelsFromApi) {
      if (pexelsClipsValue.length > 0) {
        resolverErrors.push(
          'pexels: нет клипов из API; проверьте PEXELS_API_KEY и что запущен npm run api. Показан запасной ролик.'
        );
      } else {
        resolverErrors.push('pexels: нет клипов из API и запасной ролик недоступен.');
      }
    }
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a82d9a'},body:JSON.stringify({sessionId:'a82d9a',runId:'run1',hypothesisId:'H4',location:'src/pages/RadoogaPage.tsx:262',message:'resolver settle status',data:{trackId:item.id,lyrics:lyrics.status,facts:facts.status,news:news.status,photos:photos.status,concerts:concerts.status,video:video.status,errorCount:resolverErrors.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const payload: EnrichPayload = {
      lyrics: lyricsValue,
      facts: factValue,
      news: ensuredNews,
      photos: ensuredPhotos,
      concerts: ensuredConcerts,
      video: ensuredVideo,
      pexelsClips: pexelsClipsValue,
      artistMedia: buildArtistMediaTimeline(factValue, ensuredNews, ensuredConcerts, ensuredPhotos),
      resolverErrors,
    };
    if (import.meta.env.DEV) {
      const av = getEnrichAvailableLayers(payload);
      // eslint-disable-next-line no-console
      console.log(
        'Enrichment for track:',
        item.title,
        'has pexels clips:',
        pexelsClipsValue.length > 0,
        '(payload.pexelsClips length:',
        pexelsClipsValue.length,
        ') after lyrics'
      );
      // eslint-disable-next-line no-console
      console.log('Radooga availableLayers (enrich done):', item.title, av);
    }
    return payload;
  };

  const getOrFetchEnrichPayload = async (item: typeof activeItem): Promise<EnrichPayload> => {
    if (!item) {
      return {
        lyrics: null,
        facts: null,
        news: [],
        photos: [],
        concerts: [],
        video: null,
        pexelsClips: [],
        artistMedia: [],
        resolverErrors: [],
      };
    }
    const cached = enrichCacheRef.current[item.id];
    if (cached && enrichCacheIsComplete(item, cached)) {
      return cached;
    }
    if (cached) {
      delete enrichCacheRef.current[item.id];
    }
    const inflight = enrichInflightRef.current[item.id];
    if (inflight) return inflight;
    const request = fetchEnrichPayload(item).finally(() => {
      delete enrichInflightRef.current[item.id];
    });
    enrichInflightRef.current[item.id] = request;
    return request;
  };

  useEffect(() => {
    if (didInitFeedRef.current) {
      return;
    }
    didInitFeedRef.current = true;
    if (modeParam === 'track' && seedParam) {
      void openTrackFeed(seedParam);
      return;
    }
    if (mode === 'for-you' && items.length > 0) {
      return;
    }
    void openForYouFeed();
  }, [mode, modeParam, items.length, currentIndex, openForYouFeed, openTrackFeed, seedParam]);
  useEffect(() => {
    mountedAtRef.current = Date.now();
    navLockUntilRef.current = Date.now() + 900;
  }, []);

  useEffect(() => {
    if (mode !== 'track-seed') return;
    if (resolvedTrackSeedId) return;
    void openForYouFeed();
    setLocalError('Сначала откройте рекомендации от конкретного трека.');
  }, [mode, openForYouFeed, resolvedTrackSeedId]);

  useEffect(() => {
    const previousRepeatMode = usePlayerStore.getState().repeatMode;
    usePlayerStore.setState({ repeatMode: 'one' });
    return () => {
      usePlayerStore.setState({ repeatMode: previousRepeatMode });
    };
  }, []);

  useEffect(() => {
    setLikeAnimKey(0);
  }, [activeItem?.id]);

  useEffect(() => {
    if (!activeItem) return;
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d7795d'},body:JSON.stringify({sessionId:'d7795d',runId:'run2',hypothesisId:'H10',location:'src/pages/RadoogaPage.tsx:536',message:'active card surface on screen',data:{trackId:activeItem.id,cardSurface:activeItem.cardSurface||null,currentIndex},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [activeItem?.id, currentIndex]);

  useEffect(() => {
    setIsInlineWikiExpanded(false);
  }, [activeItem?.id]);

  useEffect(() => {
    if (!activeItem) return;
    if (videoItem?.videoId) {
      setYTTrack(videoItem.videoId, `radooga-${activeItem.id}`);
      playYT();
      markSeen(activeItem.id);
      return;
    }
    stopYT();
    if (!activeItem.previewUrl) {
      markSeen(activeItem.id);
      return;
    }
    const queue = [{
      key: `radooga-${activeItem.id}`,
      url: activeItem.previewUrl,
      title: activeItem.title,
      artist: activeItem.artist,
      artworkUrl: activeItem.artworkUrl,
    }];
    playPreview(
      {
        key: `radooga-${activeItem.id}`,
        url: activeItem.previewUrl,
        title: activeItem.title,
        artist: activeItem.artist,
        artworkUrl: activeItem.artworkUrl,
      },
      queue
    );
    markSeen(activeItem.id);
  }, [
    activeItem,
    videoItem?.videoId,
    markSeen,
    playPreview,
    playYT,
    setYTTrack,
    stopYT,
  ]);

  useEffect(() => {
    if (!activeItem) return;
    let isMounted = true;
    const cached = enrichCacheRef.current[activeItem.id];
    if (cached && enrichCacheIsComplete(activeItem, cached)) {
      setIsEnrichResolved(true);
      applyEnrichPayload(cached);
      setIsEnrichLoading(false);
      return () => {
        isMounted = false;
      };
    }
    if (cached && !enrichCacheIsComplete(activeItem, cached)) {
      delete enrichCacheRef.current[activeItem.id];
    }

    setIsEnrichLoading(true);
    setIsEnrichResolved(false);
    setPexelsClips([]);

    void getOrFetchEnrichPayload(activeItem).then((payload) => {
      if (!isMounted) return;
      enrichCacheRef.current[activeItem.id] = payload;
      setIsEnrichResolved(true);
      applyEnrichPayload(payload);
      setIsEnrichLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [activeItem?.id]);

  useEffect(() => {
    const upcoming = items.slice(currentIndex + 1, currentIndex + 6).filter((item) => !enrichCacheRef.current[item.id]);
    if (upcoming.length === 0) return;
    let cancelled = false;

    const runLimitedPrefetch = async () => {
      let cursor = 0;
      const worker = async () => {
        while (!cancelled) {
          const target = upcoming[cursor];
          cursor += 1;
          if (!target) return;
          const payload = await getOrFetchEnrichPayload(target);
          if (cancelled || enrichCacheRef.current[target.id]) continue;
          enrichCacheRef.current[target.id] = payload || {
            lyrics: null,
            facts: null,
            news: [],
            photos: [],
            concerts: [],
            video: null,
            pexelsClips: [],
            artistMedia: [],
            resolverErrors: [],
          };
        }
      };
      await Promise.all(
        new Array(Math.min(ENRICH_PREFETCH_CONCURRENCY, upcoming.length))
          .fill(0)
          .map(() => worker())
      );
    };

    void runLimitedPrefetch();
    return () => {
      cancelled = true;
    };
  }, [currentIndex, items]);

  useEffect(() => {
    if (items.length - currentIndex <= 10) {
      void prefetchNextBatch();
    }
  }, [currentIndex, items.length, prefetchNextBatch]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const remaining = items.length - currentIndex;
      if (remaining <= 10 && !isPrefetching && !isLoading) {
        void prefetchNextBatch();
      }
    }, 700);
    return () => window.clearInterval(interval);
  }, [currentIndex, isLoading, isPrefetching, items.length, prefetchNextBatch]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (Date.now() - mountedAtRef.current < 900) return;
      if (isFactExpanded && event.key === 'Escape') {
        event.preventDefault();
        setIsFactExpanded(false);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        void nextCard();
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (currentIndex === 0) {
          void refreshFeed();
        } else {
          prevCard();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentIndex, isFactExpanded, nextCard, prevCard, refreshFeed]);

  const onWheel = async (event: React.WheelEvent<HTMLDivElement>) => {
    if (Date.now() - mountedAtRef.current < 900) return;
    event.preventDefault();
    const now = Date.now();
    if (now < navLockUntilRef.current) return;
    if (Math.abs(event.deltaY) < 18) return;
    navLockUntilRef.current = now + 320;
    if (event.deltaY > 0) {
      await nextCard();
    } else {
      if (currentIndex === 0 && now - wheelRefreshCooldownRef.current > 800) {
        wheelRefreshCooldownRef.current = now;
        await refreshFeed();
      } else if (currentIndex > 0) {
        prevCard();
      }
    }
  };

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
    setPullDistance(0);
  };

  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (currentIndex !== 0) return;
    const startY = touchStartYRef.current;
    const currentY = event.touches[0]?.clientY ?? null;
    if (startY === null || currentY === null) return;
    const deltaY = Math.max(0, currentY - startY);
    setPullDistance(Math.min(deltaY, 120));
  };

  const onTouchEnd = async (event: React.TouchEvent<HTMLDivElement>) => {
    if (Date.now() - mountedAtRef.current < 900) return;
    const now = Date.now();
    if (now < navLockUntilRef.current) return;
    const startY = touchStartYRef.current;
    const endY = event.changedTouches[0]?.clientY ?? null;
    touchStartYRef.current = null;
    if (startY === null || endY === null) return;
    const deltaY = endY - startY;
    setPullDistance(0);
    const threshold = 52;
    if (Math.abs(deltaY) < threshold) return;
    navLockUntilRef.current = now + 320;
    if (deltaY < 0) {
      await nextCard();
      return;
    }
    if (currentIndex === 0) {
      if (deltaY > 96) {
        await refreshFeed();
      }
      return;
    }
    prevCard();
  };

  const queueBackgroundDownload = async (candidate: NonNullable<typeof activeItem>): Promise<string | null> => {
    if (downloadInFlightIds[candidate.id]) return null;
    setDownloadInFlightIds((prev) => ({ ...prev, [candidate.id]: true }));
    try {
      const artistParts = splitArtistField(candidate.artist);
      const allArtistNames = listRadoogaPerformers(candidate.artist, candidate.title);
      const featureOnlyNames = Array.from(
        new Set([
          ...artistParts.featuringArtists,
          ...extractFeaturingArtists(candidate.title),
        ].map((n) => n.trim()).filter(Boolean))
      );
      for (const artistName of allArtistNames) {
        const existingArtist = Object.values(useMockServer.getState().artists).find(
          (artist) => artist.name.trim().toLowerCase() === artistName.trim().toLowerCase()
        );
        if (!existingArtist) {
          const wikiProfile = await resolveArtistDescriptionRu(artistName, {
            fallbackDescription: `${artistName} - артист из рекомендаций Radooga.`,
          });
          const artistId = `artist-${Date.now()}-${artistName.toLowerCase().replace(/\s+/g, '-')}`;
          addArtist({
            id: artistId,
            name: artistName,
            description: wikiProfile.description,
            ownerId: currentUserId || undefined,
          });
          if (candidate.artworkUrl) {
            await ensureArtistBannerFromTrackCover({
              artist: {
                id: artistId,
                name: artistName,
                description: wikiProfile.description,
                ownerId: currentUserId || undefined,
              },
              coverUrl: candidate.artworkUrl,
              updateArtist: useMockServer.getState().updateArtist,
            });
          }
        } else if (candidate.artworkUrl) {
          await ensureArtistBannerFromTrackCover({
            artist: existingArtist,
            coverUrl: candidate.artworkUrl,
            updateArtist: useMockServer.getState().updateArtist,
          });
        }
      }

      const targetTrackId = `radooga-${Date.now()}-${candidate.id}`;
      let coverId: string | undefined;
      if (candidate.artworkUrl) {
        try {
          const coverResponse = await fetch(candidate.artworkUrl);
          if (coverResponse.ok) {
            coverId = `cover-${targetTrackId}`;
            await saveImageFile(coverId, await coverResponse.blob());
          }
        } catch {
          // ignore cover fetch failures
        }
      }
      const liveState = useMockServer.getState();
      const existingTrack = Object.values(liveState.tracks).find(
        (track) => track.title.trim().toLowerCase() === candidate.title.trim().toLowerCase()
          && (track.artistIds || []).some((artistName) => artistName.trim().toLowerCase() === candidate.artist.trim().toLowerCase())
      );
      const finalTrackId = existingTrack?.id || targetTrackId;
      if (!existingTrack) {
        addTrack({
          id: finalTrackId,
          title: candidate.title,
          artistIds: allArtistNames.length > 0 ? allArtistNames : [candidate.artist],
          duration: 30,
          isExplicit: false,
          isSingle: true,
          format: 'mp3',
          coverUrl: coverId,
          ownerId: currentUserId || 'system',
          lyrics: undefined,
          features: featureOnlyNames,
          previewUrl: candidate.previewUrl,
          isPreviewOnly: true,
        });
      } else if (coverId) {
        liveState.updateTrack(existingTrack.id, {
          coverUrl: coverId || existingTrack.coverUrl,
          previewUrl: candidate.previewUrl || existingTrack.previewUrl,
          isPreviewOnly: true,
        });
      }
      const authState = useAuthStore.getState();
      const refreshedState = useMockServer.getState();
      const refreshedUser = authState.currentUserId ? refreshedState.users[authState.currentUserId] : null;
      if (refreshedUser) {
        const favoriteTrackIds = refreshedUser.favoriteTrackIds || [];
        const nextFavorites = [
          finalTrackId,
          ...favoriteTrackIds.filter((trackId) => trackId !== finalTrackId),
        ];
        refreshedState.updateUser(refreshedUser.id, { favoriteTrackIds: nextFavorites });
      }
      return finalTrackId;
    } catch (downloadError) {
      if (candidate.previewUrl) {
        const previewTrackId = upsertPreviewOnlyTrack({
          existingTracks: useMockServer.getState().tracks,
          resultId: candidate.id,
          title: candidate.title,
          artist: candidate.artist,
          artworkUrl: candidate.artworkUrl,
          previewUrl: candidate.previewUrl,
          ownerId: currentUserId || 'system',
          addTrack: useMockServer.getState().addTrack,
          updateTrack: useMockServer.getState().updateTrack,
        });
        setLocalError('Полная версия недоступна, добавили preview-трек. Попробуйте скачать позже.');
        return previewTrackId;
      }
      setLocalError((downloadError as Error).message || 'Не удалось обработать выбранный трек.');
      setSendStatus('error');
      return null;
    } finally {
      setDownloadInFlightIds((prev) => {
        const next = { ...prev };
        delete next[candidate.id];
        return next;
      });
    }
  };

  const handleLike = async () => {
    if (!activeItem) return;
    setLikeAnimKey((k) => k + 1);
    likeCurrent();
    await queueBackgroundDownload(activeItem);
  };
  const findLocalTrackIdByCandidate = (candidate: NonNullable<typeof activeItem>): string | null => {
    const exact = Object.values(tracks).find(
      (track) =>
        track.title.trim().toLowerCase() === candidate.title.trim().toLowerCase()
        && (track.artistIds || []).some((artistName) => artistName.trim().toLowerCase() === candidate.artist.trim().toLowerCase())
    );
    return exact?.id || null;
  };
  const handleSendToPlaylist = async () => {
    if (!activeItem) return;
    if (sendStatus === 'downloading' || sendStatus === 'opening') return;
    const existingTrackId = findLocalTrackIdByCandidate(activeItem);
    if (existingTrackId) {
      setSendStatus('opening');
      setAddingToPlaylistTrackId(existingTrackId);
      return;
    }
    setSendStatus('downloading');
    const downloadedId = await queueBackgroundDownload(activeItem);
    if (downloadedId) {
      setSendStatus('opening');
      setAddingToPlaylistTrackId(downloadedId);
    } else {
      setSendStatus('error');
      window.setTimeout(() => setSendStatus('idle'), 1400);
    }
  };

  const handleDislikeArtist = async () => {
    if (!activeItem) return;
    if (currentUser) {
      const currentDislikes = currentUser.dislikedArtistNames || [];
      const nextDislikes = currentDislikes.includes(activeItem.artist)
        ? currentDislikes
        : [...currentDislikes, activeItem.artist];
      updateUser(currentUser.id, { dislikedArtistNames: nextDislikes });
    }
    dislikeCurrentArtist();
    await nextCard();
  };

  /** Внешние новости и Google не открываются во iframe (X-Frame-Options) — только новая вкладка. */
  const handleOpenSourceInFeed = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed || trimmed.startsWith('data:')) return;
    let openUrl = trimmed;
    if (!/^https?:\/\//i.test(trimmed)) {
      try {
        openUrl = new URL(trimmed, window.location.href).toString();
      } catch {
        return;
      }
    }
    try {
      const parsed = new URL(openUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    } catch {
      return;
    }
    window.open(openUrl, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    setPhotoCarouselIndex(0);
    setNewsCarouselIndex(0);
    setIsFactExpanded(false);
  }, [activeItem?.id, activeEnrichLayer]);

  useEffect(() => {
    if (!activeItem) {
      setPexelsBgClipIndex(0);
      return;
    }
    if (pexelsClips.length === 0) {
      setPexelsBgClipIndex(0);
      return;
    }
    const hashedIndex = hashString(activeItem.id) % pexelsClips.length;
    let nextIndex = hashedIndex;
    const lastShownUrl = lastShownPexelsUrlRef.current;
    if (lastShownUrl && pexelsClips[nextIndex]?.videoUrl === lastShownUrl && pexelsClips.length > 1) {
      const firstDifferent = pexelsClips.findIndex((clip) => clip.videoUrl !== lastShownUrl);
      if (firstDifferent >= 0) nextIndex = firstDifferent;
    }
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d7795d'},body:JSON.stringify({sessionId:'d7795d',runId:'post-fix',hypothesisId:'H11',location:'src/pages/RadoogaPage.tsx:948',message:'computed pexels initial index with dedupe',data:{trackId:activeItem.id,clips:pexelsClips.length,hashedIndex,nextIndex,lastShownUrl,clipId:pexelsClips[nextIndex]?.id||null,clipUrl:pexelsClips[nextIndex]?.videoUrl||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d7795d'},body:JSON.stringify({sessionId:'d7795d',runId:'run4',hypothesisId:'H15',location:'src/pages/RadoogaPage.tsx:951',message:'one video per card selected, rest queued',data:{trackId:activeItem.id,primaryClipIndex:nextIndex,primaryClipUrl:pexelsClips[nextIndex]?.videoUrl||null,queueSize:Math.max(0,pexelsClips.length-1)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    setPexelsBgClipIndex(nextIndex);
  }, [activeItem?.id, pexelsClips.length]);

  useEffect(() => {
    if (!isPexelsPopularSurface) return;
    const currentUrl = pexelsClips[currentClipIndex]?.videoUrl || null;
    if (!currentUrl) return;
    lastShownPexelsUrlRef.current = currentUrl;
  }, [isPexelsPopularSurface, currentClipIndex, pexelsClips[currentClipIndex]?.videoUrl]);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('Card Debug:', { isPopularType, hasClips, activeLayer: activeEnrichLayer });
  }, [isPopularType, hasClips, activeEnrichLayer]);

  useEffect(() => {
    if (!isPexelsPopularSurface) return;
    const el = pexelsVideoRef.current;
    if (!el) return;
    const onError = () => {
      const failedUrl = pexelsClips[currentClipIndex]?.videoUrl || null;
      // #region agent log
      fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d7795d'},body:JSON.stringify({sessionId:'d7795d',runId:'post-fix',hypothesisId:'H12',location:'src/pages/RadoogaPage.tsx:978',message:'pexels video load error, switching clip',data:{trackId:activeItem?.id||null,currentClipIndex,failedUrl,clips:pexelsClips.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (pexelsClips.length > 1) {
        setPexelsBgClipIndex((prev) => (prev + 1) % pexelsClips.length);
      }
    };
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d7795d'},body:JSON.stringify({sessionId:'d7795d',runId:'run1',hypothesisId:'H7',location:'src/pages/RadoogaPage.tsx:959',message:'video element source before play',data:{trackId:activeItem?.id||null,currentClipIndex,videoSrc:pexelsClips[currentClipIndex]?.videoUrl||null,isPopularType,isPexelsPopularSurface},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const run = () => {
      void el.play().catch(() => {});
    };
    run();
    el.addEventListener('error', onError);
    el.addEventListener('loadeddata', run);
    return () => {
      el.removeEventListener('error', onError);
      el.removeEventListener('loadeddata', run);
    };
  }, [isPexelsPopularSurface, currentClipIndex, pexelsClips[currentClipIndex]?.videoUrl]);

  const newsCarouselItems = newsItems.map((item) => ({
    title: item.title,
    summary: item.summary,
    subtitle: [item.source, item.publishedAt].filter(Boolean).join(' · '),
    url: item.url,
    imageUrl: item.imageUrl,
    kind: 'news' as const,
    placeholder: item.placeholder,
  }));
  const photoCarouselItems = photoItems.map((item) => ({
    title: item.title,
    imageUrl: item.url,
    kind: 'photo' as const,
  }));
  const isPhotoLayerActive = !isEnrichLoading && activeEnrichLayer === 'photos' && photoItems.length > 0;
  const isNewsLayerActive = !isEnrichLoading && activeEnrichLayer === 'news' && newsCarouselItems.length > 0;

  const activeCarouselCount = isPhotoLayerActive
    ? Math.min(photoCarouselItems.length, 10)
    : isNewsLayerActive
      ? Math.min(newsCarouselItems.length, 10)
      : 0;
  const activeCarouselIndex = isPhotoLayerActive
    ? photoCarouselIndex
    : isNewsLayerActive
      ? newsCarouselIndex
      : 0;
  const setActiveCarouselIndex = (next: number | ((prev: number) => number)) => {
    if (isPhotoLayerActive) {
      setPhotoCarouselIndex(next);
      return;
    }
    if (isNewsLayerActive) {
      setNewsCarouselIndex(next);
    }
  };
  const isCarouselLayerActive = isPhotoLayerActive || isNewsLayerActive;
  const isLeftArrowDisabled = !isCarouselLayerActive || activeCarouselIndex === 0;
  const isRightArrowDisabled = !isCarouselLayerActive || activeCarouselCount < 2 || activeCarouselIndex >= activeCarouselCount - 1;
  const formatConcertDate = (date?: string): string => {
    if (!date) return 'Дата уточняется';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return 'Дата уточняется';
    return parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const formatSourceHost = (url?: string): string => {
    if (!url) return 'source';
    const match = url.match(/^https?:\/\/([^/]+)/i);
    return (match?.[1] || 'source').replace(/^www\./i, '');
  };

  const radoogaPerformers = useMemo(() => {
    if (!activeItem) return [];
    const list = listRadoogaPerformers(activeItem.artist, activeItem.title);
    return list.length > 0 ? list : [activeItem.artist].filter(Boolean);
  }, [activeItem?.id, activeItem?.artist, activeItem?.title]);
  const hasMultiplePerformers = radoogaPerformers.length > 1;

  const uniqueConcertItems = useMemo(() => {
    const seen = new Set<string>();
    const out: RadoogaConcertItem[] = [];
    for (const row of concertItems) {
      const urlKey = (row.url || '').split(/[?#]/)[0];
      const titleNorm = (row.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const key = urlKey || titleNorm.slice(0, 120);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(row);
      if (out.length >= 6) break;
    }
    return out;
  }, [concertItems]);

  const concertsSourceUrl =
    uniqueConcertItems[0]?.url
    || (activeItem
      ? `https://www.google.com/search?q=${encodeURIComponent(`${activeItem.artist} concert tour dates`)}`
      : '');

  return (
    <>
      <div
      ref={rootRef}
      className="h-full overflow-hidden bg-black text-white"
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="absolute inset-x-0 top-0 h-36 z-20 pointer-events-none bg-gradient-to-b from-black/80 via-black/45 to-transparent" />
      <div className="absolute inset-x-0 top-0 z-30 p-4 pt-11">
        <div className="mx-auto max-w-xl flex items-center justify-center gap-8 text-sm">
          <button
            type="button"
            className={`px-1 py-1 text-base transition-colors ${mode === 'for-you' ? 'text-white font-semibold' : 'text-white/70 hover:text-white'}`}
            onClick={() => void openForYouFeed()}
          >
            Для тебя
          </button>
          <button
            type="button"
            className={`px-1 py-1 text-base transition-colors ${mode === 'track-seed' ? 'text-white font-semibold' : 'text-white/70 hover:text-white'}`}
            onClick={() => {
              if (selectedCardSeed) {
                setLocalError(null);
                void openTrackFeed(selectedCardSeed.id, selectedCardSeed);
                return;
              }
              if (resolvedTrackSeedId) {
                setLocalError(null);
                void openTrackFeed(resolvedTrackSeedId, trackSeed || undefined);
                return;
              }
              setLocalError('Выберите трек с кнопкой "Похожие в Radooga", чтобы запустить режим "По треку".');
              void openForYouFeed();
            }}
          >
            По треку
          </button>
        </div>
        {mode === 'track-seed' && activeTrackModeSeed && (
          <div className="mx-auto mt-1 max-w-xl text-center text-[11px] text-white/75 truncate px-2">
            По треку: {activeTrackModeSeed.artist} - {activeTrackModeSeed.title}
          </div>
        )}
        {currentIndex === 0 && pullDistance > 0 && (
          <div className="mx-auto mt-2 text-center text-[11px] text-white/75">
            {pullDistance > 70 ? 'Отпустите для обновления' : 'Потяните вниз для обновления'}
          </div>
        )}
      </div>

      {(isLoading || (!activeItem && !error)) && (
        <div className="h-full flex items-center justify-center text-white/80">
          <Loader2 className="w-6 h-6 mr-2 animate-spin" />
          Загружаем ленту...
        </div>
      )}

      {error && !activeItem && (
        <div className="h-full px-6 flex items-center justify-center">
          <div className="rounded-3xl bg-white/10 border border-white/15 p-6 max-w-md text-center">
            <div className="text-lg font-semibold mb-2">Radooga</div>
            <div className="text-white/80 mb-4">{error}</div>
            <button
              type="button"
              className="rounded-full bg-white text-slate-900 px-4 py-2 text-sm font-medium"
              onClick={() => void openForYouFeed()}
            >
              Обновить
            </button>
          </div>
        </div>
      )}

      {activeItem && (
        <div className="h-full w-full">
          <AnimatePresence mode="sync">
            <motion.div
              key={activeItem.id}
              custom={feedDirection}
              variants={cardVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'tween', duration: 0.22, ease: [0.33, 1, 0.68, 1] }}
              className="w-full h-full overflow-hidden relative"
            >
              <div className="absolute inset-0">
                {isPexelsPopularSurface && pexelsBgClip ? (
                  <>
                    <div className="absolute inset-0 z-0 bg-neutral-950" aria-hidden />
                    <div className="absolute inset-0 z-[1]">
                      <video
                        ref={pexelsVideoRef}
                        key={pexelsClips[currentClipIndex]?.videoUrl ?? 'pexels-bg'}
                        className="absolute inset-0 h-full w-full object-cover"
                        src={pexelsClips[currentClipIndex]?.videoUrl}
                        poster={undefined}
                        muted={true}
                        playsInline={true}
                        loop={true}
                        autoPlay={true}
                        preload="metadata"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                  </>
                ) : activeEnrichLayer === 'photos' ? (
                  <div className="absolute inset-0 z-0 bg-black" />
                ) : !shouldUseVisualizer && activeItem.artworkUrl ? (
                  <CachedImage
                    src={activeItem.artworkUrl}
                    alt={activeItem.title}
                    className="absolute inset-0 z-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 z-0">
                    <RadoogaAudioVisualizer trackKey={activeItem.id} isPlaying={isPlaying} />
                  </div>
                )}
              </div>
              <div className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-t from-black/88 via-black/42 to-black/12" />
              {!isEnrichLoading && activeEnrichLayer === 'lyrics' && currentLyricsChunk && (
                <div className="absolute inset-0 z-20 pointer-events-none">
                  <div className="h-full w-full flex items-center justify-center px-6">
                    <motion.div
                      key={`lyrics-center-${activeItem.id}-${currentLyricsChunk}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.34, ease: 'easeOut' }}
                      className="max-w-[88%] rounded-2xl bg-black/30 backdrop-blur-sm px-5 py-4"
                    >
                      <div className="text-center text-white text-[1.18rem] font-semibold leading-relaxed tracking-wide">
                        {currentLyricsChunk}
                      </div>
                    </motion.div>
                  </div>
                </div>
              )}
              {!isEnrichLoading && activeEnrichLayer === 'news' && newsCarouselItems.length > 0 && (
                <div className="absolute inset-0 z-20 pointer-events-none pt-24 pb-56">
                  <div className="w-full h-full pointer-events-auto">
                    <RadoogaCarousel
                      mode="news"
                      items={newsCarouselItems}
                      onOpenSource={handleOpenSourceInFeed}
                      externalIndex={newsCarouselIndex}
                      onIndexChange={setNewsCarouselIndex}
                    />
                  </div>
                </div>
              )}
              {!isEnrichLoading && activeEnrichLayer === 'concerts' && uniqueConcertItems.length > 0 && (
                <div className="absolute inset-0 z-20 pointer-events-none pt-24 pb-56">
                  <div className="relative h-full w-full flex flex-col items-center justify-center overflow-y-auto px-5 pb-2 pt-2">
                    <div className="pointer-events-none absolute left-1/2 top-1/2 h-[204%] w-[300%] -translate-x-1/2 -translate-y-1/2 bg-gradient-to-b from-black/25 via-black/90 to-black/30" />
                    <motion.div
                      key={`concerts-block-${activeItem.id}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.32, ease: 'easeOut' }}
                      className="relative z-10 w-full max-w-[min(100%,26rem)] text-left"
                    >
                      <div className="text-[1.5rem] font-extrabold leading-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.85)]">
                        {activeItem.artist}
                      </div>
                      <div className="mt-1 text-[1.02rem] font-semibold leading-snug text-white/92 drop-shadow-[0_1px_10px_rgba(0,0,0,0.75)]">
                        {hasMultiplePerformers ? 'У артистов пройдут концерты' : 'У артиста пройдут концерты'}
                      </div>
                      <div className="mt-3 max-h-[42vh] space-y-2.5 overflow-y-auto text-left">
                        {uniqueConcertItems.map((item, idx) => (
                          <div key={`${item.url || item.title}-${idx}`} className="border-b border-white/10 pb-2.5 last:border-0 last:pb-0">
                            <div className="text-[0.86rem] font-medium leading-snug text-white/88">
                              {formatConcertDate(item.date)}
                              {item.city ? ` · ${item.city}` : ''}
                              {item.venue ? ` · ${item.venue}` : ''}
                              {` · ${formatSourceHost(item.url)}`}
                            </div>
                            <div className="mt-1 text-[0.95rem] font-semibold leading-snug text-white drop-shadow-[0_1px_10px_rgba(0,0,0,0.75)]">
                              {item.title}
                            </div>
                          </div>
                        ))}
                      </div>
                      {concertsSourceUrl ? (
                        <button
                          type="button"
                          onClick={() => handleOpenSourceInFeed(concertsSourceUrl)}
                          className="mt-3 text-[13px] text-white/95 underline underline-offset-4 drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]"
                        >
                          Посмотреть ближайшие
                        </button>
                      ) : null}
                    </motion.div>
                  </div>
                </div>
              )}
              {!isEnrichLoading && activeEnrichLayer === 'video' && videoItem && (
                <div className="absolute inset-0 z-20 pointer-events-none pt-24 pb-56">
                  <div className="w-full h-full pointer-events-auto flex items-center justify-center bg-black">
                    <div className="h-full max-h-full aspect-[3/4] overflow-hidden bg-black relative">
                      <CachedImage
                        src={videoItem.thumbnailUrl}
                        alt={videoItem.title}
                        className="w-full h-full object-cover opacity-80"
                      />
                      <div className="absolute inset-0 bg-black/35" />
                    </div>
                  </div>
                </div>
              )}
              {!isEnrichLoading && activeEnrichLayer === 'photos' && photoItems.length > 0 && (
                <div className="absolute inset-0 z-20 pointer-events-none pt-24 pb-56">
                  <div className="w-full h-full pointer-events-auto">
                    <RadoogaCarousel
                      mode="photos"
                      items={photoCarouselItems}
                      onOpenSource={handleOpenSourceInFeed}
                      externalIndex={photoCarouselIndex}
                      onIndexChange={setPhotoCarouselIndex}
                    />
                  </div>
                </div>
              )}
              {!isEnrichLoading && activeEnrichLayer === 'fact' && factItem && !shouldShowInlineWiki && (
                <div className="absolute inset-0 z-20 pointer-events-none pt-24 pb-56">
                  <div className="relative flex h-full w-full items-center justify-center px-6">
                    <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[44%] -translate-y-1/2 bg-gradient-to-b from-transparent via-black/60 to-transparent" />
                    <motion.div
                      key={`fact-center-${activeItem.id}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="relative z-10 w-full max-w-[min(100%,26rem)] pointer-events-auto text-center"
                    >
                      <div
                        className="max-h-[min(58vh,28rem)] overflow-y-auto overscroll-y-contain text-left"
                        onWheel={(e) => e.stopPropagation()}
                      >
                        <p
                          className={`text-[1.05rem] leading-relaxed text-white whitespace-pre-wrap [text-shadow:0_2px_6px_rgba(0,0,0,0.95),0_8px_24px_rgba(0,0,0,0.9),0_0_2px_rgba(0,0,0,1)] ${
                            isFactExpanded ? '' : 'line-clamp-[8]'
                          }`}
                        >
                          {factItem.full}
                        </p>
                        {factItem.full.length > 200 ? (
                          <button
                            type="button"
                            onClick={() => setIsFactExpanded((v) => !v)}
                            className="mt-2 text-[0.95rem] font-medium text-white/95 underline decoration-white/70 underline-offset-4 hover:text-white"
                          >
                            {isFactExpanded ? 'Свернуть' : 'Ещё'}
                          </button>
                        ) : null}
                      </div>
                    </motion.div>
                  </div>
                </div>
              )}

              <div className="absolute left-5 right-5 bottom-8 z-30">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className={`${titleSizeClass} font-bold leading-tight whitespace-normal break-words`}>
                      {activeItem.title}
                    </h2>
                    <div className="flex flex-wrap gap-x-2 gap-y-1 items-baseline max-w-full">
                      {radoogaPerformers.map((name, idx) => (
                        <span key={`${activeItem.id}-perf-${name}`} className="inline-flex items-baseline gap-x-2">
                          {idx > 0 ? <span className="text-white/45 text-base select-none" aria-hidden>·</span> : null}
                          <button
                            type="button"
                            className="text-lg text-white/90 hover:text-white underline-offset-4 hover:underline whitespace-normal break-words text-left max-w-full"
                            onClick={() => navigateWithHistory(resolveArtistRoute(name, artists))}
                          >
                            {name}
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="h-14 w-14 rounded-md overflow-hidden border border-white/30 bg-black/25 flex-shrink-0">
                    {activeItem.artworkUrl ? (
                      <CachedImage src={activeItem.artworkUrl} alt={activeItem.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-white/10" />
                    )}
                  </div>
                </div>

                {shouldShowInlineWiki && factItem && (
                  <div className="mt-3 px-1 py-1">
                    <div className={`text-[12px] leading-relaxed text-white/85 ${isInlineWikiExpanded ? '' : 'line-clamp-2'}`}>
                      {isInlineWikiExpanded ? factItem.full : factItem.preview}
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setIsInlineWikiExpanded((v) => !v)}
                        className="text-[11px] font-medium text-white/90 underline underline-offset-4"
                      >
                        {isInlineWikiExpanded ? 'Свернуть' : 'Ещё'}
                      </button>
                    </div>
                  </div>
                )}
                {localError && (
                  <div className="mt-3 rounded-2xl bg-rose-500/20 border border-rose-300/40 p-2 text-xs">
                    {localError}
                  </div>
                )}
              </div>

              {isCarouselLayerActive && (
                <button
                  type="button"
                  onClick={() => setActiveCarouselIndex((prev) => (prev > 0 ? prev - 1 : prev))}
                  disabled={isLeftArrowDisabled}
                  className="absolute left-4 top-[calc(50%-80px)] -translate-y-1/2 h-12 w-12 text-white flex items-center justify-center disabled:opacity-35 drop-shadow-[0_10px_28px_rgba(0,0,0,0.95)] z-40"
                  aria-label="Предыдущий элемент"
                >
                  <ChevronRight className="w-7 h-7 rotate-180" />
                </button>
              )}
              {isCarouselLayerActive && (
                <button
                  type="button"
                  onClick={() => setActiveCarouselIndex((prev) => (prev < activeCarouselCount - 1 ? prev + 1 : prev))}
                  disabled={isRightArrowDisabled}
                  className="absolute right-4 top-[calc(50%-80px)] -translate-y-1/2 h-12 w-12 text-white flex items-center justify-center disabled:opacity-35 drop-shadow-[0_10px_28px_rgba(0,0,0,0.95)] z-40"
                  aria-label="Следующий элемент"
                >
                  <ChevronRight className="w-7 h-7" />
                </button>
              )}
              <div className="absolute right-4 top-1/2 -translate-y-[40px] flex flex-col items-center gap-1.5 z-40">
                  <motion.button
                    type="button"
                    onClick={() => void handleLike()}
                    whileTap={{ scale: 0.86 }}
                    className="h-12 w-12 text-white flex items-center justify-center drop-shadow-[0_10px_28px_rgba(0,0,0,0.95)] relative"
                    aria-label="Лайкнуть и скачать"
                  >
                    <motion.span
                      key={`${activeItem.id}-${likeAnimKey}`}
                      className="inline-flex"
                      initial={likeAnimKey === 0 ? false : { scale: 1, rotate: 0 }}
                      animate={
                        likeAnimKey === 0
                          ? { scale: 1, rotate: 0 }
                          : { scale: [1, 1.38, 0.96, 1], rotate: [0, -14, 12, 0] }
                      }
                      transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <Heart className={`w-5 h-5 transition-colors ${isActiveTrackLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                    </motion.span>
                    {likeAnimKey > 0 ? (
                      <motion.span
                        className="pointer-events-none absolute inset-0 rounded-full border-2 border-rose-400/90"
                        key={`ring-${activeItem.id}-${likeAnimKey}`}
                        initial={{ scale: 0.6, opacity: 0.85 }}
                        animate={{ scale: 2.1, opacity: 0 }}
                        transition={{ duration: 0.55, ease: 'easeOut' }}
                      />
                    ) : null}
                  </motion.button>
                  <button
                    type="button"
                    onClick={() => void handleDislikeArtist()}
                    className="h-12 w-12 text-white flex items-center justify-center disabled:opacity-70 drop-shadow-[0_10px_28px_rgba(0,0,0,0.95)]"
                    aria-label="Дизлайк артиста"
                  >
                    <ThumbsDown className="w-5 h-5" />
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => void handleSendToPlaylist()}
                      disabled={sendStatus === 'downloading' || sendStatus === 'opening'}
                      className={`h-12 w-12 text-white flex items-center justify-center disabled:opacity-70 drop-shadow-[0_10px_28px_rgba(0,0,0,0.95)] ${
                        sendStatus === 'downloading' || sendStatus === 'opening' ? 'text-violet-300' : ''
                      }`}
                      aria-label="Отправить трек в плейлист"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                    {sendStatus !== 'idle' && (
                      <div className="absolute right-[calc(100%+8px)] top-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-[11px] bg-white/20 backdrop-blur text-white whitespace-nowrap">
                        {sendStatus === 'downloading' && 'Скачиваем...'}
                        {sendStatus === 'opening' && 'Открываем плейлисты'}
                        {sendStatus === 'added' && 'Добавлено'}
                        {sendStatus === 'exists' && 'Уже в плейлисте'}
                        {sendStatus === 'error' && 'Ошибка'}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="h-12 w-12 text-white flex items-center justify-center drop-shadow-[0_10px_28px_rgba(0,0,0,0.95)]"
                    aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
                  >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
              </div>

              {isPrefetching && (
                <div className="absolute left-4 top-20 text-xs text-white/70">
                  Подгружаем...
                </div>
              )}
              {isExhaustedTemporary && !isPrefetching && (
                <div className="absolute left-4 top-28 text-xs text-white/70">
                  Ищем следующую волну...
                </div>
              )}
              {isRefreshing && (
                <div className="absolute left-4 top-24 text-xs text-white/80">
                  Refreshing...
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
      </div>
      {addingToPlaylistTrackId && (
        <AddToPlaylistModal
          trackId={addingToPlaylistTrackId}
          onClose={() => {
            setAddingToPlaylistTrackId(null);
            window.setTimeout(() => setSendStatus('idle'), 900);
          }}
          onResult={(status) => {
            setSendStatus(status === 'added' ? 'added' : 'exists');
          }}
        />
      )}
    </>
  );
}
