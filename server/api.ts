import 'dotenv/config';
import express from 'express';
import Parser from 'rss-parser';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const app = express();
const port = Number(process.env.API_PORT || 8787);
const lyricsLookupCache = new Map<string, { lyrics: string; cachedAt: number }>();
const LYRICS_CACHE_TTL_MS = 1000 * 60 * 60 * 12;

app.use(express.json());

const parseLastJsonObject = (stdout: string): Record<string, unknown> => {
  const text = stdout.trim();
  if (!text) {
    throw new Error('Empty process output');
  }

  const candidates: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '{') {
      candidates.push(i);
    }
  }

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const fragment = text.slice(candidates[i]);
    try {
      return JSON.parse(fragment) as Record<string, unknown>;
    } catch {
      // try previous opening brace
    }
  }

  throw new Error('No JSON payload found in process output');
};

const sanitizeFilename = (value: string): string =>
  value
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeSearchQuery = (value: string): string =>
  value
    .replace(/[^\p{L}\p{N}\s'-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeStrictSearchQuery = (value: string): string =>
  value
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isPublicHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
};

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

app.get('/api/search/youtube', async (req, res) => {
  const rawQuery = typeof req.query?.query === 'string' ? req.query.query.trim() : '';
  const rawLimit = Number(req.query?.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 20) : 5;

  if (!rawQuery) {
    res.status(400).json({ error: 'Query is required' });
    return;
  }

  const normalizedQuery = normalizeSearchQuery(rawQuery) || rawQuery;
  const strictQuery = normalizeStrictSearchQuery(rawQuery);

  const runYtDlpSearch = (query: string): Promise<{
    ok: boolean;
    results: Array<{ id: string; title: string; artist: string; artworkUrl?: string; source: 'youtube' }>;
    errorText: string;
  }> => new Promise((resolve) => {
    const quotedQuery = `"${query}"`;
    const child = spawn(
      'yt-dlp',
      [
        '--dump-json',
        '--flat-playlist',
        '--default-search',
        `ytsearch${limit}`,
        quotedQuery,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), 25000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      const fullErrorText = stderr.trim();
      if (code !== 0) {
        resolve({ ok: false, results: [], errorText: fullErrorText || `yt-dlp exited with code ${code}` });
        return;
      }

      try {
        const lines = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

        const results = lines
          .map((line) => {
            try {
              return JSON.parse(line) as Record<string, unknown>;
            } catch {
              return null;
            }
          })
          .filter((item): item is Record<string, unknown> => Boolean(item))
          .map((item) => {
            const id = typeof item.id === 'string' ? item.id : '';
            const title = typeof item.title === 'string' ? item.title : '';
            const artist =
              (typeof item.channel === 'string' && item.channel) ||
              (typeof item.uploader === 'string' && item.uploader) ||
              'YouTube';
            const artworkUrl = id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined;

            if (!id || !title) return null;
            return {
              id: `yt-${id}`,
              title,
              artist,
              artworkUrl,
              source: 'youtube' as const,
            };
          })
          .filter((item): item is { id: string; title: string; artist: string; artworkUrl?: string; source: 'youtube' } => Boolean(item))
          .slice(0, limit);

        resolve({ ok: true, results, errorText: fullErrorText });
      } catch (error) {
        const parseMessage = error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error);
        resolve({ ok: false, results: [], errorText: parseMessage });
      }
    });
  });

  void (async () => {
    const firstAttempt = await runYtDlpSearch(normalizedQuery);
    const shouldRetryWithStrict =
      (firstAttempt.results.length === 0 || !firstAttempt.ok) &&
      strictQuery.length > 0 &&
      strictQuery !== normalizedQuery;

    const finalAttempt = shouldRetryWithStrict ? await runYtDlpSearch(strictQuery) : firstAttempt;
    const finalErrorText = finalAttempt.errorText || firstAttempt.errorText;
    const loweredError = finalErrorText.toLowerCase();
    const hasRestrictionSignal = loweredError.includes('403') || loweredError.includes('unavailable');

    if (!finalAttempt.ok) {
      // eslint-disable-next-line no-console
      console.error('[youtube-search] full yt-dlp error:', finalErrorText || 'Unknown yt-dlp error');
      if (hasRestrictionSignal) {
        // eslint-disable-next-line no-console
        console.error('[youtube-search] possible IP restriction/blocked content detected');
      }
      res.status(502).json({
        error: 'YouTube search failed',
        details: finalErrorText.slice(0, 1000),
      });
      return;
    }

    res.json({ results: finalAttempt.results });
  })().catch((error) => {
    const message = error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error);
    // eslint-disable-next-line no-console
    console.error('[youtube-search] unexpected error:', message);
    res.status(500).json({ error: 'YouTube search failed unexpectedly' });
  });
});

app.post('/api/metadata/extract', (req, res) => {
  const url = req.body?.url;
  if (typeof url !== 'string' || !isPublicHttpUrl(url)) {
    res.status(400).json({ error: 'Invalid public URL' });
    return;
  }

  const child = spawn(
    'yt-dlp',
    ['--dump-single-json', '--skip-download', '--no-warnings', '--socket-timeout', '15', url],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let stdout = '';
  let stderr = '';
  const timeout = setTimeout(() => child.kill('SIGKILL'), 20000);

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('close', async (code) => {
    clearTimeout(timeout);

    if (code !== 0) {
      res.status(502).json({
        error: 'yt-dlp failed',
        details: stderr.slice(0, 500),
      });
      return;
    }

    try {
      const raw = JSON.parse(stdout) as Record<string, unknown>;
      res.json({
        id: raw.id,
        title: raw.title,
        uploader: raw.uploader,
        channel: raw.channel,
        duration: raw.duration,
        thumbnail: raw.thumbnail,
        webpage_url: raw.webpage_url,
        extractor: raw.extractor,
      });
    } catch {
      res.status(500).json({ error: 'Failed to parse yt-dlp JSON' });
    }
  });
});

app.post('/api/download', (req, res) => {
  const query = req.body?.query;
  const url = req.body?.url;
  const title = req.body?.title;
  const artist = req.body?.artist;
  const album = req.body?.album;
  const artworkUrl = req.body?.artworkUrl;

  const normalizedQuery = typeof query === 'string' ? query.trim() : '';
  const normalizedUrl = typeof url === 'string' ? url.trim() : '';
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  const normalizedArtist = typeof artist === 'string' ? artist.trim() : '';
  const synthesizedFromMeta = [normalizedArtist, normalizedTitle].filter(Boolean).join(' - ').trim();
  const normalizedSearch = normalizedQuery || normalizedUrl || synthesizedFromMeta;
  if (!normalizedSearch) {
    res.status(400).json({ error: 'Search query is required' });
    return;
  }

  const payload = {
    query: normalizedSearch,
    title: normalizedTitle,
    artist: normalizedArtist,
    album: typeof album === 'string' ? album.trim() : '',
    artworkUrl: typeof artworkUrl === 'string' ? artworkUrl.trim() : '',
  };

  const child = spawn(
    'python3',
    [
      '-c',
      [
        'import json, sys',
        'from media_engine import process_media',
        'payload = json.loads(sys.argv[1])',
        'result = process_media(payload)',
        'print(json.dumps(result))',
      ].join('; '),
      JSON.stringify(payload),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let stdout = '';
  let stderr = '';
  const timeout = setTimeout(() => child.kill('SIGKILL'), 60000);

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('close', (code) => {
    clearTimeout(timeout);

    if (code !== 0) {
      res.status(502).json({
        error: 'process_media failed',
        details: stderr.slice(0, 1000),
      });
      return;
    }

    try {
      const parsedPayload = parseLastJsonObject(stdout);

      const filePathToDownload = typeof parsedPayload.file_path === 'string' ? parsedPayload.file_path : null;
      if (!filePathToDownload) {
        res.status(500).json({ error: 'Processed mp3 file path not found in response' });
        return;
      }

      const preferredName =
        typeof parsedPayload.filename === 'string' ? parsedPayload.filename : path.basename(filePathToDownload);
      const attachmentName = sanitizeFilename(preferredName) || 'track.mp3';
      const attachmentWithExtension = attachmentName.toLowerCase().endsWith('.mp3')
        ? attachmentName
        : `${attachmentName}.mp3`;

      res.setHeader('Content-Type', 'audio/mpeg');
      if (typeof parsedPayload.lyrics === 'string' && parsedPayload.lyrics.trim().length > 0) {
        const compactLyrics = parsedPayload.lyrics.trim().slice(0, 1200);
        res.setHeader('X-Track-Lyrics', encodeURIComponent(compactLyrics));
      }
      res.download(filePathToDownload, attachmentWithExtension, (error) => {
        if (error && !res.headersSent) {
          res.status(500).json({ error: 'Failed to send processed file' });
        }
      });
    } catch {
      res.status(500).json({ error: 'Failed to parse process_media response' });
    }
  });
});

app.post('/api/lyrics/lookup', (req, res) => {
  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const artist = typeof req.body?.artist === 'string' ? req.body.artist.trim() : '';

  if (!query && !title && !artist) {
    res.status(400).json({ error: 'At least one of query, title or artist is required' });
    return;
  }

  const payload = {
    query,
    title,
    artist,
  };
  const cacheKey = `${artist.toLowerCase()}|${title.toLowerCase()}|${query.toLowerCase()}`;
  const cached = lyricsLookupCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < LYRICS_CACHE_TTL_MS) {
    res.json({ lyrics: cached.lyrics });
    return;
  }

  const child = spawn(
    'python3',
    [
      '-c',
      [
        'import json, sys',
        'from media_engine import _fetch_lyrics, _sanitize_lyrics_text',
        'payload = json.loads(sys.argv[1])',
        'raw = _fetch_lyrics(payload.get("title", ""), payload.get("artist", ""), payload.get("query", ""))',
        'lyrics = _sanitize_lyrics_text(raw)',
        'print(json.dumps({"lyrics": lyrics or ""}))',
      ].join('; '),
      JSON.stringify(payload),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let stdout = '';
  let stderr = '';
  const timeout = setTimeout(() => child.kill('SIGKILL'), 60000);

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('close', (code) => {
    clearTimeout(timeout);

    if (code !== 0) {
      res.status(502).json({
        error: 'Lyrics lookup failed',
        details: stderr.slice(0, 1000),
      });
      return;
    }

    try {
      const parsedPayload = parseLastJsonObject(stdout);
      const lyrics = typeof parsedPayload.lyrics === 'string' ? parsedPayload.lyrics : '';
      lyricsLookupCache.set(cacheKey, { lyrics, cachedAt: Date.now() });
      res.json({ lyrics });
    } catch {
      res.status(500).json({ error: 'Failed to parse lyrics lookup response' });
    }
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Metadata API listening on http://localhost:${port}`);
});
