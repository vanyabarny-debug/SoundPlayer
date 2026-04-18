import 'dotenv/config';
import express from 'express';
import Parser from 'rss-parser';
import yts from 'yt-search';

const app = express();
const port = Number(process.env.PORT || process.env.API_PORT || 8787);
const lyricsLookupCache = new Map<string, { lyrics: string; cachedAt: number }>();
const LYRICS_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const frontendOrigin = (process.env.FRONTEND_ORIGIN || '').trim();
const allowAnyOrigin = frontendOrigin.length === 0;

app.use(express.json());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowAnyOrigin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin === frontendOrigin) {
    res.setHeader('Access-Control-Allow-Origin', frontendOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

const normalizeSearchQuery = (value: string): string =>
  value
    .replace(/[^\p{L}\p{N}\s'-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const RSS_PROXY_HOSTS = new Set(['news.google.com', 'www.youtube.com']);

type RssProxyItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
  author?: string;
  thumbnail?: string;
  content?: string;
  contentSnippet?: string;
};

const decodeXmlText = (raw: string): string => {
  let s = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
  s = s.replace(/<[^>]+>/g, ' ');
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
};

const extractFirstTagContent = (block: string, tag: string): string => {
  const safe = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<${safe}[^>]*>([\\s\\S]*?)</${safe}>`, 'i');
  const m = block.match(re);
  if (!m) return '';
  return decodeXmlText(m[1]);
};

const CHROME_LIKE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const extractAtomLinkHref = (block: string): string => {
  const withRel = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
  if (withRel) return withRel[1].trim();
  const hrefFirst = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  return hrefFirst ? hrefFirst[1].trim() : '';
};

const extractGuidOrIdUrl = (block: string): string => {
  const guidMatch = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
  if (guidMatch) {
    const inner = decodeXmlText(guidMatch[1]).trim();
    if (inner.startsWith('http')) return inner;
  }
  const idText = extractFirstTagContent(block, 'id').trim();
  if (idText.startsWith('http')) return idText;
  return '';
};

/** Текст внутри <link>...</link>, href на <link>, затем guid / atom id. */
const extractRssItemLink = (block: string): string => {
  let link = extractFirstTagContent(block, 'link').trim();
  if (link) return link;
  const hrefOnLink = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*(?:\/>|>)/i);
  if (hrefOnLink) return hrefOnLink[1].trim();
  return extractGuidOrIdUrl(block);
};

const parseRssXmlToItems = (xml: string): RssProxyItem[] => {
  const items: RssProxyItem[] = [];

  if (/<entry[\s>]/i.test(xml)) {
    const parts = xml.split(/<entry[^>]*>/i);
    for (let i = 1; i < parts.length; i += 1) {
      const block = parts[i].split(/<\/entry>/i)[0];
      const title =
        extractFirstTagContent(block, 'title') || extractFirstTagContent(block, 'media:title');
      let link = extractAtomLinkHref(block);
      if (!link) link = extractGuidOrIdUrl(block);
      if (!link) {
        const ytId = block.match(/<yt:videoId>([^<\s]+)<\/yt:videoId>/i)?.[1]?.trim();
        if (ytId) link = `https://www.youtube.com/watch?v=${ytId}`;
      }
      if (!link && title.trim()) {
        link = `https://news.google.com/search?q=${encodeURIComponent(title.trim())}`;
      }
      if (!link) continue;
      const pubDate =
        extractFirstTagContent(block, 'published') || extractFirstTagContent(block, 'updated');
      const thumbMatch =
        block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i) ||
        block.match(/url=["']([^"']+)["'][^>]*\/?>\s*<\/media:thumbnail>/i);
      items.push({
        title,
        link,
        pubDate,
        thumbnail: thumbMatch?.[1],
      });
    }
    return items;
  }

  const parts = xml.split(/<item[^>]*>/i);
  for (let i = 1; i < parts.length; i += 1) {
    const block = parts[i].split(/<\/item>/i)[0];
    const title = extractFirstTagContent(block, 'title');
    let link = extractRssItemLink(block);
    if (!link && title.trim()) {
      link = `https://news.google.com/search?q=${encodeURIComponent(title.trim())}`;
    }
    if (!title.trim() || !link) continue;
    const pubDate = extractFirstTagContent(block, 'pubDate');
    const descPlain = extractFirstTagContent(block, 'description');
    const contentEncoded = extractFirstTagContent(block, 'content:encoded');
    const description =
      (contentEncoded.length >= descPlain.length ? contentEncoded : descPlain) || descPlain || contentEncoded;
    const author = extractFirstTagContent(block, 'source') || undefined;
    items.push({ title, link, pubDate, description, author });
  }
  return items;
};

app.get('/api/rss/proxy', async (req, res) => {
  const raw = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!raw) {
    res.status(400).json({ error: 'url is required' });
    return;
  }
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    res.status(400).json({ error: 'invalid url' });
    return;
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    res.status(400).json({ error: 'invalid protocol' });
    return;
  }
  if (!RSS_PROXY_HOSTS.has(target.hostname)) {
    res.status(403).json({ error: 'host not allowed' });
    return;
  }

  try {
    const upstream = await fetch(raw, {
      headers: {
        'User-Agent': CHROME_LIKE_UA,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!upstream.ok) {
      res.status(502).json({ error: 'upstream failed', status: upstream.status });
      return;
    }
    const xml = await upstream.text();
    const items = parseRssXmlToItems(xml);
    res.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: 'rss fetch failed', details: message.slice(0, 240) });
  }
});

const rssParser = new Parser({
  timeout: 18000,
  headers: { 'User-Agent': CHROME_LIKE_UA },
});

const stripTagsForNews = (html: string): string =>
  String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

type MultiNewsRow = {
  title: string;
  url: string;
  publishedAt?: string;
  source: string;
  summary?: string;
  imageUrl?: string;
};

app.get('/api/news/multi', async (req, res) => {
  const artist = typeof req.query.artist === 'string' ? req.query.artist.trim() : '';
  if (!artist) {
    res.status(400).json({ error: 'artist is required' });
    return;
  }

  const artistLc = artist.toLowerCase();
  const qMusic = `${artist} music news`;

  const feedDefs: { url: string; label: string }[] = [
    {
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(qMusic)}&hl=ru&gl=RU&ceid=RU:ru`,
      label: 'Google News',
    },
    {
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(qMusic)}&hl=en-US&gl=US&ceid=US:en`,
      label: 'Google News',
    },
    { url: 'https://www.theguardian.com/music/rss', label: 'The Guardian' },
    { url: 'https://pitchfork.com/rss/news/', label: 'Pitchfork' },
    { url: 'https://www.nme.com/news/music/rss', label: 'NME' },
  ];

  const loadFeed = async (def: { url: string; label: string }): Promise<MultiNewsRow[]> => {
    try {
      const feed = await rssParser.parseURL(def.url);
      const out: MultiNewsRow[] = [];
      for (const it of feed.items || []) {
        const title = String(it.title || '').trim();
        const linkRaw = it.link || it.guid;
        const url =
          typeof linkRaw === 'string'
            ? linkRaw.trim()
            : linkRaw && typeof linkRaw === 'object' && 'href' in linkRaw
              ? String((linkRaw as { href?: string }).href || '').trim()
              : String(linkRaw || '').trim();
        if (!title || !url.startsWith('http')) continue;
        const snippet =
          typeof it.contentSnippet === 'string' ? it.contentSnippet.trim() : '';
        const contentStr = typeof it.content === 'string' ? stripTagsForNews(it.content) : '';
        const blob = `${title} ${snippet} ${contentStr}`.toLowerCase();
        if (!blob.includes(artistLc)) continue;
        let summary: string | undefined;
        const rawSum = snippet || contentStr.slice(0, 600);
        if (rawSum.length > 48) {
          summary = rawSum.length > 520 ? `${rawSum.slice(0, 520).trimEnd()}…` : rawSum;
        }
        out.push({
          title,
          url,
          publishedAt: it.pubDate || it.isoDate,
          source: def.label,
          summary,
        });
      }
      return out;
    } catch {
      return [];
    }
  };

  const settled = await Promise.allSettled(feedDefs.map(loadFeed));
  const fromFeeds = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));

  let fromDdg: MultiNewsRow[] = [];
  try {
    const ddgUrl = `https://duckduckgo.com/news.js?l=us-en&o=json&q=${encodeURIComponent(qMusic)}&s=25`;
    const dr = await fetch(ddgUrl, {
      headers: { 'User-Agent': CHROME_LIKE_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (dr.ok) {
      const dj = (await dr.json()) as {
        results?: Array<{ title?: string; url?: string; excerpt?: string; date?: number }>;
      };
      for (const row of dj.results || []) {
        const title = String(row.title || '').trim();
        const url = String(row.url || '').trim();
        if (!title || !url.startsWith('http')) continue;
        const blob = `${title} ${row.excerpt || ''}`.toLowerCase();
        if (!blob.includes(artistLc)) continue;
        const ex = (row.excerpt || '').trim();
        const summary = ex.length > 48 ? (ex.length > 520 ? `${ex.slice(0, 520)}…` : ex) : undefined;
        const publishedAt =
          typeof row.date === 'number' && Number.isFinite(row.date)
            ? new Date(row.date * 1000).toISOString()
            : undefined;
        fromDdg.push({
          title,
          url,
          publishedAt,
          source: 'DuckDuckGo News',
          summary,
        });
      }
    }
  } catch {
    /* ignore */
  }

  const merged = [...fromFeeds, ...fromDdg];
  const seen = new Set<string>();
  const deduped: MultiNewsRow[] = [];
  for (const row of merged) {
    const key = row.url.split(/[?#]/)[0];
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  deduped.sort((a, b) => {
    const ta = Date.parse(a.publishedAt || '') || 0;
    const tb = Date.parse(b.publishedAt || '') || 0;
    return tb - ta;
  });

  let artistImage: string | undefined;
  try {
    const dz = await fetch(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}&limit=1`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (dz.ok) {
      const dj = (await dz.json()) as { data?: Array<{ picture_medium?: string; picture?: string }> };
      artistImage = dj.data?.[0]?.picture_medium || dj.data?.[0]?.picture;
    }
  } catch {
    /* ignore */
  }

  const items = deduped.slice(0, 24).map((row) => ({
    ...row,
    imageUrl: artistImage,
  }));

  res.json({ items, artistImage });
});

/** Ответ Pexels Video Search — только поля, нужные для выбора mp4. */
type PexelsVideoFile = {
  id?: number;
  quality?: string;
  file_type?: string;
  width?: number;
  height?: number;
  link?: string;
};

type PexelsVideo = {
  id: number;
  width?: number;
  height?: number;
  url?: string;
  image?: string;
  video_files?: PexelsVideoFile[];
};

type AmbientClipItem = {
  id: string;
  title: string;
  videoUrl: string;
  pageUrl: string;
  thumb?: string;
};

const pickPexelsMp4Link = (video: PexelsVideo): string | null => {
  const files = (video.video_files || []).filter((f) => {
    const link = (f.link || '').trim();
    if (!link) return false;
    const ft = (f.file_type || '').toLowerCase();
    return ft === 'video/mp4' || link.includes('.mp4');
  });
  if (files.length === 0) return null;
  const score = (f: PexelsVideoFile): number => {
    const w = f.width || 0;
    const h = f.height || 0;
    const portrait = h >= w ? 80 : 0;
    const q = f.quality === 'hd' ? 40 : f.quality === 'sd' ? 28 : 12;
    const mid = w >= 720 && w <= 1440 ? 25 : w > 0 ? 10 : 0;
    return portrait + q + mid;
  };
  return [...files].sort((a, b) => score(b) - score(a))[0]?.link?.trim() || null;
};

const mapPexelsVideosToItems = (videos: PexelsVideo[] | undefined): AmbientClipItem[] =>
  (videos || [])
    .map((v) => {
      const videoUrl = pickPexelsMp4Link(v);
      if (!videoUrl) return null;
      const pageUrl = (v.url || `https://www.pexels.com/video/${v.id}/`).trim();
      return {
        id: String(v.id),
        title: 'Pexels',
        videoUrl,
        pageUrl,
        thumb: v.image,
      };
    })
    .filter((row): row is AmbientClipItem => Boolean(row));

/**
 * GET /api/pexels/videos/search?query=...&per_page=12
 * Требует PEXELS_API_KEY в окружении (https://www.pexels.com/api/)
 */
app.get('/api/pexels/videos/search', async (req, res) => {
  if (!process.env.PEXELS_API_KEY) {
    console.error('!!! PEXELS_API_KEY IS MISSING IN SERVER ENV !!!');
  }
  const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
  if (!query) {
    res.status(400).json({ error: 'query is required' });
    return;
  }
  const apiKey = process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) {
    console.warn('pexels: PEXELS_API_KEY is not set');
    res.json({ items: [] });
    return;
  }
  const rawPer = Number(req.query.per_page);
  const perPage = Number.isFinite(rawPer) && rawPer > 0 ? Math.min(Math.floor(rawPer), 20) : 12;
  const rawPage = Number(req.query.page);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.min(Math.floor(rawPage), 80) : 1;
  const upstreamUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&orientation=portrait`;
  console.log('Pexels upstream URL:', upstreamUrl);
  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(14000),
    });
    if (!upstream.ok) {
      console.warn('pexels upstream failed', upstream.status);
      res.status(502).json({ error: 'pexels upstream failed', status: upstream.status });
      return;
    }
    const data = (await upstream.json()) as { videos?: PexelsVideo[] };
    const items = mapPexelsVideosToItems(data.videos);
    console.log('Pexels found:', items.length, 'for query:', query.slice(0, 80));
    res.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: 'pexels search failed', details: message.slice(0, 200) });
  }
});

app.get('/api/search/itunes', async (req, res) => {
  const rawQuery = typeof req.query?.query === 'string' ? req.query.query.trim() : '';
  const rawEntity = typeof req.query?.entity === 'string' ? req.query.entity.trim() : '';
  const rawLimit = Number(req.query?.limit);
  const entity = rawEntity || 'song';
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 50) : 25;

  if (!rawQuery) {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  const params = new URLSearchParams({
    term: rawQuery,
    entity,
    limit: String(limit),
    media: 'music',
    country: 'US',
  });

  const upstreamUrl = `https://itunes.apple.com/search?${params.toString()}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': CHROME_LIKE_UA,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) {
      res.status(502).json({
        error: 'itunes search failed',
        status: upstream.status,
      });
      return;
    }
    const payload = (await upstream.json()) as {
      resultCount?: number;
      results?: unknown[];
    };
    res.json({
      resultCount: Number(payload.resultCount || 0),
      results: Array.isArray(payload.results) ? payload.results : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: 'itunes search failed', details: message.slice(0, 240) });
  }
});

app.get('/api/search/youtube', async (req, res) => {
  const rawQuery = typeof req.query?.query === 'string' ? req.query.query.trim() : '';
  const rawLimit = Number(req.query?.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 20) : 5;

  if (!rawQuery) {
    res.status(400).json({ error: 'Query is required' });
    return;
  }

  const normalizedQuery = normalizeSearchQuery(rawQuery) || rawQuery;
  try {
    const searchResult = await yts(normalizedQuery);
    const results = (searchResult.videos || [])
      .filter((item) => Boolean(item.videoId && item.title))
      .slice(0, limit)
      .map((item) => ({
        id: `yt-${item.videoId}`,
        videoId: item.videoId,
        title: item.title,
        artist: item.author?.name || 'YouTube',
        artworkUrl: item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${item.videoId}`,
        source: 'youtube' as const,
      }));
    res.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: 'YouTube search failed', details: message.slice(0, 500) });
  }
});

app.post('/api/lyrics/lookup', async (req, res) => {
  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const artist = typeof req.body?.artist === 'string' ? req.body.artist.trim() : '';

  if (!query && !title && !artist) {
    res.status(400).json({ error: 'At least one of query, title or artist is required' });
    return;
  }

  const cacheKey = `${artist.toLowerCase()}|${title.toLowerCase()}|${query.toLowerCase()}`;
  const cached = lyricsLookupCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < LYRICS_CACHE_TTL_MS) {
    res.json({ lyrics: cached.lyrics });
    return;
  }
  try {
    if (!artist || !title) {
      res.json({ lyrics: '' });
      return;
    }
    const upstream = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!upstream.ok) {
      res.json({ lyrics: '' });
      return;
    }
    const payload = (await upstream.json()) as { lyrics?: string };
    const lyrics = typeof payload.lyrics === 'string' ? payload.lyrics.trim() : '';
    lyricsLookupCache.set(cacheKey, { lyrics, cachedAt: Date.now() });
    res.json({ lyrics });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: 'Lyrics lookup failed', details: message.slice(0, 500) });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Metadata API listening on http://localhost:${port}`);
});
