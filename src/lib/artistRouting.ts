import { Artist } from '../store/mockServer';
import { toStringArray } from './safe';

export const resolveArtistId = (artistRef: string, artists: Record<string, Artist>): string | null => {
  if (!artistRef) return null;
  if (artists[artistRef]) return artistRef;

  const normalized = artistRef.trim().toLowerCase();
  if (!normalized) return null;

  const exactByName = Object.values(artists).find((artist) => artist.name.trim().toLowerCase() === normalized);
  if (exactByName) return exactByName.id;

  const partialByName = Object.values(artists).find((artist) => artist.name.trim().toLowerCase().includes(normalized));
  return partialByName?.id ?? null;
};

export const normalizeArtistName = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export const splitArtistNames = (value: string): string[] =>
  value
    .split(/\s*(?:,|&| x | X | and |;)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);

/** Разделитель «фит» в строке артиста (iTunes и др.). */
const ARTIST_FEAT_SPLIT = /\s+(?:feat\.?|ft\.?|featuring|with)\s+/i;

export const extractFeaturingArtists = (title: string): string[] => {
  const out: string[] = [];
  const re =
    /(?:\(|\[)?\s*(?:feat\.?|ft\.?|featuring|with)\s+([^)\]\|]+?)(?:\)|\]|$|\|)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(title)) !== null) {
    const chunk = m[1]?.trim();
    if (!chunk) continue;
    for (const name of splitArtistNames(chunk)) {
      if (name && !out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
    }
  }
  return out;
};

export const splitArtistField = (value: string): { primaryArtists: string[]; featuringArtists: string[] } => {
  const normalized = value.trim();
  if (!normalized) return { primaryArtists: [], featuringArtists: [] };
  const parts = normalized.split(ARTIST_FEAT_SPLIT);
  if (parts.length === 1) {
    return { primaryArtists: splitArtistNames(parts[0]), featuringArtists: [] };
  }
  const primaryArtists = splitArtistNames(parts[0]);
  const featuringArtists = parts
    .slice(1)
    .flatMap((p) => splitArtistNames(p))
    .filter(Boolean);
  return { primaryArtists, featuringArtists };
};

/** Все исполнители для UI/навигации: поле artist + фиты из названия. */
export const listRadoogaPerformers = (artist: string, title: string): string[] => {
  const { primaryArtists, featuringArtists } = splitArtistField(artist);
  const fromTitle = extractFeaturingArtists(title);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const name of [...primaryArtists, ...featuringArtists, ...fromTitle]) {
    const t = name.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    ordered.push(t);
  }
  return ordered;
};

export const expandArtistRef = (artistRef: string): string[] => {
  const { primaryArtists, featuringArtists } = splitArtistField(artistRef);
  return Array.from(new Set([...primaryArtists, ...featuringArtists]));
};

export const resolveFirstArtistId = (artistRefs: unknown, artists: Record<string, Artist>): string | null => {
  const refs = toStringArray(artistRefs);
  for (const ref of refs) {
    const expandedRefs = expandArtistRef(ref);
    const refsToTry = expandedRefs.length > 0 ? expandedRefs : [ref];
    for (const refCandidate of refsToTry) {
      const id = resolveArtistId(refCandidate, artists);
      if (id) return id;
    }
  }
  return null;
};

export const buildVirtualArtistRoute = (artistName: string): string => {
  const normalized = artistName.trim();
  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'artist';
  return `/artist/itunes-${encodeURIComponent(slug)}?source=itunes&name=${encodeURIComponent(normalized)}`;
};

export const resolveArtistRoute = (artistRef: string, artists: Record<string, Artist>): string => {
  const localId = resolveArtistId(artistRef, artists);
  if (localId) return `/artist/${localId}`;
  const expandedRefs = expandArtistRef(artistRef);
  for (const refCandidate of expandedRefs) {
    const parsedId = resolveArtistId(refCandidate, artists);
    if (parsedId) return `/artist/${parsedId}`;
  }
  return buildVirtualArtistRoute(artistRef);
};
