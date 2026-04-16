import { RadoogaCandidate } from './radoogaRecommendations';
import {
  hashStringSeed,
} from './radoogaGenreAesthetics';
import { apiUrl } from './apiUrl';

export type RadoogaNewsItem = {
  title: string;
  /** Краткий текст новости (не только заголовок), plain text */
  summary?: string;
  source: string;
  publishedAt?: string;
  url: string;
  imageUrl?: string;
  /** Заглушка без RSS — для приоритизации слоя в UI */
  placeholder?: boolean;
};

export type RadoogaPhotoItem = {
  url: string;
  title?: string;
};

export type RadoogaFactItem = {
  preview: string;
  full: string;
  sourceUrl?: string;
  sourceLabel?: string;
  kind?: 'track' | 'artist' | 'music-world';
};

export type RadoogaConcertItem = {
  title: string;
  venue?: string;
  city?: string;
  date?: string;
  url?: string;
};

export type RadoogaVideoItem = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  embedUrl: string;
  url: string;
};

export type ArtistMediaItem = {
  kind: 'photo' | 'fact' | 'news' | 'concert';
  title: string;
  subtitle?: string;
  imageUrl?: string;
  url?: string;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const withCache = async <T>(key: string, ttlMs: number, resolver: () => Promise<T>): Promise<T> => {
  const now = Date.now();
  const cached = cache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) return cached.value;
  const value = await resolver();
  cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
};

const debugResolver = (label: string, message: string) => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.debug(`[radooga:${label}] ${message}`);
  }
};

const recentFactHashes = new Set<string>();
const recentPhotoUrls = new Set<string>();
const recentVideoIds = new Set<string>();
const recentNewsKeys = new Set<string>();
/** Недавно показанные в ленте Pexels-ролики (id и videoUrl), чтобы не повторять подряд. */
const recentPexelsShown = new Set<string>();

const keepRecentSet = (set: Set<string>, value: string, max = 80) => {
  if (!value) return;
  if (set.has(value)) return;
  set.add(value);
  if (set.size <= max) return;
  const oldest = set.values().next().value;
  if (oldest) set.delete(oldest);
};

const normalizePhotoUrlKey = (url: string): string => (url || '').split(/[?#]/)[0] || url;

const newsSessionKey = (item: Pick<RadoogaNewsItem, 'url' | 'title'>): string => {
  const url = (item.url || '').trim();
  if (url) return `u:${url}`;
  const title = (item.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return `t:${title}`;
};
const hasSeenFact = (hash: string): boolean => recentFactHashes.has(hash);
const rememberFact = (hash: string) => keepRecentSet(recentFactHashes, hash, 600);

const shuffleWithSeed = <T>(arr: T[], seed: number): T[] => {
  const out = [...arr];
  let s = seed || 1;
  const rnd = (): number => {
    s = (s * 1103515245 + 12345) | 0;
    return (s >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
};

const wikiBaseForLang = (lang: 'ru' | 'en'): string => `https://${lang}.wikipedia.org`;

const truncateByWordBoundary = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength);
  const boundary = Math.max(clipped.lastIndexOf(' '), clipped.lastIndexOf(','), clipped.lastIndexOf('.'));
  const safe = boundary > 40 ? clipped.slice(0, boundary) : clipped;
  return `${safe.trimEnd()}...`;
};

const buildFactPreview = (full: string): string => truncateByWordBoundary(full, 220);
const buildFallbackImageDataUrl = (label: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#1f2937"/><stop offset="100%" stop-color="#4f46e5"/></linearGradient></defs><rect width="800" height="800" fill="url(#g)"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="Arial" font-size="42">${label}</text></svg>`
  )}`;

const wikiSearch = async (query: string, lang: 'ru' | 'en'): Promise<string | null> => {
  const response = await fetch(
    `${wikiBaseForLang(lang)}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`
  );
  if (!response.ok) return null;
  const payload = await response.json() as { query?: { search?: Array<{ title?: string }> } };
  return payload.query?.search?.[0]?.title || null;
};

const wikiSummary = async (
  title: string,
  lang: 'ru' | 'en'
): Promise<{ extract: string; sourceUrl?: string; sourceLabel: string } | null> => {
  const response = await fetch(`${wikiBaseForLang(lang)}/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  if (!response.ok) return null;
  const payload = await response.json() as { extract?: string; content_urls?: { desktop?: { page?: string } } };
  const extract = payload.extract?.trim();
  if (!extract) return null;
  return {
    extract,
    sourceUrl: payload.content_urls?.desktop?.page,
    sourceLabel: lang === 'ru' ? 'Русская Википедия' : 'Wikipedia',
  };
};

const translateToRussian = async (text: string): Promise<string> => {
  const normalized = text.trim();
  if (!normalized) return normalized;
  const key = `translate:ru:${normalized.toLowerCase()}`;
  return withCache(key, 1000 * 60 * 60 * 8, async () => {
    try {
      const response = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ru&dt=t&q=${encodeURIComponent(normalized)}`
      );
      if (!response.ok) return normalized;
      const payload = await response.json() as Array<Array<[string, string]>>;
      const translated = (payload?.[0] || [])
        .map((entry) => entry?.[0] || '')
        .join('')
        .trim();
      return translated || normalized;
    } catch {
      return normalized;
    }
  });
};

const MUSIC_WORLD_FACTS: string[] = [
  'Винил пережил цифровую эпоху: во многих странах продажи пластинок растут каждый год.',
  'Эффект Ломбарда заставляет людей петь и говорить громче в шумной среде, поэтому концертная подача отличается от студийной.',
  'Частота 440 Гц принята как стандарт для ноты ля, но в разных эпохах оркестры настраивались заметно выше или ниже.',
  'Реверберация в музыке имитирует пространство: от маленькой комнаты до огромного зала.',
  'Синкопа смещает акцент с сильной доли и создает ощущение кача даже в медленном темпе.',
  'Компрессор уменьшает разницу между тихими и громкими частями, делая трек более плотным.',
  'Моносовместимость до сих пор важна: в некоторых клубах и устройствах сигнал частично сводится в моно.',
  'Многие хиты строятся на контрасте: простой куплет и максимально запоминающийся припев.',
  'Психоакустика объясняет, почему мозг «достраивает» недостающие частоты и слышит бас даже на маленьких колонках.',
  'Стереопанорама помогает разделять инструменты по пространству и делает микс более читаемым.',
];

const pickWorldFact = (): string | null => {
  const candidates = MUSIC_WORLD_FACTS.filter((fact) => !recentFactHashes.has(`world:${fact}`));
  const pool = candidates.length > 0 ? candidates : MUSIC_WORLD_FACTS;
  if (pool.length === 0) return null;
  const chosen = pool[Math.floor(Math.random() * pool.length)] || null;
  if (chosen) keepRecentSet(recentFactHashes, `world:${chosen}`, 120);
  return chosen;
};

const SECTION_PATTERNS: RegExp[] = [
  /^\s*\[[^\]]+\]\s*$/i,
  /^\s*\([^)]+\)\s*$/i,
  /^\s*(intro|outro|verse|chorus|bridge|hook|refrain|pre-chorus|post-chorus)\b[\s\d\-xX:]*$/i,
  /^\s*(интро|аутро|куплет|припев|бридж)\b[\s\d\-xX:]*$/i,
];

const CREDITS_PATTERNS: RegExp[] = [
  /\b(produced by|written by|lyrics by|songwriters?|credits?)\b/i,
  /\b(текст|слова|музыка|автор(?:ы)?|prod\.)\b/i,
];

const TIMECODE_PATTERN = /\[\d{1,2}:\d{2}(?:\.\d{1,2})?\]/g;
const META_TOKEN_PATTERN = /\b(intro|outro|verse|chorus|bridge|hook|refrain|pre-chorus|post-chorus|куплет|припев|интро|аутро)\b/i;

const isSlashMetadataLine = (line: string): boolean => {
  if (!line.includes('/')) return false;
  const segments = line
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return false;

  // Typical noisy forms: "Intro / Verse 1 / Chorus", "Lyrics / Credits", etc.
  const metaSegments = segments.filter((segment) => {
    if (META_TOKEN_PATTERN.test(segment)) return true;
    if (CREDITS_PATTERNS.some((pattern) => pattern.test(segment))) return true;
    if (/^\d+$/.test(segment)) return true;
    if (segment.length <= 2) return true;
    return false;
  });

  // Keep slash lines unless they are overwhelmingly metadata-like.
  if (metaSegments.length >= Math.ceil(segments.length * 0.75)) return true;
  return false;
};

export const sanitizeLyricsStrict = (rawLyrics: string): string | null => {
  const lines = rawLyrics
    .replace(TIMECODE_PATTERN, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const unique = new Set<string>();
  const cleaned: string[] = [];

  for (const line of lines) {
    const normalizedLine = line.toLowerCase();
    if (normalizedLine.length <= 2) continue;
    if (isSlashMetadataLine(line)) continue;
    if (SECTION_PATTERNS.some((pattern) => pattern.test(line))) continue;
    if (CREDITS_PATTERNS.some((pattern) => pattern.test(line))) continue;
    if (/^[\W_]+$/.test(line)) continue;
    if (unique.has(normalizedLine)) continue;
    unique.add(normalizedLine);
    cleaned.push(line);
  }

  const merged = cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!merged) return null;

  const meaningfulTokens = merged
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);

  if (merged.length < 60 || meaningfulTokens.length < 8) {
    return null;
  }

  return merged;
};

export const resolveLyricsSnippet = async (candidate: RadoogaCandidate): Promise<string | null> => {
  const key = `lyrics:${candidate.id}`;
  return withCache(key, 1000 * 60 * 30, async () => {
    const response = await fetch(apiUrl('/api/lyrics/lookup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `${candidate.artist} - ${candidate.title}`,
        title: candidate.title,
        artist: candidate.artist,
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { lyrics?: string };
    const rawLyrics = (payload.lyrics || '').trim();
    if (!rawLyrics) return null;
    return sanitizeLyricsStrict(rawLyrics);
  });
};

export const resolveFacts = async (candidate: RadoogaCandidate): Promise<RadoogaFactItem | null> => {
  const key = `facts:${candidate.id}`;
  return withCache(key, 1000 * 60 * 60 * 6, async () => {
    if (Math.random() < 0.28) {
      const worldFact = pickWorldFact();
      if (worldFact) {
        return {
          full: worldFact,
          preview: buildFactPreview(worldFact),
          sourceLabel: 'Факт из мира музыки',
          kind: 'music-world',
        };
      }
    }

    const ruTrackTitle = await wikiSearch(`"${candidate.title}" "${candidate.artist}" песня`, 'ru');
    if (ruTrackTitle) {
      const summary = await wikiSummary(ruTrackTitle, 'ru');
      if (summary) {
        const hash = `track:${summary.extract.slice(0, 120).toLowerCase()}`;
        if (!hasSeenFact(hash)) {
          rememberFact(hash);
          return {
            full: summary.extract,
            preview: buildFactPreview(summary.extract),
            sourceUrl: summary.sourceUrl,
            sourceLabel: summary.sourceLabel,
            kind: 'track',
          };
        }
      }
    }

    const ruArtistTitle = await wikiSearch(`"${candidate.artist}" музыкант`, 'ru');
    if (ruArtistTitle) {
      const summary = await wikiSummary(ruArtistTitle, 'ru');
      if (summary) {
        const hash = `artist:${summary.extract.slice(0, 120).toLowerCase()}`;
        if (!hasSeenFact(hash)) {
          rememberFact(hash);
          return {
            full: summary.extract,
            preview: buildFactPreview(summary.extract),
            sourceUrl: summary.sourceUrl,
            sourceLabel: summary.sourceLabel,
            kind: 'artist',
          };
        }
      }
    }

    const enTrackTitle = await wikiSearch(`"${candidate.title}" "${candidate.artist}" song`, 'en');
    if (enTrackTitle) {
      const summary = await wikiSummary(enTrackTitle, 'en');
      if (summary) {
        const translated = await translateToRussian(summary.extract);
        const hash = `track-en:${translated.slice(0, 120).toLowerCase()}`;
        if (!hasSeenFact(hash)) {
          rememberFact(hash);
          return {
            full: translated,
            preview: buildFactPreview(translated),
            sourceUrl: summary.sourceUrl,
            sourceLabel: 'Wikipedia (перевод)',
            kind: 'track',
          };
        }
      }
    }

    const enArtistTitle = await wikiSearch(`"${candidate.artist}" musician`, 'en');
    if (!enArtistTitle) return null;
    const fallback = await wikiSummary(enArtistTitle, 'en');
    if (!fallback) return null;
    const translatedFallback = await translateToRussian(fallback.extract);
    const hash = `artist-en:${translatedFallback.slice(0, 120).toLowerCase()}`;
    if (!hasSeenFact(hash)) {
      rememberFact(hash);
      return {
        full: translatedFallback,
        preview: buildFactPreview(translatedFallback),
        sourceUrl: fallback.sourceUrl,
        sourceLabel: 'Wikipedia (перевод)',
        kind: 'artist',
      };
    }
    return null;
  });
};

type NewsFeedItem = {
  title?: string;
  pubDate?: string;
  link?: string;
  author?: string;
  thumbnail?: string;
  enclosure?: { link?: string };
  description?: string;
  content?: string;
  contentSnippet?: string;
};

/** RSS/Atom: сначала локальный прокси (без CORS и без rss2json), затем rss2json. */
const fetchRssAsNewsItems = async (rssUrl: string): Promise<NewsFeedItem[]> => {
  try {
    const proxy = `/api/rss/proxy?url=${encodeURIComponent(rssUrl)}`;
    const response = await fetch(proxy);
    if (response.ok) {
      const payload = await response.json() as { items?: NewsFeedItem[] };
      if (payload.items && payload.items.length > 0) return payload.items;
    }
  } catch {
    /* fallback */
  }
  try {
    const response = await fetch(
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`
    );
    if (!response.ok) return [];
    const payload = await response.json() as { status?: string; items?: NewsFeedItem[] };
    if (payload.status === 'error') return [];
    return payload.items || [];
  } catch {
    return [];
  }
};

/** Убираем текстовые заглушки: показываем только реальные новости из ленты. */
const interleaveNewsPlaceholders = (live: RadoogaNewsItem[], candidate: RadoogaCandidate): RadoogaNewsItem[] => {
  void candidate;
  const real = live.filter((n) => !n.placeholder);
  return real.slice(0, 18);
};

/** Вертикальные фоновые клипы из Pexels Video API. */
export type RadoogaPexelsClip = {
  id: string;
  title: string;
  videoUrl: string;
  pageUrl: string;
  thumb?: string;
};

/** Помечает клипы как уже показанные в Radooga (вызывать из UI после применения enrich). */
export const markRecentPexelsClipsShown = (clips: RadoogaPexelsClip[]): void => {
  for (const c of clips) {
    if (c.id) keepRecentSet(recentPexelsShown, `id:${c.id}`, 48);
    if (c.videoUrl) keepRecentSet(recentPexelsShown, `u:${c.videoUrl}`, 48);
  }
};

const isPexelsRecentlyShown = (clip: RadoogaPexelsClip): boolean =>
  recentPexelsShown.has(`id:${clip.id}`) || recentPexelsShown.has(`u:${clip.videoUrl}`);

/** «Залипательные» в англоязычных тегах: oddly satisfying, hypnotic, mesmerizing, loop ASMR и т.п. */
const MESMERIC_AND_AESTHETIC_QUERIES = [
  'oddly satisfying',
  'hypnotic abstract loop',
  'mesmerizing fluid motion',
  'endless loop visual art',
  'satisfying patterns macro',
  'slow motion ink water',
  'kaleidoscope lights vertical',
  'particle bokeh tunnel',
  'cinemagraph mood vertical',
  'macro liquid splash',
  'aesthetic night city vertical',
  'retro vhs mood vertical',
  'nature timelapse vertical clouds',
  'zen sand ripples macro',
  'vertical mood loop abstract',
];

const TAGGED_VIBES = ['aesthetic vertical', 'night city neon vertical', 'retro film vertical', 'nature cinematic vertical'];

/** Вайб по жанру/названию (не по имени артиста) — короткие визуальные запросы для Pexels. */
const GENRE_VIBE_RULES: Array<{ re: RegExp; query: string }> = [
  { re: /phonk|drift|dark\s*trap/i, query: 'street racing night speed neon vertical' },
  { re: /lo[- ]?fi|lofi|chillhop|chill\s*beats/i, query: 'rainy window cozy room study desk' },
  { re: /jazz/i, query: 'smoky jazz bar vintage lamp mood' },
  { re: /classical|orchestr|symphon/i, query: 'concert hall chandelier cinematic vertical' },
  { re: /rock|metal|punk/i, query: 'concert stage lights crowd energy vertical' },
  { re: /hip\s*hop|rap|trap(?!honk)|rnb/i, query: 'urban city night skyline neon vertical' },
  { re: /house|techno|edm|electronic|dance/i, query: 'neon tunnel abstract lights vertical' },
  { re: /indie|alternative/i, query: 'golden hour field sunset dreamy vertical' },
  { re: /folk|acoustic|country/i, query: 'forest morning fog nature path vertical' },
  { re: /pop|dance\s*pop/i, query: 'city lights bokeh night aesthetic vertical' },
  { re: /soul|funk|disco/i, query: 'retro neon disco dance floor vertical' },
  { re: /ambient|drone|soundscape/i, query: 'slow clouds timelapse stars calm vertical' },
  { re: /r&b|soul music/i, query: 'moody neon bedroom city window rain' },
];

const buildPexelsSearchQueries = (
  candidate: RadoogaCandidate,
  lyricsSnippet: string | null | undefined
): string[] => {
  const genre = (candidate.genre || '').trim();
  const title = candidate.title.trim();
  const blob = `${genre.toLowerCase()} ${title.toLowerCase()}`;
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    const t = raw.replace(/\s+/g, ' ').trim().slice(0, 120);
    const k = t.toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };

  const { queries: aestheticQueries } = getAestheticQuery(
    candidate.genre,
    candidate.title,
    candidate.artist,
    candidate.collectionName,
  );
  const primaryTag = pickRandomAestheticTag(
    candidate.genre,
    candidate.id,
    candidate.title,
    candidate.artist,
    candidate.collectionName,
  );
  add(primaryTag);
  add(`${primaryTag} vertical`);
  add(`${primaryTag} portrait`);
  for (const tag of aestheticQueries) {
    add(tag);
    add(`${tag} vertical`);
  }

  for (const rule of GENRE_VIBE_RULES) {
    if (rule.re.test(blob)) add(rule.query);
  }
  if (genre) add(genre);

  if (lyricsSnippet) {
    const flat = lyricsSnippet.replace(/\s+/g, ' ').trim();
    if (flat.length >= 12) add(flat.slice(0, 90));
    const tokens = flat.split(' ').filter((w) => w.length > 3);
    if (tokens.length >= 3) add(tokens.slice(0, 6).join(' '));
    if (flat.length > 90) {
      const mid = Math.floor(flat.length / 2);
      add(flat.slice(mid, mid + 80).trim());
    }
  }

  for (const v of TAGGED_VIBES) add(v);
  for (const v of MESMERIC_AND_AESTHETIC_QUERIES) add(v);

  add('vertical abstract loop aesthetic');
  return out;
};

const fetchPexelsClipsOnce = async (q: string, page = 1): Promise<RadoogaPexelsClip[]> => {
  const key = `pexels:v:${q}:p${page}`;
  const ttlMs = 1000 * 60 * 5;
  const now = Date.now();
  const cached = cache.get(key) as CacheEntry<RadoogaPexelsClip[]> | undefined;
  if (cached && cached.expiresAt > now && cached.value.length > 0) return cached.value;

  const response = await fetch(
    `/api/pexels/videos/search?query=${encodeURIComponent(q)}&per_page=12&page=${page}`
  );
  if (!response.ok) {
    debugResolver('pexels', `http-${response.status}:${q.slice(0, 40)}`);
    return [];
  }
  const payload = (await response.json()) as { items?: RadoogaPexelsClip[] };
  const items = payload.items || [];
  if (items.length > 0) {
    cache.set(key, { value: items, expiresAt: now + ttlMs });
  }
  return items;
};

export type ResolvePexelsClipsOptions = {
  lyricsSnippet?: string | null;
};

/** Запасные ролики (прямые mp4), если Pexels API недоступен — чтобы spotlight-карточка не оставалась без фона. */
export const getPexelsAmbientFallbackClips = (): RadoogaPexelsClip[] => [
  {
    id: 'fallback-sample-bbb',
    title: 'Запасной ролик',
    videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
    pageUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
  },
  {
    id: 'fallback-sample-blazes',
    title: 'Запасной ролик',
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    pageUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/',
  },
  {
    id: 'fallback-sample-escapes',
    title: 'Запасной ролик',
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    pageUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/',
  },
  {
    id: 'fallback-sample-fun',
    title: 'Запасной ролик',
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    pageUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/',
  },
  {
    id: 'fallback-sample-joyrides',
    title: 'Запасной ролик',
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    pageUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/',
  },
  {
    id: 'fallback-sample-meltdowns',
    title: 'Запасной ролик',
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
    pageUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/',
  },
];

/** Возвращает fallback-клипы с приоритетом тех, что недавно не показывались. */
export const pickPexelsAmbientFallbackClips = (limit = 4): RadoogaPexelsClip[] => {
  const base = getPexelsAmbientFallbackClips();
  if (base.length === 0 || limit <= 0) return [];
  const fresh = base.filter((clip) => !isPexelsRecentlyShown(clip));
  const pool = fresh.length > 0 ? fresh : base;
  return pool.slice(0, Math.min(limit, pool.length));
};

const mergePexelsAvoidingRecent = (
  into: RadoogaPexelsClip[],
  from: RadoogaPexelsClip[],
  seenUrl: Set<string>,
  skipRecent: boolean
): void => {
  for (const it of from) {
    if (!it.videoUrl) continue;
    if (seenUrl.has(it.videoUrl)) continue;
    if (skipRecent && isPexelsRecentlyShown(it)) continue;
    seenUrl.add(it.videoUrl);
    into.push(it);
    if (into.length >= 14) return;
  }
};

export const resolvePexelsClips = async (
  candidate: RadoogaCandidate,
  opts?: ResolvePexelsClipsOptions
): Promise<RadoogaPexelsClip[]> => {
  const rawQueries = buildPexelsSearchQueries(candidate, opts?.lyricsSnippet);
  const seed = hashStringSeed(candidate.id);
  const queries = shuffleWithSeed(rawQueries, seed);
  // #region agent log
  fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d7795d'},body:JSON.stringify({sessionId:'d7795d',runId:'run1',hypothesisId:'H1',location:'src/lib/radoogaContentSources.ts:641',message:'resolvePexelsClips query seed',data:{trackId:candidate.id,artist:candidate.artist,title:candidate.title,rawQueries:rawQueries.length,firstQuery:queries[0]||null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const merged: RadoogaPexelsClip[] = [];
  const seenUrl = new Set<string>();

  const collect = async (skipRecent: boolean) => {
    for (const q of queries) {
      for (let i = 0; i < 3; i += 1) {
        const page = ((seed + i) % 3) + 1;
        try {
          const items = await fetchPexelsClipsOnce(q, page);
          // #region agent log
          fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d7795d'},body:JSON.stringify({sessionId:'d7795d',runId:'run1',hypothesisId:'H2',location:'src/lib/radoogaContentSources.ts:654',message:'resolvePexelsClips fetched page',data:{trackId:candidate.id,query:q.slice(0,80),page,items:items.length,firstItemId:items[0]?.id||null,firstItemUrl:items[0]?.videoUrl||null,skipRecent},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          mergePexelsAvoidingRecent(merged, items, seenUrl, skipRecent);
          if (merged.length >= 12) return;
        } catch {
          debugResolver('pexels', `err-q:${q.slice(0, 40)}`);
        }
      }
      if (merged.length >= 12) return;
    }
  };

  await collect(true);
  if (merged.length < 6) {
    await collect(false);
  }

  if (merged.length > 0) {
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d7795d'},body:JSON.stringify({sessionId:'d7795d',runId:'run1',hypothesisId:'H3',location:'src/lib/radoogaContentSources.ts:672',message:'resolvePexelsClips merged result',data:{trackId:candidate.id,merged:merged.length,firstId:merged[0]?.id||null,firstUrl:merged[0]?.videoUrl||null,lastId:merged[merged.length-1]?.id||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    debugResolver('pexels', `merged:${merged.length} queries:${queries.length}`);
    return merged.slice(0, 12);
  }
  // #region agent log
  fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d7795d'},body:JSON.stringify({sessionId:'d7795d',runId:'run1',hypothesisId:'H4',location:'src/lib/radoogaContentSources.ts:677',message:'resolvePexelsClips empty fallback path',data:{trackId:candidate.id,queries:queries.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  debugResolver('pexels', 'all-queries-empty');
  return [];
};

const RANDOM_PEXELS_QUERIES = [
  'nature landscape',
  'mountains landscape',
  'forest landscape',
  'ocean waves',
  'waterfall nature',
  'sunset landscape',
  'abstract textures',
  'abstract colors',
  'aerial landscape',
  'foggy forest',
  'desert dunes',
  'abstract background',
  'abstract fluid',
  'minimal abstract',
  'nature scenery',
];

/** Полностью случайная выборка из Pexels без привязки к треку. */
export const resolveRandomPexelsClips = async (): Promise<RadoogaPexelsClip[]> => {
  const attempts = 4;
  const merged: RadoogaPexelsClip[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < attempts; i += 1) {
    const query = RANDOM_PEXELS_QUERIES[Math.floor(Math.random() * RANDOM_PEXELS_QUERIES.length)] || 'aesthetic';
    const page = 1 + Math.floor(Math.random() * 12);
    try {
      const items = await fetchPexelsClipsOnce(query, page);
      for (const it of items) {
        if (!it.videoUrl || seen.has(it.videoUrl)) continue;
        seen.add(it.videoUrl);
        merged.push(it);
        if (merged.length >= 12) break;
      }
    } catch {
      /* ignore random attempt failures */
    }
    if (merged.length >= 12) break;
  }

  return merged.slice(0, 12);
};

export const resolveLiveNews = async (candidate: RadoogaCandidate): Promise<RadoogaNewsItem[]> => {
  const freshnessBucket = Math.floor(recentNewsKeys.size / 40);
  const key = `news:${candidate.artist.toLowerCase()}:b${freshnessBucket}`;
  const ttlMs = 1000 * 60 * 15;
  const now = Date.now();
  const cachedNews = cache.get(key) as CacheEntry<RadoogaNewsItem[]> | undefined;
  if (cachedNews && cachedNews.expiresAt > now) {
    const v = cachedNews.value;
    const onlyPlaceholders = v.length > 0 && v.every((n) => n.placeholder);
    if (!onlyPlaceholders) return v;
  }

  const guaranteedFallback: RadoogaNewsItem[] = [
    {
      title: `Новости об артисте ${candidate.artist}`,
      summary: `Свежие материалы по запросу «${candidate.artist}». Откройте источник.`,
      source: 'Google News',
      publishedAt: new Date().toISOString(),
      url: `https://news.google.com/search?q=${encodeURIComponent(candidate.artist)}`,
      placeholder: true,
    },
    {
      title: `Обновления по треку ${candidate.title}`,
      summary: `Материалы про «${candidate.title}» и ${candidate.artist}.`,
      source: 'Google News',
      publishedAt: new Date().toISOString(),
      url: `https://news.google.com/search?q=${encodeURIComponent(`${candidate.artist} ${candidate.title}`)}`,
      placeholder: true,
    },
  ];

  const mergeNewsLists = (primary: RadoogaNewsItem[], secondary: RadoogaNewsItem[]): RadoogaNewsItem[] => {
    const seen = new Set(primary.map((item) => item.url));
    const out = [...primary];
    for (const item of secondary) {
      if (!item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      out.push(item);
    }
    return out;
  };
  const pickFreshNews = (items: RadoogaNewsItem[]): RadoogaNewsItem[] => {
    const unique = items.filter((item, index, array) => (
      array.findIndex((probe) => newsSessionKey(probe) === newsSessionKey(item)) === index
    ));
    const fresh = unique.filter((item) => !recentNewsKeys.has(newsSessionKey(item)));
    return fresh.length > 0 ? fresh : unique;
  };
  const markNewsSeen = (items: RadoogaNewsItem[]) => {
    for (const item of items) {
      keepRecentSet(recentNewsKeys, newsSessionKey(item), 1200);
    }
  };

  const fetchWorldMusicNews = async (): Promise<RadoogaNewsItem[]> => {
    const year = new Date().getFullYear();
    const queries = [
      `music industry ${year}`,
      'new music releases',
      'global music charts',
      'streaming music trends',
    ];
    for (const query of queries) {
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      const feedItems = await fetchRssAsNewsItems(rssUrl);
      const rows = feedItems
        .filter((item) => item.title && item.link)
        .slice(0, 6)
        .map((item) => ({
          title: item.title || 'Новости мира музыки',
          summary: item.contentSnippet || item.description,
          source: item.author || 'Music News',
          publishedAt: item.pubDate,
          url: item.link || '',
          imageUrl: item.thumbnail || item.enclosure?.link,
        }))
        .filter((item) => item.url.trim().length > 0);
      if (rows.length > 0) return rows;
    }
    return [
      {
        title: 'Новости мира музыки',
        summary: 'Релизы, чарты и события музыкальной индустрии.',
        source: 'Google News',
        publishedAt: new Date().toISOString(),
        url: 'https://news.google.com/search?q=music+industry+news',
        placeholder: true,
      },
    ];
  };

  const value = await (async () => {
    try {
      const response = await fetch(
        `/api/news/multi?artist=${encodeURIComponent(candidate.artist)}&title=${encodeURIComponent(candidate.title)}`
      );
      if (!response.ok) {
        debugResolver('news', `multi:http-${response.status}`);
        return guaranteedFallback;
      }
      const payload = (await response.json()) as {
        items?: Array<{
          title: string;
          url: string;
          publishedAt?: string;
          source: string;
          summary?: string;
          imageUrl?: string;
        }>;
        artistImage?: string;
      };
      const rows = payload.items || [];
      if (rows.length === 0) {
        debugResolver('news', 'multi:empty');
        return guaranteedFallback;
      }
      const mapped: RadoogaNewsItem[] = rows.map((it) => ({
        title: (it.title || '').trim(),
        url: (it.url || '').trim(),
        source: it.source || 'News',
        publishedAt: it.publishedAt,
        summary: it.summary,
        imageUrl: it.imageUrl || payload.artistImage,
      }));
      const includeWorldNews = hashStringSeed(`world-news:${candidate.id}`) % 10 < 3;
      const worldNews = includeWorldNews ? await fetchWorldMusicNews() : [];
      const mixed = pickFreshNews(mergeNewsLists(mapped, worldNews));
      const withPlaceholders = interleaveNewsPlaceholders(mixed, candidate);
      markNewsSeen(withPlaceholders);
      debugResolver('news', `multi:${mapped.length}+world:${worldNews.length}+pad=${withPlaceholders.length}`);
      return withPlaceholders;
    } catch {
      debugResolver('news', 'multi:error');
      const worldNews = await fetchWorldMusicNews();
      const mixedFallback = pickFreshNews(mergeNewsLists(worldNews, guaranteedFallback));
      markNewsSeen(mixedFallback);
      return mixedFallback.length > 0 ? mixedFallback : guaranteedFallback;
    }
  })();

  const onlyPlaceholders = value.length > 0 && value.every((n) => n.placeholder);
  if (!onlyPlaceholders) {
    cache.set(key, { value, expiresAt: now + ttlMs });
  }
  return value;
};

const fetchPhotosFromDuckDuckGoImages = async (query: string): Promise<RadoogaPhotoItem[]> => {
  try {
    const ddgUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
    const viaJina = `https://r.jina.ai/${ddgUrl}`;
    const response = await fetch(viaJina);
    if (!response.ok) return [];
    const text = await response.text();
    const urls = Array.from(text.matchAll(/https?:\/\/[^\s"'<>)\]]+/gi))
      .map((m) => m[0].replace(/[),.;]+$/g, ''))
      .filter((url) => {
        if (url.length < 16) return false;
        if (/\.(svg|gif|ico)(\?|$)/i.test(url)) return false;
        if (/logo|favicon|sprite|avatar-default|pixel|tracking|1x1/i.test(url)) return false;
        return (
          /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)
          || /external-content\.duckduckgo\.com\/iu\//i.test(url)
          || /encrypted-tbn\d?\.gstatic\.com/i.test(url)
        );
      });
    const unique = [...new Set(urls)];
    return unique.slice(0, 18).map((url) => ({ url, title: query }));
  } catch {
    return [];
  }
};

const fetchPhotosFromGoogleImagesJina = async (query: string): Promise<RadoogaPhotoItem[]> => {
  try {
    const searchUrl = `https://r.jina.ai/http://images.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl);
    if (!response.ok) return [];
    const text = await response.text();
    const imageMatches = Array.from(text.matchAll(/https?:\/\/[^"'\s)]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s)]*)?/gi))
      .map((match) => match[0])
      .filter((url, index, array) => array.indexOf(url) === index)
      .slice(0, 18);
    return imageMatches.map((url) => ({ url, title: query }));
  } catch {
    return [];
  }
};

const mergePhotoLists = (primary: RadoogaPhotoItem[], extra: RadoogaPhotoItem[]): RadoogaPhotoItem[] => {
  const seen = new Set(primary.map((p) => p.url));
  const out = [...primary];
  for (const row of extra) {
    if (seen.has(row.url)) continue;
    seen.add(row.url);
    out.push(row);
  }
  return out;
};

const MOOD_ONLY_PHOTO_QUERIES = [
  'liminal',
  'liminal space',
  'dreamcore',
  'dreamcore aesthetic',
  'aesthetic',
  'aesthetic photography',
];

export const resolveArtistPhotos = async (candidate: RadoogaCandidate): Promise<RadoogaPhotoItem[]> => {
  const useMoodOnlyQueries = hashStringSeed(`${candidate.id}:photos:mood-only`) % 10 < 4;
  const bucket = useMoodOnlyQueries ? 'mood-only' : 'artist';
  const freshnessBucket = Math.floor(recentPhotoUrls.size / 30);
  const key = `photos:${candidate.artist.toLowerCase()}:${bucket}:b${freshnessBucket}`;
  return withCache(key, 1000 * 60 * 60 * 4, async () => {
    const pickFreshPhotos = (items: RadoogaPhotoItem[]): RadoogaPhotoItem[] => {
      const unique = items.filter((item, index, array) => (
        array.findIndex((probe) => normalizePhotoUrlKey(probe.url) === normalizePhotoUrlKey(item.url)) === index
      ));
      const fresh = unique.filter((item) => !recentPhotoUrls.has(normalizePhotoUrlKey(item.url)));
      return fresh.length > 0 ? fresh : unique;
    };
    const markPhotosSeen = (items: RadoogaPhotoItem[]) => {
      for (const item of items) {
        if (item.url) keepRecentSet(recentPhotoUrls, normalizePhotoUrlKey(item.url), 1600);
      }
    };
    let searchImages: RadoogaPhotoItem[] = [];
    if (useMoodOnlyQueries) {
      const moodQueries = shuffleWithSeed(
        MOOD_ONLY_PHOTO_QUERIES,
        hashStringSeed(`${candidate.id}:${recentPhotoUrls.size}:mood-query-order`)
      );
      for (const query of moodQueries.slice(0, 4)) {
        const chunk = await fetchPhotosFromDuckDuckGoImages(query);
        searchImages = mergePhotoLists(
          searchImages,
          shuffleWithSeed(chunk, hashStringSeed(`${candidate.id}:${query}:chunk`))
        );
      }
      debugResolver('photos', `mood-only:${searchImages.length}`);
    } else {
      searchImages = await fetchPhotosFromDuckDuckGoImages(`${candidate.artist} musician`);
      const byArtistVibe = await fetchPhotosFromDuckDuckGoImages(`${candidate.artist} portrait`);
      const byVibe = await fetchPhotosFromDuckDuckGoImages(`${candidate.artist} live photo`);
      searchImages = mergePhotoLists(searchImages, byArtistVibe);
      searchImages = mergePhotoLists(searchImages, byVibe);
      debugResolver('photos', `artist:${searchImages.length}`);
    }
    if (searchImages.length === 0) {
      const fallbackQuery = useMoodOnlyQueries
        ? 'dreamcore photo'
        : `${candidate.artist} artist photo`;
      searchImages = await fetchPhotosFromGoogleImagesJina(fallbackQuery);
      if (searchImages.length > 0) debugResolver('photos', `google-fallback:${searchImages.length}`);
    }

    const wikiTitle = await wikiSearch(`"${candidate.artist}" musician`, 'en');
    if (!wikiTitle && searchImages.length > 0) {
      const picked = pickFreshPhotos(searchImages).slice(0, 10);
      markPhotosSeen(picked);
      return picked;
    }
    if (!wikiTitle) {
      const fallback = candidate.artworkUrl ? [{ url: candidate.artworkUrl, title: candidate.title }] : [];
      const padded = [...fallback];
      while (padded.length > 0 && padded.length < 5) {
        padded.push({ ...padded[padded.length % fallback.length], title: `${candidate.artist}` });
      }
      if (padded.length === 0) {
        for (let i = 0; i < 5; i += 1) {
          padded.push({
            url: buildFallbackImageDataUrl(candidate.artist || 'Radooga'),
            title: `${candidate.artist || 'Artist'} · fallback ${i + 1}`,
          });
        }
      }
      debugResolver('photos', `artwork-only:${padded.length}`);
      markPhotosSeen(padded);
      return padded;
    }
    const response = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&prop=images&titles=${encodeURIComponent(wikiTitle)}&imlimit=12&format=json&origin=*`
    );
    if (!response.ok) {
      const merged = pickFreshPhotos(
        [...searchImages, ...(candidate.artworkUrl ? [{ url: candidate.artworkUrl, title: candidate.title }] : [])]
      ).slice(0, 10);
      markPhotosSeen(merged);
      return merged;
    }
    const payload = await response.json() as {
      query?: { pages?: Record<string, { images?: Array<{ title?: string }> }> };
    };
    const page = Object.values(payload.query?.pages || {})[0];
    const imageTitles = (page?.images || [])
      .map((image) => image.title || '')
      .filter((title) => /\.(jpg|jpeg|png|webp)$/i.test(title))
      .slice(0, 10);
    const imageRequests = await Promise.all(
      imageTitles.map(async (title) => {
        const imageInfo = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&format=json&origin=*`
        );
        if (!imageInfo.ok) return null;
        const imagePayload = await imageInfo.json() as {
          query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string }> }> };
        };
        const infoPage = Object.values(imagePayload.query?.pages || {})[0];
        const imageUrl = infoPage?.imageinfo?.[0]?.url;
        return imageUrl ? { url: imageUrl, title } : null;
      })
    );
    const wikiPhotos = imageRequests.filter((item): item is RadoogaPhotoItem => Boolean(item));
    const photos = pickFreshPhotos([...searchImages, ...wikiPhotos]).slice(0, 10);
    if (photos.length > 0) {
      const shaped = useMoodOnlyQueries ? photos : (() => {
        const paddedPhotos = [...photos];
        while (paddedPhotos.length < 5 && photos.length > 0) {
          const source = photos[paddedPhotos.length % photos.length];
          paddedPhotos.push({
            ...source,
            url: `${source.url}${source.url.includes('?') ? '&' : '?'}v=${paddedPhotos.length + 1}`,
            title: `${candidate.artist} ${paddedPhotos.length + 1}`,
          });
        }
        return paddedPhotos;
      })();
      debugResolver('photos', `merged:${shaped.length}`);
      markPhotosSeen(shaped);
      return shaped;
    }
    const lastFallback = candidate.artworkUrl ? [{ url: candidate.artworkUrl, title: candidate.title }] : [];
    while (lastFallback.length > 0 && lastFallback.length < 5) {
      lastFallback.push({ ...lastFallback[lastFallback.length % 1], title: candidate.artist });
    }
    if (lastFallback.length === 0) {
      for (let i = 0; i < 5; i += 1) {
        lastFallback.push({
          url: buildFallbackImageDataUrl(candidate.artist || 'Radooga'),
          title: `${candidate.artist || 'Artist'} · fallback ${i + 1}`,
        });
      }
    }
    debugResolver('photos', `fallback:${lastFallback.length}`);
    markPhotosSeen(lastFallback);
    return lastFallback;
  });
};

export const resolveUpcomingConcerts = async (candidate: RadoogaCandidate): Promise<RadoogaConcertItem[]> => {
  const key = `concerts:${candidate.artist.toLowerCase()}`;
  return withCache(key, 1000 * 60 * 30, async () => {
    const parseConcertMeta = (item: NewsFeedItem): { city?: string; venue?: string } => {
      const text = `${item.title || ''} ${item.description || ''}`.replace(/\s+/g, ' ').trim();
      if (!text) return {};
      const cityMatchEn = text.match(/\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/);
      const cityMatchRu = text.match(/\bв\s+([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){0,2})\b/u);
      const venueMatchEn = text.match(/\bat\s+([A-Z][\w&'.-]+(?:\s+[A-Z][\w&'.-]+){0,4})\b/);
      const venueMatchRu = text.match(/\b(?:в|на)\s+([А-ЯЁ][\w&'.-]+(?:\s+[А-ЯЁ][\w&'.-]+){0,4})\b/u);
      return {
        city: cityMatchEn?.[1] || cityMatchRu?.[1],
        venue: venueMatchEn?.[1] || venueMatchRu?.[1],
      };
    };

    const year = new Date().getFullYear();
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`${candidate.artist} concerts ${year} dates`)}&hl=en-US&gl=US&ceid=US:en`;
    const feedItems = await fetchRssAsNewsItems(rssUrl);
    if (feedItems.length === 0) {
      debugResolver('concerts', 'fallback:fetch');
      return [
        {
          title: `Концерты и туры: ${candidate.artist}`,
          date: new Date().toISOString(),
          city: 'Уточняется',
          venue: 'Google',
          url: `https://www.google.com/search?q=${encodeURIComponent(`${candidate.artist} concert tour dates`)}`,
        },
      ];
    }
    const now = Date.now();
    const candidates = feedItems
      .filter((item) => item.title && item.link)
      .slice(0, 16)
      .map((item) => {
        const published = item.pubDate ? new Date(item.pubDate).getTime() : NaN;
        const meta = parseConcertMeta(item);
        return {
          title: item.title || 'Концерт',
          date: item.pubDate,
          url: item.link,
          published,
          city: meta.city,
          venue: meta.venue,
        };
      })
      .filter((item) => !Number.isNaN(item.published) && item.published >= now - (1000 * 60 * 60 * 24 * 21))
      .sort((a, b) => a.published - b.published)
      .slice(0, 5);
    const translatedTitles = await Promise.all(candidates.map((item) => translateToRussian(item.title)));
    const mapped = candidates.map((item, index) => ({
      title: translatedTitles[index] || item.title,
      date: item.date,
      city: item.city,
      venue: item.venue,
      url: item.url,
    }));
    const deduped: RadoogaConcertItem[] = [];
    const seenKeys = new Set<string>();
    for (const row of mapped) {
      const urlKey = (row.url || '').split(/[?#]/)[0];
      const titleKey = (row.title || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 96);
      const key = urlKey || titleKey;
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);
      deduped.push(row);
    }
    if (deduped.length > 0) {
      debugResolver('concerts', `live:${deduped.length}`);
      return deduped;
    }
    debugResolver('concerts', 'fallback:empty');
    return [
      {
        title: `Концерты и туры: ${candidate.artist}`,
        date: new Date().toISOString(),
        city: 'Уточняется',
        venue: 'Google',
        url: `https://www.google.com/search?q=${encodeURIComponent(`${candidate.artist} concert tour dates`)}`,
      },
    ];
  });
};

export const resolveTrackVideo = async (candidate: RadoogaCandidate): Promise<RadoogaVideoItem | null> => {
  const key = `video:${candidate.id}`;
  return withCache(key, 1000 * 60 * 60 * 6, async () => {
    try {
      const queries = [
        `${candidate.artist} ${candidate.title} official video`,
        `${candidate.artist} ${candidate.title} lyrics`,
        `${candidate.artist} ${candidate.title} live`,
        `${candidate.artist} ${candidate.title}`,
      ];
      for (const query of queries) {
        const feedUrl = `https://www.youtube.com/feeds/videos.xml?search_query=${encodeURIComponent(query)}`;
        const feedItems = await fetchRssAsNewsItems(feedUrl);
        const item = feedItems.find((entry) => {
          const link = entry.link || '';
          return /youtube\.com\/watch\?v=|youtu\.be\//i.test(link);
        });
        if (!item?.link) continue;
        const match = item.link.match(/(?:v=|\/)([A-Za-z0-9_-]{11})(?:[?&].*)?$/);
        const videoId = match?.[1];
        if (!videoId) continue;
        if (recentVideoIds.has(videoId)) continue;
        keepRecentSet(recentVideoIds, videoId, 80);
        debugResolver('video', `found:${query}`);
        return {
          videoId,
          title: item.title || `${candidate.artist} - ${candidate.title}`,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          embedUrl: `https://www.youtube.com/embed/${videoId}`,
          url: `https://www.youtube.com/watch?v=${videoId}`,
        };
      }
      debugResolver('video', 'none');
      return null;
    } catch {
      debugResolver('video', 'error');
      return null;
    }
  });
};

export const buildArtistMediaTimeline = (
  facts: RadoogaFactItem | null,
  news: RadoogaNewsItem[],
  concerts: RadoogaConcertItem[],
  photos: RadoogaPhotoItem[]
): ArtistMediaItem[] => {
  const timeline: ArtistMediaItem[] = [];

  const photoItems = photos.slice(0, 10).map((photo) => ({
    kind: 'photo' as const,
    title: photo.title || 'Фото артиста',
    imageUrl: photo.url,
  }));
  const newsItems = news.slice(0, 4).map((item) => ({
    kind: 'news' as const,
    title: item.title,
    subtitle: [item.source, item.publishedAt].filter(Boolean).join(' · '),
    imageUrl: item.imageUrl,
    url: item.url,
  }));
  const concertItems = concerts.slice(0, 3).map((item) => ({
    kind: 'concert' as const,
    title: item.title,
    subtitle: ['Концерт', item.date].filter(Boolean).join(' · '),
    url: item.url,
  }));
  const factItems = facts ? [{
    kind: 'fact' as const,
    title: facts.preview,
    subtitle: 'Факт',
  }] : [];

  const buckets: ArtistMediaItem[][] = [photoItems, factItems, newsItems, concertItems];
  let cursor = 0;
  let progress = true;
  while (progress && timeline.length < 12) {
    progress = false;
    for (const bucket of buckets) {
      const item = bucket[cursor];
      if (!item) continue;
      timeline.push(item);
      progress = true;
    }
    cursor += 1;
  }

  return timeline.slice(0, 10);
};
