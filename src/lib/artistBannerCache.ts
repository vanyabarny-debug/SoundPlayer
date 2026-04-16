import { saveImageFile } from './db';
import { Artist } from '../store/mockServer';

type EnsureArtistBannerArgs = {
  artist: Artist;
  coverBlob?: Blob | null;
  coverUrl?: string;
  updateArtist: (id: string, updates: Partial<Artist>) => void;
};

export const ensureArtistBannerFromTrackCover = async ({
  artist,
  coverBlob,
  coverUrl,
  updateArtist,
}: EnsureArtistBannerArgs): Promise<string | undefined> => {
  if (!artist?.id || artist.bannerUrl) return artist.bannerUrl;

  let blob = coverBlob || null;
  if (!blob && coverUrl) {
    try {
      const response = await fetch(coverUrl);
      if (response.ok) blob = await response.blob();
    } catch {
      blob = null;
    }
  }

  if (!blob) return undefined;
  const bannerId = `artist-banner-${artist.id}`;
  await saveImageFile(bannerId, blob);
  updateArtist(artist.id, { bannerUrl: bannerId });
  return bannerId;
};
