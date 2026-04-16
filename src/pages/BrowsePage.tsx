import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Music, Play, MoreVertical, Edit2, PlusCircle, Heart, Pause, Download, Loader2, Check } from 'lucide-react';
import { useMockServer, TrackMetadata } from '../store/mockServer';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { EditTrackModal } from '../components/EditTrackModal';
import { AddToPlaylistModal } from '../components/AddToPlaylistModal';
import { TrackListItem } from '../components/TrackListItem';
import { ArtistCard } from '../components/ArtistCard';
import { CollectionCard } from '../components/CollectionCard';
import { AlbumTrackListItem } from '../components/AlbumTrackListItem';
import { CachedImage } from '../components/CachedImage';
import { escapeRegExp, toStringArray } from '../lib/safe';
import { resolveArtistId } from '../lib/artistRouting';
import { saveAudioFile, saveImageFile } from '../lib/db';

const Highlight = ({ text, highlight }: { text: string, highlight: string }) => {
  if (!highlight.trim() || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(highlight)})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === highlight.toLowerCase() ? (
          <span key={i} className="bg-indigo-500/50 text-white rounded px-0.5">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

type NEMusicSearchResult = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  sourceUrl?: string;
};

const sanitizeDownloadFilename = (value: string): string =>
  value
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

const extractFilenameFromDisposition = (contentDisposition: string | null): string | null => {
  if (!contentDisposition) return null;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const basicMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return basicMatch?.[1] ?? null;
};

const getAudioDurationFromBlob = async (audioBlob: Blob): Promise<number> => {
  const objectUrl = URL.createObjectURL(audioBlob);
  try {
    return await new Promise<number>((resolve) => {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
      audio.onerror = () => resolve(0);
      audio.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const toHighResArtworkUrl = (url?: string): string | undefined => {
  if (!url) return undefined;
  if (url.includes('100x100bb')) return url.replace('100x100bb', '1000x1000bb');
  if (url.includes('100x100')) return url.replace('100x100', '1000x1000');
  return url;
};

const splitArtistNames = (value: string): string[] => {
  return value
    .split(/\s*(?:,|&| x | X | and |;)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
};

const extractFeaturingArtists = (title: string): string[] => {
  const match = title.match(/(?:\(|\[)?\s*(?:feat\.|ft\.)\s+([^)|\]]+)(?:\)|\])?/i);
  if (!match?.[1]) return [];
  return splitArtistNames(match[1]);
};

const sanitizeLyricsForUi = (lyrics: string): string =>
  lyrics
    .replace(/\[\d{1,2}:\d{2}(?:\.\d{1,2})?\]\s*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const NEMusicResultItem = ({
  result,
  query,
  onDownload,
  onPlayDownloaded,
  isLoading,
  isSuccess,
}: {
  result: NEMusicSearchResult;
  query: string;
  onDownload: (result: NEMusicSearchResult) => void;
  onPlayDownloaded: (result: NEMusicSearchResult) => void;
  isLoading: boolean;
  isSuccess: boolean;
}) => {
  return (
    <div className="w-full text-left flex items-center gap-3 p-2 rounded-3xl bg-white/60 hover:bg-white/80 transition-colors">
    <div className="w-12 h-12 bg-violet-100 rounded-[2px] overflow-hidden flex-shrink-0 relative">
      {result.artworkUrl ? (
        <CachedImage src={result.artworkUrl} alt={result.title} className="w-full h-full object-cover" />
      ) : (
        <Music className="w-full h-full p-3 text-slate-400" />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <div className="font-medium truncate">
        <Highlight text={result.title} highlight={query} />
      </div>
      <div className="text-sm text-slate-400 truncate">
        <Highlight text={result.artist} highlight={query} />
      </div>
      </div>
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => onDownload(result)}
          disabled={isLoading}
          aria-label="Скачать и обработать трек"
          className={`inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
            isSuccess
              ? 'bg-emerald-100 text-emerald-600'
              : 'bg-violet-100 text-violet-600 hover:bg-violet-200'
          }`}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isSuccess ? (
            <Check className="w-4 h-4" />
          ) : (
            <Download className="w-4 h-4" />
          )}
        </button>
        {isSuccess && (
          <button
            type="button"
            onClick={() => onPlayDownloaded(result)}
            aria-label="Сразу воспроизвести скачанный трек"
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-violet-100 text-violet-600 hover:bg-violet-200 transition-colors"
          >
            <Play className="w-4 h-4 ml-0.5" />
          </button>
        )}
      </div>
    </div>
  );
};

type NEArtistSearchResult = {
  id: string;
  name: string;
  genre: string;
  artworkUrl?: string;
};

const NEArtistResultItem = ({ result, query }: { result: NEArtistSearchResult; query: string }) => (
  <div className="flex items-center gap-3 p-2 rounded-3xl bg-white/60 hover:bg-white/80 transition-colors">
    <div className="w-12 h-12 bg-violet-100 rounded-[2px] overflow-hidden flex-shrink-0 relative">
      {result.artworkUrl ? (
        <CachedImage src={result.artworkUrl} alt={result.name} className="w-full h-full object-cover" />
      ) : (
        <Music className="w-full h-full p-3 text-slate-400" />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <div className="font-medium truncate">
        <Highlight text={result.name} highlight={query} />
      </div>
      <div className="text-sm text-slate-400 truncate">
        <Highlight text={result.genre || 'Artist'} highlight={query} />
      </div>
    </div>
  </div>
);

type NEAlbumSearchResult = {
  id: string;
  title: string;
  artist: string;
  artworkUrl?: string;
};

const NEAlbumResultItem = ({ result, query }: { result: NEAlbumSearchResult; query: string }) => (
  <div className="flex items-center gap-3 p-2 rounded-3xl bg-white/60 hover:bg-white/80 transition-colors">
    <div className="w-12 h-12 bg-violet-100 rounded-[2px] overflow-hidden flex-shrink-0 relative">
      {result.artworkUrl ? (
        <CachedImage src={result.artworkUrl} alt={result.title} className="w-full h-full object-cover" />
      ) : (
        <Music className="w-full h-full p-3 text-slate-400" />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <div className="font-medium truncate">
        <Highlight text={result.title} highlight={query} />
      </div>
      <div className="text-sm text-slate-400 truncate">
        <Highlight text={result.artist} highlight={query} />
      </div>
    </div>
  </div>
);

export function BrowsePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTrack, setEditingTrack] = useState<TrackMetadata | null>(null);
  const [addingToPlaylistTrackId, setAddingToPlaylistTrackId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('tracks');
  const [neMusicSearchResults, setNeMusicSearchResults] = useState<NEMusicSearchResult[]>([]);
  const [neArtistSearchResults, setNeArtistSearchResults] = useState<NEArtistSearchResult[]>([]);
  const [neAlbumSearchResults, setNeAlbumSearchResults] = useState<NEAlbumSearchResult[]>([]);
  const [isNeMusicLoading, setIsNeMusicLoading] = useState(false);
  const [neMusicError, setNeMusicError] = useState<string | null>(null);
  const [downloadLoadingId, setDownloadLoadingId] = useState<string | null>(null);
  const [downloadSuccessIds, setDownloadSuccessIds] = useState<Record<string, true>>({});
  const [downloadedTrackIds, setDownloadedTrackIds] = useState<Record<string, string>>({});
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const navigate = useNavigate();

  const { tracks, artists, playlists, albums, users, updateUser, addTrack, updateTrack, addArtist, deleteTrack } = useMockServer();
  const { playTrack, togglePlay, currentTrackId, isPlaying } = usePlayerStore();
  const { currentUserId } = useAuthStore();
  const user = currentUserId ? users[currentUserId] : null;

  const allTracks = Object.values(tracks);
  const allArtists = Object.values(artists);
  const allPlaylists = Object.values(playlists);
  const allAlbums = Object.values(albums);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const hasQuery = queryTokens.length > 0;
  const normalizeText = (value: unknown) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  const matchesQuery = (value: unknown) => {
    const source = normalizeText(value);
    return queryTokens.every((token) => source.includes(token));
  };

  const searchResultsTracks = allTracks.filter(t => 
    matchesQuery(t.title) ||
    matchesQuery(t.lyrics) ||
    matchesQuery(toStringArray(t.artistIds).join(' '))
  );
  const searchResultsPlaylists = allPlaylists.filter((playlist) => {
    const playlistTracksText = (playlist.trackIds || [])
      .map((trackId) => tracks[trackId])
      .filter(Boolean)
      .map((track) => `${track.title} ${track.lyrics || ''} ${toStringArray(track.artistIds).join(' ')}`)
      .join(' ');
    return (
      matchesQuery(playlist.title) ||
      matchesQuery(playlist.status) ||
      matchesQuery(playlistTracksText)
    );
  });
  const searchResultsAlbums = allAlbums.filter((album) => {
    const albumTracksText = (album.trackIds || [])
      .map((trackId) => tracks[trackId])
      .filter(Boolean)
      .map((track) => `${track.title} ${track.lyrics || ''} ${toStringArray(track.artistIds).join(' ')}`)
      .join(' ');
    return (
      matchesQuery(album.title) ||
      matchesQuery(album.status) ||
      matchesQuery(albumTracksText)
    );
  });
  const searchResultsArtists = allArtists.filter((artist) =>
    matchesQuery(artist.name) || matchesQuery(artist.description || '')
  );

  useEffect(() => {
    if (!hasQuery) {
      setNeMusicSearchResults([]);
      setNeArtistSearchResults([]);
      setNeAlbumSearchResults([]);
      setNeMusicError(null);
      setIsNeMusicLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsNeMusicLoading(true);
      setNeMusicError(null);
      try {
        const endpoint =
          activeTab === 'tracks'
            ? `https://itunes.apple.com/search?entity=song&limit=25&term=${encodeURIComponent(searchQuery.trim())}`
            : activeTab === 'artists'
              ? `https://itunes.apple.com/search?entity=musicArtist&limit=25&term=${encodeURIComponent(searchQuery.trim())}`
              : `https://itunes.apple.com/search?entity=album&limit=25&term=${encodeURIComponent(searchQuery.trim())}`;
        const response = await fetch(endpoint, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Search request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as {
          results?: Array<{
            trackId?: number;
            trackName?: string;
            artistName?: string;
            trackViewUrl?: string;
            previewUrl?: string;
            artistId?: number;
            artistType?: string;
            primaryGenreName?: string;
            collectionId?: number;
            collectionName?: string;
            collectionType?: string;
            artworkUrl100?: string;
            artworkUrl600?: string;
          }>;
        };

        if (activeTab === 'tracks') {
          const results = (payload.results || [])
            .filter((item) => item.trackId && item.trackName && item.artistName)
            .map((item) => ({
              id: String(item.trackId),
              title: String(item.trackName),
              artist: String(item.artistName),
              album: item.collectionName,
              artworkUrl: item.artworkUrl600 || toHighResArtworkUrl(item.artworkUrl100),
              sourceUrl: item.previewUrl || item.trackViewUrl,
            }));
          setNeMusicSearchResults(results);
          setNeArtistSearchResults([]);
          setNeAlbumSearchResults([]);
        } else if (activeTab === 'artists') {
          const results = (payload.results || [])
            .filter((item) => item.artistId && item.artistName)
            .map((item) => ({
              id: String(item.artistId),
              name: String(item.artistName),
              genre: String(item.primaryGenreName || item.artistType || 'Artist'),
              artworkUrl: item.artworkUrl100,
            }));
          setNeArtistSearchResults(results);
          setNeMusicSearchResults([]);
          setNeAlbumSearchResults([]);
        } else {
          const results = (payload.results || [])
            .filter((item) => {
              if (!item.collectionId || !item.collectionName || !item.artistName) return false;
              return String(item.collectionType || '').toLowerCase() === 'album';
            })
            .map((item) => ({
              id: String(item.collectionId),
              title: String(item.collectionName),
              artist: String(item.artistName),
              artworkUrl: item.artworkUrl100,
            }));
          setNeAlbumSearchResults(results);
          setNeMusicSearchResults([]);
          setNeArtistSearchResults([]);
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setNeMusicSearchResults([]);
        setNeArtistSearchResults([]);
        setNeAlbumSearchResults([]);
        setNeMusicError('Не удалось получить результаты поиска. Проверьте сеть и попробуйте снова.');
      } finally {
        setIsNeMusicLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [activeTab, hasQuery, searchQuery]);

  const downloadResult = async (result: NEMusicSearchResult) => {
    const downloadQuery = `${result.artist} - ${result.title}`;

    setDownloadLoadingId(result.id);
    setDownloadError(null);
    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: downloadQuery,
          title: result.title,
          artist: result.artist,
          album: result.album || '',
          artworkUrl: result.artworkUrl || '',
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string; details?: string };
        const detailMessage = typeof payload.details === 'string' ? payload.details.split('\n')[0] : '';
        throw new Error(detailMessage || payload.error || 'Download request failed');
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const headerFilename = extractFilenameFromDisposition(response.headers.get('content-disposition'));
      const headerLyricsEncoded = response.headers.get('x-track-lyrics');
      const headerLyrics = headerLyricsEncoded ? sanitizeLyricsForUi(decodeURIComponent(headerLyricsEncoded)) : '';
      const fallbackFilename = `${sanitizeDownloadFilename(`${result.artist} - ${result.title}`) || 'track'}-processed.mp3`;
      const downloadFilename = sanitizeDownloadFilename(headerFilename || fallbackFilename) || 'download.mp3';

      const normalizedArtist = result.artist.trim();
      const normalizedTitle = result.title.trim();
      const baseArtists = splitArtistNames(normalizedArtist);
      const featuringArtists = extractFeaturingArtists(normalizedTitle);
      const allArtistNames = Array.from(new Set([...baseArtists, ...featuringArtists]));

      let downloadedCoverBlob: Blob | null = null;
      if (result.artworkUrl) {
        try {
          const coverResponse = await fetch(result.artworkUrl);
          if (coverResponse.ok) {
            downloadedCoverBlob = await coverResponse.blob();
          }
        } catch {
          // Keep working even if cover download fails.
        }
      }

      const fetchArtistProfile = async (artistName: string): Promise<{ description: string; imageUrl?: string }> => {
        try {
          const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(artistName)}`;
          const wikiResponse = await fetch(wikiUrl);
          if (wikiResponse.ok) {
            const wikiPayload = await wikiResponse.json() as {
              extract?: string;
              thumbnail?: { source?: string };
              originalimage?: { source?: string };
            };
            const firstParagraph = (wikiPayload.extract || '')
              .split('\n')
              .map((part) => part.trim())
              .find(Boolean);
            const imageUrl = wikiPayload.originalimage?.source || wikiPayload.thumbnail?.source;
            if (firstParagraph) {
              return { description: firstParagraph.slice(0, 280), imageUrl };
            }
            if (imageUrl) {
              return {
                description: `${artistName} - артист в твоей коллекции rainboow. Скачан автоматически по метаданным трека.`,
                imageUrl,
              };
            }
          }
        } catch {
          // Continue to static fallback below.
        }

        return {
          description: `${artistName} - артист в твоей коллекции rainboow. Скачан автоматически по метаданным трека.`,
        };
      };

      for (const artistName of allArtistNames) {
        const exists = Object.values(useMockServer.getState().artists).some(
          (artist) => artist.name.trim().toLowerCase() === artistName.toLowerCase()
        );
        if (!exists) {
          const { description, imageUrl } = await fetchArtistProfile(artistName);
          const artistId = `artist-${Date.now()}-${artistName.toLowerCase().replace(/\s+/g, '-')}`;
          let bannerId: string | undefined;

          if (imageUrl) {
            try {
              const response = await fetch(imageUrl);
              if (response.ok) {
                bannerId = `artist-banner-${artistId}`;
                await saveImageFile(bannerId, await response.blob());
              }
            } catch {
              // fallback to track cover below
            }
          }

          if (!bannerId && downloadedCoverBlob) {
            bannerId = `artist-banner-${artistId}`;
            await saveImageFile(bannerId, downloadedCoverBlob);
          }

          addArtist({
            id: artistId,
            name: artistName,
            description,
            bannerUrl: bannerId,
            ownerId: currentUserId || undefined,
          });
        }
      }

      const existingTrack = Object.values(tracks).find(
        (track) =>
          track.title.trim().toLowerCase() === normalizedTitle.toLowerCase() &&
          toStringArray(track.artistIds).join(', ').trim().toLowerCase() === normalizedArtist.toLowerCase()
      );

      const targetTrackId = existingTrack?.id || `downloaded-${Date.now()}-${result.id}`;
      await saveAudioFile(targetTrackId, blob);
      let coverId: string | undefined = existingTrack?.coverUrl;
      if (downloadedCoverBlob) {
        coverId = `cover-${targetTrackId}`;
        await saveImageFile(coverId, downloadedCoverBlob);
      }

      if (!existingTrack) {
        const duration = await getAudioDurationFromBlob(blob);
        const newTrack: TrackMetadata = {
          id: targetTrackId,
          title: normalizedTitle || downloadFilename.replace(/\.mp3$/i, ''),
          artistIds: allArtistNames.length > 0 ? allArtistNames : ['Unknown artist'],
          duration,
          isExplicit: false,
          isSingle: true,
          format: 'mp3',
          coverUrl: coverId,
          ownerId: currentUserId || 'system',
          lyrics: headerLyrics,
          features: featuringArtists,
        };
        addTrack(newTrack);
      } else {
        updateTrack(existingTrack.id, {
          artistIds: allArtistNames.length > 0 ? allArtistNames : existingTrack.artistIds,
          features: featuringArtists.length > 0 ? featuringArtists : existingTrack.features,
          coverUrl: coverId || existingTrack.coverUrl,
          lyrics: headerLyrics || existingTrack.lyrics,
        });
      }

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = downloadFilename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      setDownloadSuccessIds((prev) => ({ ...prev, [result.id]: true }));
      setDownloadedTrackIds((prev) => ({ ...prev, [result.id]: targetTrackId }));
    } catch (error) {
      setDownloadError((error as Error).message || 'Не удалось обработать файл.');
    } finally {
      setDownloadLoadingId(null);
    }
  };

  const playDownloadedResult = (result: NEMusicSearchResult) => {
    const downloadedTrackId = downloadedTrackIds[result.id];
    if (!downloadedTrackId) return;
    const queueSource = hasQuery ? searchResultsTracks : allTracks;
    const queue = queueSource.map((track) => track.id);
    const playbackQueue = queue.includes(downloadedTrackId) ? queue : [downloadedTrackId, ...queue];
    playTrack(downloadedTrackId, playbackQueue, null);
  };

  const removeTrackFromApp = (trackId: string) => {
    deleteTrack(trackId);
    setNotice('Трек удалён только из приложения. Файл по-прежнему хранится на вашем устройстве.');
    window.setTimeout(() => setNotice(null), 3500);
  };

  const handleToggleFavoriteArtist = (e: React.MouseEvent, artistId: string) => {
    e.stopPropagation();
    if (!user) return;
    const currentFavorites = user.favoriteArtistIds || [];
    const isFavorite = currentFavorites.includes(artistId);
    const newFavorites = isFavorite
      ? currentFavorites.filter(id => id !== artistId)
      : [...currentFavorites, artistId];
    updateUser(user.id, { favoriteArtistIds: newFavorites });
  };

  const getAlbumRowMeta = (album: typeof allAlbums[number]) => {
    const albumTracks = album.trackIds
      .map((trackId) => tracks[trackId])
      .filter(Boolean);
    const formatCount = albumTracks.reduce<Record<string, number>>((acc, track) => {
      const key = (track.format || 'unknown').toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const qualityLabel = Object.entries(formatCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
    const explicitCount = albumTracks.filter((track) => track.isExplicit).length;
    const isExplicit = explicitCount > 0;

    const artistIds = (album.artistIds || []).filter(Boolean);
    const linkedArtistNames = artistIds.map((artistId) => artists[artistId]?.name).filter(Boolean);
    const fallbackArtists = Array.from(new Set(albumTracks.flatMap((track) => toStringArray(track.artistIds))));
    const artistName = (linkedArtistNames.length > 0 ? linkedArtistNames : fallbackArtists).join(', ');

    return { qualityLabel, isExplicit, artistName };
  };

  return (
    <div className="p-4 pt-8 h-full overflow-y-auto scrollbar-hide" onClick={() => setActiveMenuId(null)}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Обзор</h1>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
        <button 
          onClick={() => setActiveTab('tracks')}
          className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'tracks' ? 'bg-violet-500 text-white shadow-sm shadow-violet-200' : 'bg-white/70 text-slate-500 hover:bg-white'}`}
        >
          Треки
        </button>
        <button 
          onClick={() => setActiveTab('artists')}
          className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'artists' ? 'bg-violet-500 text-white shadow-sm shadow-violet-200' : 'bg-white/70 text-slate-500 hover:bg-white'}`}
        >
          Артисты
        </button>
        <button 
          onClick={() => setActiveTab('playlists')}
          className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'playlists' ? 'bg-violet-500 text-white shadow-sm shadow-violet-200' : 'bg-white/70 text-slate-500 hover:bg-white'}`}
        >
          Плейлисты и Альбомы
        </button>
      </div>

      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
        <input
          type="text"
          placeholder={`Поиск ${activeTab === 'tracks' ? 'треков' : activeTab === 'artists' ? 'артистов' : 'плейлистов'}...`}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-white/85 text-slate-700 pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
      </div>

      {activeTab === 'tracks' && (
        <div>
          <h2 className="text-xl font-bold mb-4">{searchQuery ? 'Результаты' : 'Все треки'}</h2>
          {hasQuery && (
            <div className="mb-6">
              <div className="space-y-2">
                {isNeMusicLoading && (
                  <div className="text-sm text-zinc-500 py-3">Ищем треки...</div>
                )}
                {neMusicError && (
                  <div className="text-sm text-rose-500 py-3">{neMusicError}</div>
                )}
                {neMusicSearchResults.map((result) => (
                  <NEMusicResultItem
                    key={result.id}
                    result={result}
                    query={searchQuery}
                    onDownload={downloadResult}
                    onPlayDownloaded={playDownloadedResult}
                    isLoading={downloadLoadingId === result.id}
                    isSuccess={Boolean(downloadSuccessIds[result.id])}
                  />
                ))}
                {!isNeMusicLoading && !neMusicError && neMusicSearchResults.length === 0 && (
                  <div className="text-sm text-zinc-500 py-3">По вашему запросу NEmusic ничего не нашёл.</div>
                )}
                {downloadError && (
                  <div className="text-sm text-rose-500 py-2">{downloadError}</div>
                )}
              </div>
            </div>
          )}
          <div className="space-y-2">
            {(hasQuery ? searchResultsTracks : allTracks).map((track, index) => (
              <TrackListItem 
                track={track}
                user={user}
                isPlaying={isPlaying}
                isActive={currentTrackId === track.id}
                searchQuery={searchQuery}
                onPlay={() => playTrack(track.id, (hasQuery ? searchResultsTracks : allTracks).map(t => t.id), null)}
                onArtistClick={(artistRef) => {
                  const artistId = resolveArtistId(artistRef, artists);
                  if (artistId) navigate(`/artist/${artistId}`);
                }}
                onToggleFavorite={() => {
                  if (user) {
                    const isFavorite = user.favoriteTrackIds.includes(track.id);
                    const favoriteTrackIds = user.favoriteTrackIds || [];
                    const newFavorites = favoriteTrackIds.includes(track.id)
                      ? favoriteTrackIds.filter(id => id !== track.id)
                      : [...favoriteTrackIds, track.id];
                    updateUser(user.id, { favoriteTrackIds: newFavorites });
                  }
                }}
                onAddToPlaylist={() => setAddingToPlaylistTrackId(track.id)}
                onEdit={() => setEditingTrack(track)}
                onDelete={() => removeTrackFromApp(track.id)}
              />
            ))}
            {(hasQuery ? searchResultsAlbums : allAlbums).map((album) => {
              const { artistName, qualityLabel, isExplicit } = getAlbumRowMeta(album);
              return (
                <AlbumTrackListItem
                  key={`album-row-${album.id}`}
                  title={album.title}
                  artistName={artistName}
                  coverUrl={album.coverUrl}
                  trackCount={album.trackIds.length}
                  qualityLabel={qualityLabel}
                  isExplicit={isExplicit}
                  isActive={Boolean(currentTrackId && album.trackIds.includes(currentTrackId))}
                  isPlaying={isPlaying}
                  searchQuery={searchQuery}
                  onOpen={() => navigate(`/album/${album.id}`)}
                  onPlay={() => {
                    if (currentTrackId && album.trackIds.includes(currentTrackId)) {
                      togglePlay();
                      return;
                    }
                    if (album.trackIds.length > 0) {
                      playTrack(album.trackIds[0], album.trackIds, album.id);
                    }
                  }}
                />
              );
            })}
            {(hasQuery ? searchResultsTracks : allTracks).length === 0 &&
              (hasQuery ? searchResultsAlbums : allAlbums).length === 0 &&
              (!hasQuery || neMusicSearchResults.length === 0) && (
              <div className="text-center text-zinc-500 py-10">
                {searchQuery ? 'Нет результатов' : 'Нет треков.'}
              </div>
              )}
          </div>
        </div>
      )}

      {activeTab === 'artists' && (
        <div>
          <h2 className="text-xl font-bold mb-4">{searchQuery ? 'Результаты' : 'Все артисты'}</h2>
          {hasQuery && (
            <div className="space-y-2 mb-6">
              {isNeMusicLoading && (
                <div className="text-sm text-zinc-500 py-3">Ищем артистов...</div>
              )}
              {neMusicError && (
                <div className="text-sm text-rose-500 py-3">{neMusicError}</div>
              )}
              {neArtistSearchResults.map((artist) => (
                <NEArtistResultItem key={artist.id} result={artist} query={searchQuery} />
              ))}
              {!isNeMusicLoading && !neMusicError && neArtistSearchResults.length === 0 && (
                <div className="text-sm text-zinc-500 py-3">По вашему запросу ничего не найдено.</div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {(searchQuery ? searchResultsArtists : allArtists).map(artist => (
              <ArtistCard
                key={artist.id}
                artist={{ ...artist, name: artist.name }}
                subtitle={<Highlight text={artist.description?.trim() || 'Без описания'} highlight={searchQuery} />}
                onClick={() => navigate(`/artist/${artist.id}`)}
                isFavorite={Boolean(user?.favoriteArtistIds?.includes(artist.id))}
                onToggleFavorite={user ? (e) => handleToggleFavoriteArtist(e, artist.id) : undefined}
              />
            ))}
          </div>
          {(searchQuery ? searchResultsArtists : allArtists).length === 0 && (
            <div className="text-center text-zinc-500 py-10 col-span-full">
              {searchQuery ? 'Нет результатов' : 'Нет артистов.'}
            </div>
          )}
        </div>
      )}

      {activeTab === 'playlists' && (
        <div>
          <h2 className="text-xl font-bold mb-4">{searchQuery ? 'Результаты' : 'Плейлисты и альбомы'}</h2>
          {hasQuery && (
            <div className="space-y-2 mb-6">
              {isNeMusicLoading && (
                <div className="text-sm text-zinc-500 py-3">Ищем альбомы...</div>
              )}
              {neMusicError && (
                <div className="text-sm text-rose-500 py-3">{neMusicError}</div>
              )}
              {neAlbumSearchResults.map((album) => (
                <NEAlbumResultItem key={album.id} result={album} query={searchQuery} />
              ))}
              {!isNeMusicLoading && !neMusicError && neAlbumSearchResults.length === 0 && (
                <div className="text-sm text-zinc-500 py-3">По вашему запросу ничего не найдено.</div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {(searchQuery ? searchResultsPlaylists : allPlaylists).map(playlist => (
              <div key={playlist.id} onClick={() => navigate(`/playlist/${playlist.id}`)}>
                <CollectionCard
                  title={<Highlight text={playlist.title} highlight={searchQuery} />}
                  subtitle="Плейлист"
                  coverUrl={playlist.coverUrl}
                  type="playlist"
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-4">
            {(searchQuery ? searchResultsAlbums : allAlbums).map(album => (
              <div key={album.id} onClick={() => navigate(`/album/${album.id}`)}>
                <CollectionCard
                  title={<Highlight text={album.title} highlight={searchQuery} />}
                  subtitle={album.status || 'Альбом'}
                  coverUrl={album.coverUrl}
                  type="album"
                />
              </div>
            ))}
          </div>
          {(searchQuery ? searchResultsPlaylists : allPlaylists).length === 0 && (searchQuery ? searchResultsAlbums : allAlbums).length === 0 && (
            <div className="text-center text-zinc-500 py-10 col-span-full">
              {searchQuery ? 'Нет результатов' : 'Нет плейлистов и альбомов.'}
            </div>
          )}
        </div>
      )}

      {editingTrack && <EditTrackModal track={editingTrack} onClose={() => setEditingTrack(null)} />}
      {addingToPlaylistTrackId && <AddToPlaylistModal trackId={addingToPlaylistTrackId} onClose={() => setAddingToPlaylistTrackId(null)} />}
      {notice && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[120] px-4 py-2 rounded-full bg-slate-900 text-white text-sm shadow-xl">
          {notice}
        </div>
      )}
    </div>
  );
}
