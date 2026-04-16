export type LyricsPreset = 'quoteCard' | 'cinemaFade' | 'subtitleGlass' | 'splitLines';

const PRESETS: LyricsPreset[] = ['quoteCard', 'cinemaFade', 'subtitleGlass', 'splitLines'];

const normalizeWhitespace = (value: string): string =>
  value
    .replace(/\s+/g, ' ')
    .trim();

const splitToPhraseUnits = (lyrics: string): string[] => {
  const rawLines = lyrics
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  if (rawLines.length > 0) return rawLines;
  return normalizeWhitespace(lyrics)
    .split(/(?<=[.!?])\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
};

export const chunkLyricsForDisplay = (lyrics: string, minLen: number = 55, maxLen: number = 120): string[] => {
  const units = splitToPhraseUnits(lyrics);
  const chunks: string[] = [];
  let buffer = '';
  for (const unit of units) {
    const candidate = buffer ? `${buffer} ${unit}` : unit;
    if (candidate.length <= maxLen) {
      buffer = candidate;
      continue;
    }
    if (buffer) {
      chunks.push(buffer.trim());
      buffer = unit;
      continue;
    }
    if (unit.length <= maxLen) {
      chunks.push(unit);
      buffer = '';
    } else {
      const words = unit.split(' ');
      let line = '';
      for (const word of words) {
        const lineCandidate = line ? `${line} ${word}` : word;
        if (lineCandidate.length > maxLen) {
          if (line) chunks.push(line.trim());
          line = word;
        } else {
          line = lineCandidate;
        }
      }
      if (line) chunks.push(line.trim());
      buffer = '';
    }
  }
  if (buffer) chunks.push(buffer.trim());

  const compact = chunks
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index, array) => {
      if (chunk.length >= minLen) return chunk;
      const next = array[index + 1];
      if (next && `${chunk} ${next}`.length <= maxLen) {
        array[index + 1] = `${chunk} ${next}`.trim();
        return '';
      }
      return chunk;
    })
    .filter(Boolean);

  return compact.slice(0, 12);
};

export const pickLyricsPreset = (seed: string): LyricsPreset => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % PRESETS.length;
  return PRESETS[index];
};

export const resolveLyricsChunkByProgress = (
  chunks: string[],
  progress: number
): string | null => {
  if (chunks.length === 0) return null;
  const safeProgress = Math.min(Math.max(progress, 0), 0.9999);
  const index = Math.floor(safeProgress * chunks.length);
  return chunks[Math.min(index, chunks.length - 1)] || null;
};
