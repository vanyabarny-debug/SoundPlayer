import { TrackMetadata } from '../store/mockServer';
import { splitArtistNames } from './artistRouting';
import { toStringArray } from './safe';

type UpsertPreviewOnlyTrackParams = {
  existingTracks: Record<string, TrackMetadata>;
  resultId: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  previewUrl?: string;
  ownerId?: string;
  addTrack: (track: TrackMetadata) => void;
  updateTrack: (id: string, data: Partial<TrackMetadata>) => void;
};

const normalize = (value: string): string => value.trim().toLowerCase();

export const upsertPreviewOnlyTrack = ({
  existingTracks,
  resultId,
  title,
  artist,
  artworkUrl,
  previewUrl,
  ownerId,
  addTrack,
  updateTrack,
}: UpsertPreviewOnlyTrackParams): string => {
  const normalizedTitle = normalize(title);
  const onlineArtists = splitArtistNames(artist).map(normalize);
  const matchedTrack = Object.values(existingTracks).find((track) => {
    if (normalize(track.title) !== normalizedTitle) return false;
    const trackArtists = [
      ...toStringArray(track.artistIds),
      ...toStringArray(track.features),
    ].map(normalize);
    return onlineArtists.some((artistName) => trackArtists.includes(artistName));
  });

  if (matchedTrack) {
    updateTrack(matchedTrack.id, {
      previewUrl: previewUrl || matchedTrack.previewUrl,
      isPreviewOnly: true,
      coverUrl: matchedTrack.coverUrl || artworkUrl || matchedTrack.coverUrl,
    });
    return matchedTrack.id;
  }

  const trackId = `preview-${Date.now()}-${resultId}`;
  const artistIds = splitArtistNames(artist);
  addTrack({
    id: trackId,
    title: title.trim() || 'Unknown title',
    artistIds: artistIds.length > 0 ? artistIds : ['Unknown artist'],
    duration: 30,
    isExplicit: false,
    isSingle: true,
    format: 'mp3',
    coverUrl: artworkUrl,
    ownerId: ownerId || 'system',
    previewUrl,
    isPreviewOnly: true,
  });
  return trackId;
};
