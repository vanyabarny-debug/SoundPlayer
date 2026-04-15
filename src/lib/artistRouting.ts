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

export const resolveFirstArtistId = (artistRefs: unknown, artists: Record<string, Artist>): string | null => {
  const refs = toStringArray(artistRefs);
  for (const ref of refs) {
    const id = resolveArtistId(ref, artists);
    if (id) return id;
  }
  return null;
};
