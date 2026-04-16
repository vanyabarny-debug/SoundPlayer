import express from 'express';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const app = express();
const port = Number(process.env.API_PORT || 8787);

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

const isPublicHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
};

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
  const title = req.body?.title;
  const artist = req.body?.artist;
  const album = req.body?.album;
  const artworkUrl = req.body?.artworkUrl;

  if (typeof query !== 'string' || query.trim().length === 0) {
    res.status(400).json({ error: 'Query is required' });
    return;
  }

  const payload = {
    query: query.trim(),
    title: typeof title === 'string' ? title.trim() : '',
    artist: typeof artist === 'string' ? artist.trim() : '',
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
      if (!filePathToDownload || !fs.existsSync(filePathToDownload)) {
        res.status(500).json({ error: 'Processed mp3 file not found on disk' });
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Metadata API listening on http://localhost:${port}`);
});
