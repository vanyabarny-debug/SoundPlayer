import { Album, TrackMetadata } from '../store/mockServer';

export const resolveAlbumCollectionId = (album: Pick<Album, 'id' | 'itunesCollectionId'>): string => {
  if (album.itunesCollectionId) return album.itunesCollectionId;
  const idMatch = album.id.match(/^itunes-(\d+)$/);
  return idMatch?.[1] || '';
};

export const getDownloadedAlbumTrackCount = (
  albumId: string,
  albumTrackIds: string[] = [],
  tracks: Record<string, TrackMetadata>
): number => {
  const downloadedIds = new Set<string>();

  Object.values(tracks).forEach((track) => {
    if (track.albumId === albumId) downloadedIds.add(track.id);
  });

  albumTrackIds.forEach((trackId) => {
    if (tracks[trackId]) downloadedIds.add(trackId);
  });

  return downloadedIds.size;
};

type ResolveAlbumTotalTracksInput = {
  downloadedTracks: number;
  persistedSourceTrackCount?: number;
  lookupTrackCount?: number;
  onlineTrackCount?: number;
  minValue?: number;
};

export const resolveAlbumTotalTracks = ({
  downloadedTracks,
  persistedSourceTrackCount = 0,
  lookupTrackCount = 0,
  onlineTrackCount = 0,
  minValue = 1,
}: ResolveAlbumTotalTracksInput): number => {
  return Math.max(
    minValue,
    Number(downloadedTracks || 0),
    Number(persistedSourceTrackCount || 0),
    Number(lookupTrackCount || 0),
    Number(onlineTrackCount || 0)
  );
};
