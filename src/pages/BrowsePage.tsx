import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FolderUp, RefreshCcw, Search, Music } from 'lucide-react';
import { DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMockServer, TrackMetadata } from '../store/mockServer';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { useRadoogaStore } from '../store/radoogaStore';
import { EditTrackModal } from '../components/EditTrackModal';
import { AddToPlaylistModal } from '../components/AddToPlaylistModal';
import { TrackListItem } from '../components/TrackListItem';
import { AlbumTrackListItem } from '../components/AlbumTrackListItem';
import { FavoriteArtistListItem } from '../components/FavoriteArtistListItem';
import { CachedImage } from '../components/CachedImage';
import { OnlineTrackListItem, OnlineTrackItemData } from '../components/OnlineTrackListItem';
import { UploadTrackModal } from '../components/UploadTrackModal';
import { escapeRegExp, toStringArray } from '../lib/safe';
import {
  extractFeaturingArtists,
  resolveArtistId,
  resolveArtistRoute,
  splitArtistField,
  splitArtistNames,
} from '../lib/artistRouting';
import { deleteAudioFile, deleteImageFile, saveAudioFile, saveImageFile } from '../lib/db';
import {
  getDownloadedAlbumTrackCount,
  resolveAlbumCollectionId,
  resolveAlbumTotalTracks,
} from '../lib/albumCounters';
import { pushNavigationEntry } from '../lib/navigationHistory';
import { resolveArtistDescriptionRu } from '../lib/wikiDescriptions';
import { ensureArtistBannerFromTrackCover } from '../lib/artistBannerCache';
import { apiUrl } from '../lib/apiUrl';
import { upsertPreviewOnlyTrack } from '../lib/previewFallback';

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
  previewUrl?: string;
  source?: 'itunes' | 'youtube';
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

const getLyricsSnippet = (lyrics: string | undefined, query: string): { snippet: string; highlight: string } | null => {
  if (!lyrics || !query.trim()) return null;

  const normalizedLyrics = lyrics.replace(/\s+/g, ' ').trim();
  const normalizedQuery = query.replace(/\s+/g, ' ').trim();
  if (!normalizedQuery) return null;

  const lowerLyrics = normalizedLyrics.toLowerCase();
  const lowerQuery = normalizedQuery.toLowerCase();
  let matchIndex = lowerLyrics.indexOf(lowerQuery);
  let matchedFragment = '';

  if (matchIndex !== -1) {
    matchedFragment = normalizedLyrics.slice(matchIndex, matchIndex + normalizedQuery.length);
  } else {
    const queryTokens = normalizedQuery
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3);

    const uniqueTokens = Array.from(new Set(queryTokens)).sort((a, b) => b.length - a.length);
    for (const token of uniqueTokens) {
      const tokenIndex = lowerLyrics.indexOf(token);
      if (tokenIndex !== -1) {
        matchIndex = tokenIndex;
        matchedFragment = normalizedLyrics.slice(tokenIndex, tokenIndex + token.length);
        break;
      }
    }

    if (matchIndex === -1) {
      const levenshteinDistance = (left: string, right: string): number => {
        if (left === right) return 0;
        if (left.length === 0) return right.length;
        if (right.length === 0) return left.length;

        const prev = new Array<number>(right.length + 1);
        const curr = new Array<number>(right.length + 1);
        for (let j = 0; j <= right.length; j += 1) prev[j] = j;
        for (let i = 1; i <= left.length; i += 1) {
          curr[0] = i;
          for (let j = 1; j <= right.length; j += 1) {
            const cost = left[i - 1] === right[j - 1] ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
          }
          for (let j = 0; j <= right.length; j += 1) prev[j] = curr[j];
        }
        return prev[right.length];
      };

      const lyricWordPattern = /\p{L}[\p{L}\p{N}-]*/gu;
      const lyricWords = Array.from(lowerLyrics.matchAll(lyricWordPattern)).map((match) => ({
        word: match[0],
        index: match.index ?? -1,
      }));

      for (const token of uniqueTokens) {
        if (token.length < 5) continue;
        for (const lyricWord of lyricWords) {
          if (lyricWord.index < 0) continue;
          if (Math.abs(lyricWord.word.length - token.length) > 1) continue;
          if (levenshteinDistance(lyricWord.word, token) <= 1) {
            matchIndex = lyricWord.index;
            matchedFragment = normalizedLyrics.slice(matchIndex, matchIndex + lyricWord.word.length);
            break;
          }
        }
        if (matchIndex !== -1) break;
      }
    }
  }

  if (matchIndex === -1 || !matchedFragment) return null;

  const start = Math.max(0, matchIndex - 28);
  const end = Math.min(normalizedLyrics.length, matchIndex + matchedFragment.length + 34);
  const rawSnippet = normalizedLyrics.slice(start, end).trim();
  const snippet = `${start > 0 ? '... ' : ''}${rawSnippet}${end < normalizedLyrics.length ? ' ...' : ''}`;

  return { snippet, highlight: matchedFragment };
};

const sanitizeLyricsForUi = (lyrics: string): string =>
  lyrics
    .replace(/\[\d{1,2}:\d{2}(?:\.\d{1,2})?\]\s*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const normalizeSearchText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeExternalSearchQuery = (value: string): string =>
  value
    .replace(/[^\p{L}\p{N}\s'-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeAlbumTitle = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\((deluxe|expanded|remaster(?:ed)?|edition|bonus|version|explicit|clean)[^)]*\)/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .trim();

const hasTokenOverlap = (left: string, right: string): boolean => {
  const leftTokens = normalizeSearchText(left).split(' ').filter(Boolean);
  const rightTokens = new Set(normalizeSearchText(right).split(' ').filter(Boolean));
  if (leftTokens.length === 0 || rightTokens.size === 0) return false;
  let matches = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) matches += 1;
  }
  return matches >= Math.min(2, leftTokens.length);
};

const computeSearchRelevance = (query: string, title: string, artist: string): number => {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedTitle = normalizeSearchText(title);
  const normalizedArtist = normalizeSearchText(artist);
  if (!normalizedQuery) return 0;

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const titleTokens = new Set(normalizedTitle.split(' ').filter(Boolean));
  const artistTokens = new Set(normalizedArtist.split(' ').filter(Boolean));

  let score = 0;
  if (normalizedTitle === normalizedQuery) score += 120;
  if (normalizedArtist === normalizedQuery) score += 70;
  if (normalizedTitle.includes(normalizedQuery)) score += 55;
  if (normalizedArtist.includes(normalizedQuery)) score += 30;

  for (const token of queryTokens) {
    if (titleTokens.has(token)) score += 18;
    if (artistTokens.has(token)) score += 10;
  }

  return score;
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

type OverviewItemType = 'track' | 'album' | 'playlist' | 'artist';

type OverviewItemRef = {
  type: OverviewItemType;
  id: string;
};

const OVERVIEW_ORDER_STORAGE_KEY = 'browse-overview-order-v1';
const BROWSE_RETURN_CTX_STORAGE_KEY = 'browse-return-context-v1';

const toOverviewItemKey = (item: OverviewItemRef): string => `${item.type}:${item.id}`;

const DraggableOverviewItem = ({
  itemKey,
  children,
}: {
  itemKey: string;
  children: React.ReactNode;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: itemKey });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-none">
      {children}
    </div>
  );
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
  const DOWNLOAD_SUCCESS_STORAGE_KEY = 'ne-music-downloaded-result-ids';
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTrack, setEditingTrack] = useState<TrackMetadata | null>(null);
  const [addingToPlaylistTrackId, setAddingToPlaylistTrackId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [neMusicSearchResults, setNeMusicSearchResults] = useState<NEMusicSearchResult[]>([]);
  const [isNeMusicLoading, setIsNeMusicLoading] = useState(false);
  const [neMusicError, setNeMusicError] = useState<string | null>(null);
  const [downloadLoadingId, setDownloadLoadingId] = useState<string | null>(null);
  const [downloadSuccessIds, setDownloadSuccessIds] = useState<Record<string, true>>(() => {
    try {
      const raw = window.localStorage.getItem(DOWNLOAD_SUCCESS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const normalized: Record<string, true> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (value === true) normalized[key] = true;
      }
      return normalized;
    } catch {
      return {};
    }
  });
  const [downloadedTrackIds, setDownloadedTrackIds] = useState<Record<string, string>>({});
  const [neLyricsByTrackId, setNeLyricsByTrackId] = useState<Record<string, string>>({});
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [itunesTrackCountByCollectionId, setItunesTrackCountByCollectionId] = useState<Record<string, number>>({});
  const [expandedAlbumIds, setExpandedAlbumIds] = useState<Record<string, true>>({});
  const [expandedPlaylistIds, setExpandedPlaylistIds] = useState<Record<string, true>>({});
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [recommendedTracks, setRecommendedTracks] = useState<NEMusicSearchResult[]>([]);
  const [randomOnlineTracks, setRandomOnlineTracks] = useState<NEMusicSearchResult[]>([]);
  const [isRandomLoading, setIsRandomLoading] = useState(false);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
  const [overviewOrder, setOverviewOrder] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem(OVERVIEW_ORDER_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
    } catch {
      return [];
    }
  });
  const lyricsLookupInFlightRef = useRef<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const { tracks, artists, playlists, albums, users, updateUser, addTrack, updateTrack, addArtist, updateArtist, deleteTrack, deleteArtist, updateAlbum } = useMockServer();
  const { playTrack, playPreview, togglePlay, currentTrackId, currentPreviewKey, isPlaying } = usePlayerStore();
  const { prefetchNextBatch, openForYouFeed } = useRadoogaStore();
  const { currentUserId } = useAuthStore();
  const user = currentUserId ? users[currentUserId] : null;
  const normalizeTrackKey = (value: string) => value.trim().toLowerCase();

  const allTracks = Object.values(tracks);
  const resolvedFavoriteTrackIds = (() => {
    if (!user) return [];
    const byKey = new Map<string, string[]>();
    allTracks.forEach((track) => {
      const key = `${normalizeTrackKey(track.title)}::${normalizeTrackKey(toStringArray(track.artistIds)[0] || '')}`;
      const list = byKey.get(key) || [];
      list.push(track.id);
      byKey.set(key, list);
    });
    const expanded = new Set<string>(user.favoriteTrackIds || []);
    (user.favoriteTrackIds || []).forEach((trackId) => {
      const track = tracks[trackId];
      if (!track) return;
      const key = `${normalizeTrackKey(track.title)}::${normalizeTrackKey(toStringArray(track.artistIds)[0] || '')}`;
      (byKey.get(key) || []).forEach((id) => expanded.add(id));
    });
    return Array.from(expanded);
  })();
  const resolvedUser = user ? { ...user, favoriteTrackIds: resolvedFavoriteTrackIds } : null;
  const allArtists = Object.values(artists);
  const allArtistsWithTracks = allArtists.filter((artist) =>
    allTracks.some((track) => {
      const refs = toStringArray(track.artistIds).flatMap((value) => {
        const field = splitArtistField(value);
        return [...field.primaryArtists, ...field.featuringArtists];
      }).map((value) => value.trim().toLowerCase());
      const featureRefs = toStringArray(track.features).map((value) => value.trim().toLowerCase());
      return (
        refs.includes(artist.id.trim().toLowerCase()) ||
        refs.includes(artist.name.trim().toLowerCase()) ||
        featureRefs.includes(artist.name.trim().toLowerCase())
      );
    })
  );
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
    matchesQuery(toStringArray(t.artistIds).join(' ')) ||
    matchesQuery(toStringArray(t.features).join(' '))
  );
  const favoriteArtistIds = new Set(user?.favoriteArtistIds || []);
  const favoritePlaylistIds = new Set(user?.favoritePlaylistIds || []);
  const favoriteAlbumIds = new Set(user?.favoriteAlbumIds || []);
  const favoriteArtists = allArtistsWithTracks.filter((artist) => favoriteArtistIds.has(artist.id));
  const favoritePlaylists = allPlaylists.filter((playlist) => favoritePlaylistIds.has(playlist.id));
  const favoriteAlbums = allAlbums.filter((album) => favoriteAlbumIds.has(album.id));
  const searchResultsPlaylists = favoritePlaylists.filter((playlist) => {
    const playlistTracksText = (playlist.trackIds || [])
      .map((trackId) => tracks[trackId])
      .filter(Boolean)
      .map((track) => `${track.title} ${track.lyrics || ''} ${toStringArray(track.artistIds).join(' ')}`)
      .join(' ');
    return (
      matchesQuery(playlist.title) ||
      matchesQuery(playlistTracksText)
    );
  });
  const searchResultsAlbums = favoriteAlbums.filter((album) => {
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
  const searchResultsArtists = allArtistsWithTracks.filter((artist) =>
    matchesQuery(artist.name) || matchesQuery(artist.description || '')
  );
  const getArtistDownloadedTracks = (artistName: string) => {
    const normalizedArtist = artistName.trim().toLowerCase();
    return allTracks.filter((track) => {
      const artistRefs = [
        ...toStringArray(track.artistIds),
        ...toStringArray(track.features),
      ].map((value) => value.trim().toLowerCase());
      return artistRefs.includes(normalizedArtist);
    });
  };
  const favoriteArtistRows = favoriteArtists
    .map((artist) => {
      const downloadedTracks = getArtistDownloadedTracks(artist.name);
      const downloadedCount = downloadedTracks.length;
      const totalCount = downloadedCount;
      const matchesArtist = hasQuery
        ? (matchesQuery(artist.name) || matchesQuery(artist.description || ''))
        : true;
      const hasMatchedTrack = hasQuery
        ? downloadedTracks.some((track) =>
            matchesQuery(track.title) ||
            matchesQuery(track.lyrics) ||
            matchesQuery(toStringArray(track.artistIds).join(' ')) ||
            matchesQuery(toStringArray(track.features).join(' '))
          )
        : true;
      return {
        artist,
        downloadedTracks,
        downloadedCount,
        totalCount,
        isVisible: matchesArtist || hasMatchedTrack,
      };
    })
    .filter((row) => row.isVisible);
  const allAlbumGroups = favoriteAlbums.map((album) => {
    const downloadedTracksInAlbum = (album.trackIds || [])
      .map((trackId) => tracks[trackId])
      .filter(Boolean);
    return { album, downloadedTracks: downloadedTracksInAlbum };
  });
  const visibleAlbumGroups = (hasQuery
    ? allAlbumGroups.filter((group) => searchResultsAlbums.some((album) => album.id === group.album.id))
    : allAlbumGroups
  ).map((group) => ({
    ...group,
    hasAlbumMatch: hasQuery ? (matchesQuery(group.album.title) || matchesQuery(group.album.status || '')) : false,
    matchedTracks: hasQuery
      ? group.downloadedTracks.filter((track) =>
          matchesQuery(track.title) ||
          matchesQuery(track.lyrics) ||
          matchesQuery(toStringArray(track.artistIds).join(' ')) ||
          matchesQuery(toStringArray(track.features).join(' '))
        )
      : group.downloadedTracks,
  }));
  const allPlaylistGroups = favoritePlaylists.map((playlist) => {
    const downloadedTracksInPlaylist = (playlist.trackIds || [])
      .map((trackId) => tracks[trackId])
      .filter(Boolean);
    return { playlist, downloadedTracks: downloadedTracksInPlaylist };
  });
  const visiblePlaylistGroups = (hasQuery
    ? allPlaylistGroups.filter((group) => searchResultsPlaylists.some((playlist) => playlist.id === group.playlist.id))
    : allPlaylistGroups
  ).map((group) => ({
    ...group,
    hasPlaylistMatch: hasQuery ? matchesQuery(group.playlist.title) : false,
    matchedTracks: hasQuery
      ? group.downloadedTracks.filter((track) =>
          matchesQuery(track.title) ||
          matchesQuery(track.lyrics) ||
          matchesQuery(toStringArray(track.artistIds).join(' ')) ||
          matchesQuery(toStringArray(track.features).join(' '))
        )
      : group.downloadedTracks,
  }));
  const trackIdsInsideVisibleAlbums = new Set(
    [
      ...visibleAlbumGroups.flatMap((group) => group.downloadedTracks.map((track) => track.id)),
      ...visiblePlaylistGroups.flatMap((group) => group.downloadedTracks.map((track) => track.id)),
    ]
  );
  const visibleStandaloneTracks = (hasQuery ? searchResultsTracks : allTracks).filter(
    (track) => !trackIdsInsideVisibleAlbums.has(track.id)
  );
  const visibleOverviewRefs: OverviewItemRef[] = [
    ...visibleStandaloneTracks.map((track) => ({ type: 'track' as const, id: track.id })),
    ...visibleAlbumGroups.map((group) => ({ type: 'album' as const, id: group.album.id })),
    ...visiblePlaylistGroups.map((group) => ({ type: 'playlist' as const, id: group.playlist.id })),
    ...favoriteArtistRows.map((row) => ({ type: 'artist' as const, id: row.artist.id })),
  ];
  const visibleOverviewKeySet = new Set(visibleOverviewRefs.map(toOverviewItemKey));
  const orderedOverviewRefs = [
    ...overviewOrder.filter((key) => visibleOverviewKeySet.has(key)).map((key) => {
      const [type, ...idParts] = key.split(':');
      return { type: type as OverviewItemType, id: idParts.join(':') };
    }),
    ...visibleOverviewRefs.filter((item) => !overviewOrder.includes(toOverviewItemKey(item))),
  ];
  const renderedOverviewRefs = isOverviewExpanded ? orderedOverviewRefs : orderedOverviewRefs.slice(0, 3);
  const getIsAlbumExpanded = (group: typeof visibleAlbumGroups[number]) => {
    if (hasQuery) {
      return group.hasAlbumMatch || group.matchedTracks.length > 0;
    }
    return Boolean(expandedAlbumIds[group.album.id]);
  };
  const toggleAlbumExpanded = (albumId: string) => {
    setExpandedAlbumIds((prev) => {
      if (prev[albumId]) {
        const next = { ...prev };
        delete next[albumId];
        return next;
      }
      return { ...prev, [albumId]: true };
    });
  };
  const getIsPlaylistExpanded = (group: typeof visiblePlaylistGroups[number]) => {
    if (hasQuery) {
      return group.hasPlaylistMatch || group.matchedTracks.length > 0;
    }
    return Boolean(expandedPlaylistIds[group.playlist.id]);
  };
  const togglePlaylistExpanded = (playlistId: string) => {
    setExpandedPlaylistIds((prev) => {
      if (prev[playlistId]) {
        const next = { ...prev };
        delete next[playlistId];
        return next;
      }
      return { ...prev, [playlistId]: true };
    });
  };
  const handleOverviewDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOverviewOrder((prev) => {
      const prevWithVisible = [
        ...prev.filter((key) => visibleOverviewKeySet.has(key)),
        ...visibleOverviewRefs
          .map((item) => toOverviewItemKey(item))
          .filter((key) => !prev.includes(key)),
      ];
      const oldIndex = prevWithVisible.indexOf(String(active.id));
      const newIndex = prevWithVisible.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return prevWithVisible;
      return arrayMove(prevWithVisible, oldIndex, newIndex);
    });
  };
  const getBrowseReturnCtx = () => ({
    scrollTop: scrollContainerRef.current?.scrollTop || 0,
    searchQuery,
    isOverviewExpanded,
  });
  const navigateWithBrowseContext = (to: string) => {
    const ctx = getBrowseReturnCtx();
    try {
      window.sessionStorage.setItem(BROWSE_RETURN_CTX_STORAGE_KEY, JSON.stringify(ctx));
    } catch {
      // ignore storage failures
    }
    pushNavigationEntry({
      path: `${location.pathname}${location.search}`,
      state: {
        fromBrowse: true,
        browseReturnCtx: ctx,
      },
    });
    navigate(to, { state: { fromBrowse: true, browseReturnCtx: ctx } });
  };
  const randomSeedQueries = [
    'indie dream pop',
    'future bass',
    'lofi hip hop',
    'house classics',
    'alt rock',
    'synthwave',
    'rnb vibes',
    'ambient focus',
  ];
  const loadRandomOnlineTracks = async () => {
    setIsRandomLoading(true);
    try {
      const seed = randomSeedQueries[Math.floor(Math.random() * randomSeedQueries.length)];
      const response = await fetch(
        apiUrl(`/api/search/itunes?entity=song&limit=45&query=${encodeURIComponent(seed)}`)
      );
      if (!response.ok) throw new Error('itunes random failed');
      const payload = await response.json() as {
        results?: Array<{
          trackId?: number;
          trackName?: string;
          artistName?: string;
          collectionName?: string;
          artworkUrl100?: string;
          artworkUrl600?: string;
          previewUrl?: string;
        }>;
      };
      const parsed = (payload.results || [])
        .filter((item) => item.trackId && item.trackName && item.artistName)
        .map((item) => ({
          id: String(item.trackId),
          title: String(item.trackName),
          artist: String(item.artistName),
          album: item.collectionName,
          artworkUrl: item.artworkUrl600 || toHighResArtworkUrl(item.artworkUrl100),
          previewUrl: item.previewUrl,
          source: 'itunes' as const,
        }));
      const shuffled = [...parsed].sort(() => Math.random() - 0.5).slice(0, 8);
      setRandomOnlineTracks(shuffled);
    } catch {
      setRandomOnlineTracks([]);
    } finally {
      setIsRandomLoading(false);
    }
  };
  const normalizeTrackMatchValue = (value: string) => value.trim().toLowerCase();
  const findStrictLocalTrackByResult = (result: NEMusicSearchResult): TrackMetadata | undefined => {
    const artistFieldParts = splitArtistField(result.artist);
    const resultArtists = Array.from(
      new Set([
        ...artistFieldParts.primaryArtists,
        ...artistFieldParts.featuringArtists,
        ...extractFeaturingArtists(result.title),
      ])
    ).map(normalizeTrackMatchValue);
    return Object.values(tracks).find((track) => {
      if (normalizeTrackMatchValue(track.title) !== normalizeTrackMatchValue(result.title)) return false;
      const trackArtists = [
        ...toStringArray(track.artistIds),
        ...toStringArray(track.features),
      ].map(normalizeTrackMatchValue);
      return resultArtists.some((artistName) => trackArtists.includes(artistName));
    });
  };
  const isResultDownloaded = (result: NEMusicSearchResult): boolean => {
    const mappedTrackId = downloadedTrackIds[result.id];
    if (mappedTrackId && tracks[mappedTrackId]) return true;
    return Boolean(findStrictLocalTrackByResult(result));
  };
  const orderedNeMusicSearchResults = [...neMusicSearchResults].sort((left, right) => {
    const leftLocal = isResultDownloaded(left);
    const rightLocal = isResultDownloaded(right);
    if (leftLocal && !rightLocal) return -1;
    if (!leftLocal && rightLocal) return 1;

    return 0;
  });
  const orderedItunesResults = orderedNeMusicSearchResults.filter((item) => item.source !== 'youtube');
  const orderedYoutubeResults = orderedNeMusicSearchResults.filter((item) => item.source === 'youtube');

  useEffect(() => {
    try {
      window.localStorage.setItem(DOWNLOAD_SUCCESS_STORAGE_KEY, JSON.stringify(downloadSuccessIds));
    } catch {
      // ignore storage write failures
    }
  }, [DOWNLOAD_SUCCESS_STORAGE_KEY, downloadSuccessIds]);

  useEffect(() => {
    const visibleKeys = visibleOverviewRefs.map((item) => toOverviewItemKey(item));
    setOverviewOrder((prev) => {
      const next = [
        ...prev.filter((key) => visibleKeys.includes(key)),
        ...visibleKeys.filter((key) => !prev.includes(key)),
      ];
      if (next.length === prev.length && next.every((key, index) => key === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [visibleOverviewRefs.length, hasQuery]);

  useEffect(() => {
    try {
      window.localStorage.setItem(OVERVIEW_ORDER_STORAGE_KEY, JSON.stringify(overviewOrder));
    } catch {
      // ignore storage write failures
    }
  }, [overviewOrder]);

  useEffect(() => {
    const state = location.state as {
      browseTabEntry?: boolean;
      restoreBrowseCtx?: { scrollTop?: number; searchQuery?: string; isOverviewExpanded?: boolean };
    } | null;

    if (state?.browseTabEntry) {
      setIsOverviewExpanded(false);
      window.requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0;
        }
      });
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
      return;
    }

    const ctx = state?.restoreBrowseCtx;
    if (!ctx) return;
    if (typeof ctx.searchQuery === 'string') setSearchQuery(ctx.searchQuery);
    if (typeof ctx.isOverviewExpanded === 'boolean') setIsOverviewExpanded(ctx.isOverviewExpanded);
    window.requestAnimationFrame(() => {
      if (scrollContainerRef.current && typeof ctx.scrollTop === 'number') {
        scrollContainerRef.current.scrollTop = ctx.scrollTop;
      }
    });
  }, [location.key, location.pathname, location.search, navigate]);

  useEffect(() => {
    let isMounted = true;
    const refreshRecommendations = async () => {
      const existing = useRadoogaStore.getState().items || [];
      if (existing.length === 0) {
        await openForYouFeed();
      }
      if (!isMounted) return;
      const recs = (useRadoogaStore.getState().items || []).slice(0, 8).map((item) => ({
        id: item.id,
        title: item.title,
        artist: item.artist,
        artworkUrl: item.artworkUrl,
        previewUrl: item.previewUrl,
        source: 'itunes',
      } as NEMusicSearchResult));
      setRecommendedTracks(recs);
    };
    void refreshRecommendations();
    void loadRandomOnlineTracks();
    return () => {
      isMounted = false;
    };
  }, [location.key]);

  useEffect(() => {
    setDownloadSuccessIds((prev) => {
      let changed = false;
      const next: Record<string, true> = {};
      for (const resultId of Object.keys(prev)) {
        const mappedTrackId = downloadedTrackIds[resultId];
        if (mappedTrackId && tracks[mappedTrackId]) {
          next[resultId] = true;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [downloadedTrackIds, tracks]);

  useEffect(() => {
    if (!hasQuery) {
      setNeMusicSearchResults([]);
      setNeLyricsByTrackId({});
      lyricsLookupInFlightRef.current.clear();
      setNeMusicError(null);
      setIsNeMusicLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsNeMusicLoading(true);
      setNeMusicError(null);
      try {
        const parsePayload = async (endpoint: string) => {
          const response = await fetch(endpoint, { signal: controller.signal });
          if (!response.ok) {
            throw new Error(`Search request failed with status ${response.status}`);
          }
          return await response.json() as {
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
        };

        {
          const trimmedQuery = searchQuery.trim();
          const normalizedExternalQuery = normalizeExternalSearchQuery(trimmedQuery) || trimmedQuery;
          const rawTokens = normalizedExternalQuery.split(/\s+/).filter(Boolean);
          const tokenBigrams = rawTokens
            .slice(0, Math.max(0, rawTokens.length - 1))
            .map((token, index) => `${token} ${rawTokens[index + 1]}`);
          const singleTokenFallbacks = rawTokens
            .filter((token) => token.length >= 4)
            .slice(0, 6);
          const fallbackTerms = Array.from(
            new Set([
              rawTokens.slice(0, 3).join(' '),
              rawTokens.slice(-3).join(' '),
              rawTokens.slice(0, 2).join(' '),
              rawTokens.slice(-2).join(' '),
              ...tokenBigrams.slice(0, 5),
              ...singleTokenFallbacks,
            ].filter((term) => term.trim().length > 0 && term.trim() !== trimmedQuery))
          );

          const itunesSearchPromise = (async () => {
            const payload = await parsePayload(
              apiUrl(`/api/search/itunes?entity=song&limit=25&query=${encodeURIComponent(normalizedExternalQuery)}`)
            );
            const baseResults = payload.results || [];
            let mergedResults = baseResults;
            if (baseResults.length === 0 && fallbackTerms.length > 0) {
              const fallbackPayloads = await Promise.allSettled(
                fallbackTerms.map((term) =>
                  parsePayload(apiUrl(`/api/search/itunes?entity=song&limit=35&query=${encodeURIComponent(term)}`))
                )
              );
              for (const candidate of fallbackPayloads) {
                if (candidate.status === 'fulfilled') {
                  mergedResults = mergedResults.concat(candidate.value.results || []);
                }
              }
            }
            return mergedResults;
          })();

          const youtubeSearchPromise = (async () => {
            const youtubeResponse = await fetch(
              `/api/search/youtube?query=${encodeURIComponent(normalizedExternalQuery)}&limit=30`,
              { signal: controller.signal }
            );
            if (!youtubeResponse.ok) {
              throw new Error(`YouTube search request failed with status ${youtubeResponse.status}`);
            }
            return await youtubeResponse.json() as {
              results?: Array<{
                id?: string;
                title?: string;
                artist?: string;
                artworkUrl?: string;
                source?: 'youtube';
              }>;
            };
          })();

          const itunesRaw = await Promise.allSettled([itunesSearchPromise]);
          const itunesFulfilled = itunesRaw[0].status === 'fulfilled';
          const itunesMergedResults =
            itunesFulfilled
              ? itunesRaw[0].value
              : [];

          const dedupedByTrackId = new Map<number, (typeof itunesMergedResults)[number]>();
          for (const item of itunesMergedResults) {
            if (item.trackId && !dedupedByTrackId.has(item.trackId)) {
              dedupedByTrackId.set(item.trackId, item);
            }
          }

          const itunesResults: NEMusicSearchResult[] = Array.from(dedupedByTrackId.values())
            .filter((item) => item.trackId && item.trackName && item.artistName)
            .map((item) => ({
              id: String(item.trackId),
              title: String(item.trackName),
              artist: String(item.artistName),
              album: item.collectionName,
              artworkUrl: item.artworkUrl600 || toHighResArtworkUrl(item.artworkUrl100),
              previewUrl: item.previewUrl,
              source: 'itunes',
            }));

          if (!controller.signal.aborted) {
            // Show iTunes immediately, then append YouTube when ready.
            setNeMusicSearchResults(itunesResults);
          }

          const youtubeRaw = await Promise.allSettled([youtubeSearchPromise]);
          const youtubeFulfilled = youtubeRaw[0].status === 'fulfilled';
          const youtubeResults: NEMusicSearchResult[] =
            youtubeFulfilled
              ? (youtubeRaw[0].value.results || [])
                .filter((item) => item.id && item.title)
                .map((item) => ({
                  id: String(item.id),
                  title: String(item.title),
                  artist: String(item.artist || 'YouTube'),
                  artworkUrl: item.artworkUrl,
                  source: 'youtube',
                }))
              : [];

          if (!controller.signal.aborted && youtubeResults.length > 0) {
            setNeMusicSearchResults((current) => {
              const byId = new Map<string, NEMusicSearchResult>();
              for (const item of current) {
                byId.set(item.id, item);
              }
              for (const item of youtubeResults) {
                const existing = byId.get(item.id);
                if (existing?.source === 'itunes') continue;
                if (!existing) byId.set(item.id, item);
              }

              return Array.from(byId.values()).sort((left, right) => {
                if (left.source !== right.source) {
                  if (left.source === 'itunes') return -1;
                  if (right.source === 'itunes') return 1;
                }
                const leftScore = computeSearchRelevance(searchQuery, left.title, left.artist);
                const rightScore = computeSearchRelevance(searchQuery, right.title, right.artist);
                if (rightScore !== leftScore) return rightScore - leftScore;
                return left.title.localeCompare(right.title);
              });
            });
          }
          if (!itunesFulfilled && !youtubeFulfilled) {
            throw new Error('Both iTunes and YouTube search failed');
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setNeMusicSearchResults([]);
        setNeMusicError('Не удалось получить результаты поиска. Проверьте сеть и попробуйте снова.');
      } finally {
        setIsNeMusicLoading(false);
      }
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [hasQuery, searchQuery]);

  useEffect(() => {
    if (!hasQuery || neMusicSearchResults.length === 0) {
      return;
    }

    const controller = new AbortController();
    const candidates = neMusicSearchResults.slice(0, 8);
    const maxParallelLookups = 2;

    const lookupLyrics = async (result: NEMusicSearchResult) => {
      if (lyricsLookupInFlightRef.current.has(result.id)) return;
      if (neLyricsByTrackId[result.id] !== undefined) return;

      lyricsLookupInFlightRef.current.add(result.id);
      try {
        const response = await fetch(apiUrl('/api/lyrics/lookup'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `${result.artist} - ${result.title}`,
            title: result.title,
            artist: result.artist,
          }),
          signal: controller.signal,
        });

        if (!response.ok) return;
        const payload = (await response.json()) as { lyrics?: string };
        const lyrics = typeof payload.lyrics === 'string' ? sanitizeLyricsForUi(payload.lyrics) : '';

        setNeLyricsByTrackId((prev) => {
          if (prev[result.id] === lyrics) return prev;
          return { ...prev, [result.id]: lyrics };
        });
      } catch (error) {
        if ((error as Error).name !== 'AbortError') return;
      } finally {
        lyricsLookupInFlightRef.current.delete(result.id);
      }
    };

    const runLookups = async () => {
      for (let index = 0; index < candidates.length; index += maxParallelLookups) {
        const batch = candidates.slice(index, index + maxParallelLookups);
        await Promise.allSettled(batch.map((result) => lookupLyrics(result)));
      }
    };

    void runLookups();

    return () => {
      controller.abort();
    };
  }, [hasQuery, neMusicSearchResults]);

  useEffect(() => {
    const candidates = Object.values(albums)
      .map((album) => {
        if (album.itunesCollectionId) return album.itunesCollectionId;
        const match = album.id.match(/^itunes-(\d+)$/);
        return match?.[1] || null;
      })
      .filter((value): value is string => Boolean(value))
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .filter((value) => !itunesTrackCountByCollectionId[value]);
    if (candidates.length === 0) return;

    const controller = new AbortController();
    const loadTrackCounts = async () => {
      const nextMap: Record<string, number> = {};
      await Promise.allSettled(
        candidates.slice(0, 20).map(async (collectionId) => {
          const response = await fetch(
            `https://itunes.apple.com/lookup?id=${encodeURIComponent(collectionId)}&entity=song&limit=1`,
            { signal: controller.signal }
          );
          if (!response.ok) return;
          const payload = await response.json() as {
            results?: Array<{ wrapperType?: string; trackCount?: number }>;
          };
          const collection = (payload.results || []).find((item) => item.wrapperType === 'collection');
          const trackCount = Number(collection?.trackCount || 0);
          if (trackCount > 0) nextMap[collectionId] = trackCount;
        })
      );
      if (Object.keys(nextMap).length === 0) return;
      setItunesTrackCountByCollectionId((prev) => ({ ...prev, ...nextMap }));
      Object.entries(nextMap).forEach(([collectionId, trackCount]) => {
        const targetAlbum = Object.values(useMockServer.getState().albums).find(
          (album) =>
            album.itunesCollectionId === collectionId ||
            album.id === `itunes-${collectionId}`
        );
        const nextCollectionId = targetAlbum?.itunesCollectionId || collectionId;
        if (
          targetAlbum &&
          (targetAlbum.sourceTrackCount !== trackCount ||
            targetAlbum.itunesCollectionId !== nextCollectionId)
        ) {
          useMockServer.getState().updateAlbum(targetAlbum.id, {
            sourceTrackCount: trackCount,
            itunesCollectionId: nextCollectionId,
          });
        }
      });
    };
    void loadTrackCounts();
    return () => controller.abort();
  }, [albums, itunesTrackCountByCollectionId]);

  useEffect(() => {
    const unresolvedAlbums = Object.values(albums)
      .filter((album) => !album.sourceTrackCount)
      .filter((album) => !album.itunesCollectionId && !/^itunes-\d+$/.test(album.id))
      .slice(0, 10);
    if (unresolvedAlbums.length === 0) return;

    const controller = new AbortController();
    const resolveLegacyAlbums = async () => {
      for (const album of unresolvedAlbums) {
        const artistName = (album.artistIds || [])
          .map((artistId) => artists[artistId]?.name || '')
          .find(Boolean);
        if (!artistName) continue;
        const term = `${artistName} ${album.title}`.trim();
        try {
          const response = await fetch(
            apiUrl(`/api/search/itunes?entity=album&limit=10&query=${encodeURIComponent(term)}`),
            { signal: controller.signal }
          );
          if (!response.ok) continue;
          const payload = await response.json() as {
            results?: Array<{
              collectionId?: number;
              collectionName?: string;
              artistName?: string;
              trackCount?: number;
              collectionType?: string;
            }>;
          };
          const matched = (payload.results || [])
            .filter((item) => item.collectionId && item.collectionName && item.artistName)
            .filter((item) => String(item.collectionType || '').toLowerCase() === 'album')
            .find((item) =>
              normalizeAlbumTitle(String(item.collectionName)) === normalizeAlbumTitle(album.title) &&
              String(item.artistName).toLowerCase().includes(artistName.toLowerCase())
            );
          if (!matched?.collectionId) continue;
          const resolvedCollectionId = String(matched.collectionId);
          const resolvedTrackCount = Number(matched.trackCount || 0);
          updateAlbum(album.id, {
            itunesCollectionId: resolvedCollectionId,
            sourceTrackCount: resolvedTrackCount > 0 ? resolvedTrackCount : album.sourceTrackCount,
          });
          if (resolvedTrackCount > 0) {
            setItunesTrackCountByCollectionId((prev) => ({ ...prev, [resolvedCollectionId]: resolvedTrackCount }));
          }
        } catch (error) {
          if ((error as Error).name === 'AbortError') return;
        }
      }
    };
    void resolveLegacyAlbums();
    return () => controller.abort();
  }, [albums, artists, updateAlbum]);

  const downloadResult = async (
    result: NEMusicSearchResult,
    options?: { autoplayAfterDownload?: boolean }
  ) => {
    const downloadQuery = `${result.artist} - ${result.title}`;

    setDownloadLoadingId(result.id);
    setDownloadError(null);
    try {
      const response = new Response(null, { status: 410, statusText: 'Server media download removed' });

      if (!response.ok) {
        throw new Error('Не удалось скачать трек. Попробуйте ещё раз.');
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
      const artistFieldParts = splitArtistField(normalizedArtist);
      const featuringArtistsFromTitle = extractFeaturingArtists(normalizedTitle);
      const allArtistNames = Array.from(
        new Set([
          ...artistFieldParts.primaryArtists,
          ...artistFieldParts.featuringArtists,
          ...featuringArtistsFromTitle,
        ])
      );
      const featuringArtists = Array.from(
        new Set([...artistFieldParts.featuringArtists, ...featuringArtistsFromTitle])
      );

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

      const fetchArtistProfile = async (artistName: string): Promise<{ description: string; imageUrl?: string }> => (
        resolveArtistDescriptionRu(artistName, {
          fallbackDescription: `${artistName} - артист в твоей коллекции rainboow. Скачан автоматически по метаданным трека.`,
        })
      );

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
        } else if (downloadedCoverBlob) {
          const existingArtist = Object.values(useMockServer.getState().artists).find(
            (artist) => artist.name.trim().toLowerCase() === artistName.toLowerCase()
          );
          if (existingArtist) {
            await ensureArtistBannerFromTrackCover({
              artist: existingArtist,
              coverBlob: downloadedCoverBlob,
              updateArtist,
            });
          }
        }
      }

      const existingTrack = Object.values(tracks).find(
        (track) => {
          if (track.title.trim().toLowerCase() !== normalizedTitle.toLowerCase()) return false;
          const trackArtists = [
            ...toStringArray(track.artistIds),
            ...toStringArray(track.features),
          ].map((value) => value.trim().toLowerCase());
          return allArtistNames.some((artistName) => trackArtists.includes(artistName.toLowerCase()));
        }
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
          previewUrl: result.previewUrl,
          isPreviewOnly: false,
        };
        addTrack(newTrack);
      } else {
        updateTrack(existingTrack.id, {
          artistIds: allArtistNames.length > 0 ? allArtistNames : existingTrack.artistIds,
          features: featuringArtists.length > 0 ? featuringArtists : existingTrack.features,
          coverUrl: coverId || existingTrack.coverUrl,
          lyrics: headerLyrics || existingTrack.lyrics,
          previewUrl: result.previewUrl || existingTrack.previewUrl,
          isPreviewOnly: false,
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
      setOverviewOrder((prev) => {
        const trackKey = toOverviewItemKey({ type: 'track', id: targetTrackId });
        return [trackKey, ...prev.filter((key) => key !== trackKey)];
      });
      if (user) {
        const favoriteTrackIds = user.favoriteTrackIds || [];
        const nextFavorites = [targetTrackId, ...favoriteTrackIds.filter((id) => id !== targetTrackId)];
        updateUser(user.id, { favoriteTrackIds: nextFavorites });
      }
      if (options?.autoplayAfterDownload) {
        const queue = Object.values(useMockServer.getState().tracks).map((track) => track.id);
        const playbackQueue = queue.includes(targetTrackId)
          ? queue
          : [targetTrackId, ...queue];
        playTrack(targetTrackId, playbackQueue, null);
      }
    } catch (error) {
      if (result.previewUrl) {
        const previewTrackId = upsertPreviewOnlyTrack({
          existingTracks: useMockServer.getState().tracks,
          resultId: result.id,
          title: result.title,
          artist: result.artist,
          artworkUrl: result.artworkUrl,
          previewUrl: result.previewUrl,
          ownerId: currentUserId || 'system',
          addTrack: useMockServer.getState().addTrack,
          updateTrack: useMockServer.getState().updateTrack,
        });
        setDownloadedTrackIds((prev) => ({ ...prev, [result.id]: previewTrackId }));
        setOverviewOrder((prev) => {
          const trackKey = toOverviewItemKey({ type: 'track', id: previewTrackId });
          return [trackKey, ...prev.filter((key) => key !== trackKey)];
        });
        if (options?.autoplayAfterDownload) {
          const queue = Object.values(useMockServer.getState().tracks).map((track) => track.id);
          const playbackQueue = queue.includes(previewTrackId) ? queue : [previewTrackId, ...queue];
          playTrack(previewTrackId, playbackQueue, null);
        }
        setDownloadError('Полная версия сейчас недоступна. Добавили preview-трек, можно попробовать скачать позже.');
      } else {
        setDownloadError((error as Error).message || 'Не удалось скачать трек. Попробуйте ещё раз.');
      }
    } finally {
      setDownloadLoadingId(null);
    }
  };

  const playOnlineResult = (result: NEMusicSearchResult) => {
    const normalize = (value: string) => value.trim().toLowerCase();
    const resultArtists = splitArtistNames(result.artist).map(normalize);
    const matchTrackFromLibrary = (): TrackMetadata | undefined => {
      const direct = Object.values(tracks).find((track) => {
        if (normalize(track.title) !== normalize(result.title)) return false;
        const trackArtists = toStringArray(track.artistIds).map(normalize);
        return resultArtists.some((artistName) => trackArtists.includes(artistName));
      });
      if (direct) return direct;

      return Object.values(tracks).find((track) => {
        const trackArtistsText = toStringArray(track.artistIds).join(', ');
        const artistMatched = hasTokenOverlap(trackArtistsText, result.artist);
        const titleMatched =
          hasTokenOverlap(track.title, result.title) ||
          normalize(track.title).includes(normalize(result.title)) ||
          normalize(result.title).includes(normalize(track.title));
        return artistMatched && titleMatched;
      });
    };
    const matchedTrack = tracks[downloadedTrackIds[result.id]] || matchTrackFromLibrary();
    const downloadedTrackId = matchedTrack?.id;
    if (downloadedTrackId) {
      if (currentTrackId === downloadedTrackId) {
        togglePlay();
        return;
      }
      const queueSource = hasQuery ? searchResultsTracks : allTracks;
      const queue = queueSource.map((track) => track.id);
      const playbackQueue = queue.includes(downloadedTrackId) ? queue : [downloadedTrackId, ...queue];
      playTrack(downloadedTrackId, playbackQueue, null);
      return;
    }

    if (result.previewUrl) {
      const previewQueue = orderedNeMusicSearchResults
        .filter((item) => Boolean(item.previewUrl))
        .map((item) => ({
          key: `online-${item.id}`,
          url: item.previewUrl!,
          title: item.title,
          artist: item.artist,
          artworkUrl: item.artworkUrl,
        }));
      playPreview(
        {
          key: `online-${result.id}`,
          url: result.previewUrl,
          title: result.title,
          artist: result.artist,
          artworkUrl: result.artworkUrl,
        },
        previewQueue
      );
    }
  };
  const playFavoriteArtist = (artistName: string, queueTrackIds: string[]) => {
    if (queueTrackIds.length === 0) return;
    const isCurrentArtistTrack = Boolean(currentTrackId && queueTrackIds.includes(currentTrackId));
    if (isCurrentArtistTrack) {
      togglePlay();
      return;
    }
    playTrack(queueTrackIds[0], queueTrackIds, null);
  };

  const removeTrackFromApp = async (trackId: string) => {
    const isLocalCacheKey = (value?: string): value is string =>
      Boolean(value && !value.startsWith('http') && !value.startsWith('data:'));

    const beforeState = useMockServer.getState();
    const trackBeforeDelete = beforeState.tracks[trackId];
    const removedTrackCoverId = isLocalCacheKey(trackBeforeDelete?.coverUrl) ? trackBeforeDelete.coverUrl : undefined;

    await deleteAudioFile(trackId).catch(() => undefined);
    deleteTrack(trackId);

    const stateAfterTrackDelete = useMockServer.getState();
    const referencedArtistIds = new Set<string>();
    for (const track of Object.values(stateAfterTrackDelete.tracks)) {
      for (const artistRef of toStringArray(track.artistIds)) {
        const resolvedId = resolveArtistId(artistRef, stateAfterTrackDelete.artists);
        if (resolvedId) {
          referencedArtistIds.add(resolvedId);
        }
      }
    }

    const orphanArtists = Object.values(stateAfterTrackDelete.artists).filter((artist) => {
      return !referencedArtistIds.has(artist.id);
    });

    const removedArtistBannerIds: string[] = [];
    for (const artist of orphanArtists) {
      if (isLocalCacheKey(artist.bannerUrl)) {
        removedArtistBannerIds.push(artist.bannerUrl);
      }
      deleteArtist(artist.id);
    }

    const finalState = useMockServer.getState();
    const referencedImageIds = new Set(
      [
        ...Object.values(finalState.tracks).map((track) => track.coverUrl),
        ...Object.values(finalState.artists).map((artist) => artist.bannerUrl),
        ...Object.values(finalState.playlists).map((playlist) => playlist.coverUrl),
        ...Object.values(finalState.albums).map((album) => album.coverUrl),
      ].filter((value): value is string => isLocalCacheKey(value))
    );

    const imageIdsToDelete = Array.from(
      new Set([removedTrackCoverId, ...removedArtistBannerIds].filter((value): value is string => Boolean(value)))
    ).filter((imageId) => !referencedImageIds.has(imageId));

    await Promise.all(imageIdsToDelete.map((imageId) => deleteImageFile(imageId).catch(() => undefined)));
    setDownloadedTrackIds((prev) => {
      const next: Record<string, string> = {};
      for (const [resultId, mappedTrackId] of Object.entries(prev) as Array<[string, string]>) {
        if (mappedTrackId !== trackId) {
          next[resultId] = mappedTrackId;
        }
      }
      return next;
    });

    setNotice('Трек удалён из приложения и локального кэша. Файл на устройстве за пределами приложения не удаляется.');
    window.setTimeout(() => setNotice(null), 3500);
  };

  const clearAlbumFromApp = async (albumId: string) => {
    const album = albums[albumId];
    if (!album) return;
    const shouldClear = window.confirm(
      'Удалить скачанные треки альбома только из приложения? Файлы на устройстве вне приложения не удаляются.'
    );
    if (!shouldClear) return;
    for (const trackId of album.trackIds || []) {
      await removeTrackFromApp(trackId);
    }
    useMockServer.setState((state) => {
      const updatedAlbums = { ...state.albums };
      delete updatedAlbums[albumId];
      const updatedUsers = Object.fromEntries(
        Object.entries(state.users).map(([userId, user]) => [
          userId,
          {
            ...user,
            favoriteAlbumIds: (user.favoriteAlbumIds || []).filter((favoriteId) => favoriteId !== albumId),
          },
        ])
      );
      return {
        ...state,
        albums: updatedAlbums,
        users: updatedUsers,
      };
    });
  };
  const removeAlbumOnlyFromApp = (albumId: string) => {
    const album = albums[albumId];
    if (!album) return;
    const shouldRemove = window.confirm(
      'Удалить только альбом из приложения? Треки останутся в списке как отдельные.'
    );
    if (!shouldRemove) return;
    useMockServer.setState((state) => {
      const updatedAlbums = { ...state.albums };
      delete updatedAlbums[albumId];
      const updatedUsers = Object.fromEntries(
        Object.entries(state.users).map(([userId, user]) => [
          userId,
          {
            ...user,
            favoriteAlbumIds: (user.favoriteAlbumIds || []).filter((favoriteId) => favoriteId !== albumId),
          },
        ])
      );
      return {
        ...state,
        albums: updatedAlbums,
        users: updatedUsers,
      };
    });
    setNotice('Альбом удалён. Треки оставлены в общем списке.');
    window.setTimeout(() => setNotice(null), 3000);
  };
  const clearPlaylistFromApp = async (playlistId: string) => {
    const playlist = playlists[playlistId];
    if (!playlist) return;
    const shouldClear = window.confirm(
      'Удалить скачанные треки плейлиста только из приложения? Файлы на устройстве вне приложения не удаляются.'
    );
    if (!shouldClear) return;
    for (const trackId of playlist.trackIds || []) {
      await removeTrackFromApp(trackId);
    }
    useMockServer.setState((state) => {
      const updatedPlaylists = { ...state.playlists };
      delete updatedPlaylists[playlistId];
      const updatedUsers = Object.fromEntries(
        Object.entries(state.users).map(([userId, user]) => [
          userId,
          {
            ...user,
            favoritePlaylistIds: (user.favoritePlaylistIds || []).filter((favoriteId) => favoriteId !== playlistId),
          },
        ])
      );
      return {
        ...state,
        playlists: updatedPlaylists,
        users: updatedUsers,
      };
    });
  };
  const removePlaylistOnlyFromApp = (playlistId: string) => {
    const playlist = playlists[playlistId];
    if (!playlist) return;
    const shouldRemove = window.confirm(
      'Удалить только плейлист из приложения? Треки останутся в списке как отдельные.'
    );
    if (!shouldRemove) return;
    useMockServer.setState((state) => {
      const updatedPlaylists = { ...state.playlists };
      delete updatedPlaylists[playlistId];
      const updatedUsers = Object.fromEntries(
        Object.entries(state.users).map(([userId, user]) => [
          userId,
          {
            ...user,
            favoritePlaylistIds: (user.favoritePlaylistIds || []).filter((favoriteId) => favoriteId !== playlistId),
          },
        ])
      );
      return {
        ...state,
        playlists: updatedPlaylists,
        users: updatedUsers,
      };
    });
    setNotice('Плейлист удалён. Треки оставлены в общем списке.');
    window.setTimeout(() => setNotice(null), 3000);
  };
  const openTrackRecommendations = (trackId: string) => {
    void prefetchNextBatch();
    navigate(`/radooga?mode=track&seed=${encodeURIComponent(trackId)}`);
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
  const getPlaylistRowMeta = (playlist: typeof allPlaylists[number]) => {
    const playlistTracks = (playlist.trackIds || [])
      .map((trackId) => tracks[trackId])
      .filter(Boolean);
    const formatCount = playlistTracks.reduce<Record<string, number>>((acc, track) => {
      const key = (track.format || 'unknown').toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const qualityLabel = Object.entries(formatCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
    const isExplicit = playlistTracks.some((track) => track.isExplicit);
    const artistName = Array.from(new Set(playlistTracks.flatMap((track) => toStringArray(track.artistIds)))).join(', ');
    return { qualityLabel, isExplicit, artistName: artistName || 'Unknown artist' };
  };
  const trackById = new Map(visibleStandaloneTracks.map((track) => [track.id, track]));
  const albumGroupById = new Map(visibleAlbumGroups.map((group) => [group.album.id, group]));
  const playlistGroupById = new Map(visiblePlaylistGroups.map((group) => [group.playlist.id, group]));
  const favoriteArtistRowById = new Map(favoriteArtistRows.map((row) => [row.artist.id, row]));

  return (
    <div ref={scrollContainerRef} className="p-4 pt-8 h-full overflow-y-auto scrollbar-hide" onClick={() => setActiveMenuId(null)}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Обзор</h1>
        <button
          type="button"
          onClick={() => setIsUploadModalOpen(true)}
          className="h-10 w-10 text-violet-600 hover:text-violet-700 transition-colors flex items-center justify-center"
          aria-label="Загрузить трек с устройства"
        >
          <FolderUp className="w-5 h-5" />
        </button>
      </div>

      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
        <input
          type="text"
          placeholder="Поиск треков, альбомов и артистов..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-white/85 text-slate-700 pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
      </div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
          <span>Мои треки</span>
          <span className="text-xs font-medium normal-case tracking-normal text-slate-400">{allTracks.length}</span>
        </h2>
        {orderedOverviewRefs.length > 3 && (
          <button
            type="button"
            onClick={() => setIsOverviewExpanded((prev) => !prev)}
            className="text-sm text-violet-600 hover:text-violet-700"
          >
            {isOverviewExpanded ? 'Скрыть' : 'Показать все'}
          </button>
        )}
      </div>

      <div>
          <div className="space-y-2">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleOverviewDragEnd}>
              <SortableContext items={renderedOverviewRefs.map(toOverviewItemKey)} strategy={verticalListSortingStrategy}>
                {renderedOverviewRefs.map((overviewItem, index) => {
                  const itemKey = toOverviewItemKey(overviewItem);
                  if (overviewItem.type === 'track') {
                    const track = trackById.get(overviewItem.id);
                    if (!track) return null;
                    return (
                      <DraggableOverviewItem key={itemKey} itemKey={itemKey}>
                        <TrackListItem
                          track={track}
                          user={resolvedUser}
                          isPlaying={isPlaying}
                          isActive={currentTrackId === track.id}
                          searchQuery={searchQuery}
                          onPlay={() => playTrack(track.id, visibleStandaloneTracks.map((t) => t.id), null)}
                          onArtistClick={(artistRef) => {
                            const artistId = resolveArtistId(artistRef, artists);
                            if (artistId) navigateWithBrowseContext(`/artist/${artistId}`);
                          }}
                          onToggleFavorite={() => {
                            if (!user) return;
                            const favoriteTrackIds = user.favoriteTrackIds || [];
                            const newFavorites = favoriteTrackIds.includes(track.id)
                              ? favoriteTrackIds.filter((id) => id !== track.id)
                              : [track.id, ...favoriteTrackIds];
                            updateUser(user.id, { favoriteTrackIds: newFavorites });
                          }}
                          onAddToPlaylist={() => setAddingToPlaylistTrackId(track.id)}
                          onOpenRecommendations={() => openTrackRecommendations(track.id)}
                          onEdit={() => setEditingTrack(track)}
                          onDelete={() => removeTrackFromApp(track.id)}
                        />
                      </DraggableOverviewItem>
                    );
                  }
                  if (overviewItem.type === 'album') {
                    const group = albumGroupById.get(overviewItem.id);
                    if (!group) return null;
                    const { album } = group;
                    const { artistName, qualityLabel, isExplicit } = getAlbumRowMeta(album);
                    const downloadedTracks = getDownloadedAlbumTrackCount(album.id, album.trackIds, tracks);
                    const fallbackCollectionId = resolveAlbumCollectionId(album);
                    const resolvedOnlineTotal = fallbackCollectionId ? (itunesTrackCountByCollectionId[fallbackCollectionId] || 0) : 0;
                    const totalTracks = resolveAlbumTotalTracks({
                      downloadedTracks,
                      persistedSourceTrackCount: album.sourceTrackCount,
                      lookupTrackCount: resolvedOnlineTotal,
                    });
                    const albumRoute = album.itunesCollectionId
                      ? `/album/itunes-${album.itunesCollectionId}`
                      : (/^itunes-album-(\d+)$/.test(album.id)
                        ? `/album/itunes-${album.id.replace('itunes-album-', '')}`
                        : `/album/${album.id}`);
                    const isExpanded = getIsAlbumExpanded(group);
                    const nestedTracks = hasQuery ? group.matchedTracks : group.downloadedTracks;
                    return (
                      <DraggableOverviewItem key={itemKey} itemKey={itemKey}>
                        <div className="space-y-1">
                          <AlbumTrackListItem
                            title={album.title}
                            artistName={artistName}
                            coverUrl={album.coverUrl}
                            trackCount={album.trackIds.length}
                            qualityLabel={qualityLabel}
                            isExplicit={isExplicit}
                            isActive={Boolean(currentTrackId && album.trackIds.includes(currentTrackId))}
                            isPlaying={isPlaying}
                            downloadedTracks={downloadedTracks}
                            totalTracks={totalTracks}
                            isFullyDownloaded={downloadedTracks > 0}
                            searchQuery={searchQuery}
                            isExpanded={isExpanded}
                            nestedVisibleCount={nestedTracks.length}
                            onToggleExpand={() => toggleAlbumExpanded(album.id)}
                            onOpen={() => navigateWithBrowseContext(albumRoute)}
                            onArtistClick={(artistRef) => navigateWithBrowseContext(resolveArtistRoute(artistRef, artists))}
                            onEdit={() => navigateWithBrowseContext(albumRoute)}
                            onClearCache={() => void clearAlbumFromApp(album.id)}
                            onRemoveAlbumOnly={() => removeAlbumOnlyFromApp(album.id)}
                            onDownload={() => {
                              const suffix = /^\/album\/itunes-\d+$/.test(albumRoute) ? '?autodownload=1' : '';
                              navigateWithBrowseContext(`${albumRoute}${suffix}`);
                            }}
                            onPlay={() => {
                              if (album.trackIds.length > 0) playTrack(album.trackIds[0], album.trackIds, album.id);
                            }}
                          />
                          {isExpanded && nestedTracks.length > 0 && (
                            <div className="ml-6 pl-4 border-l border-slate-300/70 space-y-1">
                              {nestedTracks.map((track) => (
                                <TrackListItem
                                  key={`album-track-${album.id}-${track.id}`}
                                  track={track}
                                  user={resolvedUser}
                                  isPlaying={isPlaying}
                                  isActive={currentTrackId === track.id}
                                  searchQuery={searchQuery}
                                  onPlay={() => playTrack(track.id, group.downloadedTracks.map((item) => item.id), album.id)}
                                  onArtistClick={(artistRef) => {
                                    const artistId = resolveArtistId(artistRef, artists);
                                    if (artistId) navigateWithBrowseContext(`/artist/${artistId}`);
                                  }}
                                  onToggleFavorite={() => {
                                    if (!user) return;
                                    const favoriteTrackIds = user.favoriteTrackIds || [];
                                    const newFavorites = favoriteTrackIds.includes(track.id)
                                      ? favoriteTrackIds.filter((id) => id !== track.id)
                                      : [track.id, ...favoriteTrackIds];
                                    updateUser(user.id, { favoriteTrackIds: newFavorites });
                                  }}
                                  onAddToPlaylist={() => setAddingToPlaylistTrackId(track.id)}
                                  onOpenRecommendations={() => openTrackRecommendations(track.id)}
                                  onEdit={() => setEditingTrack(track)}
                                  onDelete={() => removeTrackFromApp(track.id)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </DraggableOverviewItem>
                    );
                  }
                  if (overviewItem.type === 'playlist') {
                    const group = playlistGroupById.get(overviewItem.id);
                    if (!group) return null;
                    const { playlist } = group;
                    const { artistName, qualityLabel, isExplicit } = getPlaylistRowMeta(playlist);
                    const downloadedTracks = group.downloadedTracks.length;
                    const totalTracks = playlist.trackIds.length;
                    const isExpanded = getIsPlaylistExpanded(group);
                    const nestedTracks = hasQuery ? group.matchedTracks : group.downloadedTracks;
                    const queueTrackIds = group.downloadedTracks.map((track) => track.id);
                    const isQueueActive = Boolean(currentTrackId && queueTrackIds.includes(currentTrackId));
                    return (
                      <DraggableOverviewItem key={itemKey} itemKey={itemKey}>
                        <div className="space-y-1">
                          <AlbumTrackListItem
                            title={playlist.title}
                            artistName={artistName}
                            coverUrl={playlist.coverUrl}
                            trackCount={playlist.trackIds.length}
                            qualityLabel={qualityLabel}
                            isExplicit={isExplicit}
                            isActive={isQueueActive}
                            isPlaying={isPlaying}
                            downloadedTracks={downloadedTracks}
                            totalTracks={totalTracks}
                            isFullyDownloaded={downloadedTracks > 0}
                            searchQuery={searchQuery}
                            isExpanded={isExpanded}
                            nestedVisibleCount={nestedTracks.length}
                            itemLabel="Плейлист"
                            openLabel="Открыть плейлист"
                            playLabel="Воспроизвести плейлист"
                            clearGroupOnlyLabel="Удалить плейлист - треки оставить"
                            onToggleExpand={() => togglePlaylistExpanded(playlist.id)}
                            onOpen={() => navigateWithBrowseContext(`/playlist/${playlist.id}`)}
                            onArtistClick={(artistRef) => navigateWithBrowseContext(resolveArtistRoute(artistRef, artists))}
                            onEdit={() => navigateWithBrowseContext(`/playlist/${playlist.id}`)}
                            onClearCache={() => void clearPlaylistFromApp(playlist.id)}
                            onRemoveAlbumOnly={() => removePlaylistOnlyFromApp(playlist.id)}
                            onPlay={() => {
                              if (queueTrackIds.length > 0) playTrack(queueTrackIds[0], queueTrackIds, null);
                            }}
                          />
                          {isExpanded && nestedTracks.length > 0 && (
                            <div className="ml-6 pl-4 border-l border-slate-300/70 space-y-1">
                              {nestedTracks.map((track) => (
                                <TrackListItem
                                  key={`playlist-track-${playlist.id}-${track.id}`}
                                  track={track}
                                  user={resolvedUser}
                                  isPlaying={isPlaying}
                                  isActive={currentTrackId === track.id}
                                  searchQuery={searchQuery}
                                  onPlay={() => playTrack(track.id, queueTrackIds, null)}
                                  onArtistClick={(artistRef) => {
                                    const artistId = resolveArtistId(artistRef, artists);
                                    if (artistId) navigateWithBrowseContext(`/artist/${artistId}`);
                                  }}
                                  onToggleFavorite={() => {
                                    if (!user) return;
                                    const favoriteTrackIds = user.favoriteTrackIds || [];
                                    const newFavorites = favoriteTrackIds.includes(track.id)
                                      ? favoriteTrackIds.filter((id) => id !== track.id)
                                      : [track.id, ...favoriteTrackIds];
                                    updateUser(user.id, { favoriteTrackIds: newFavorites });
                                  }}
                                  onAddToPlaylist={() => setAddingToPlaylistTrackId(track.id)}
                                  onOpenRecommendations={() => openTrackRecommendations(track.id)}
                                  onEdit={() => setEditingTrack(track)}
                                  onDelete={() => removeTrackFromApp(track.id)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </DraggableOverviewItem>
                    );
                  }
                  const row = favoriteArtistRowById.get(overviewItem.id);
                  if (!row) return null;
                  const queueTrackIds = row.downloadedTracks.map((track) => track.id);
                  const isArtistQueueActive = Boolean(currentTrackId && queueTrackIds.includes(currentTrackId));
                  return (
                    <DraggableOverviewItem key={itemKey} itemKey={itemKey}>
                      <FavoriteArtistListItem
                        artist={row.artist}
                        isActive={isArtistQueueActive}
                        isPlaying={isPlaying}
                        colorIndex={index}
                        onOpen={() => navigateWithBrowseContext(`/artist/${row.artist.id}`)}
                        onPlay={() => playFavoriteArtist(row.artist.name, queueTrackIds)}
                      />
                    </DraggableOverviewItem>
                  );
                })}
              </SortableContext>
            </DndContext>
            {!hasQuery && recommendedTracks.length > 0 && (
              <div className="mt-6">
                <div className="text-sm font-medium text-slate-500 mb-2">Рекомендации</div>
                <div className="space-y-2">
                  {recommendedTracks.map((result) => {
                    const downloadedTrackId = downloadedTrackIds[result.id];
                    const downloadedTrack = downloadedTrackId
                      ? tracks[downloadedTrackId]
                      : findStrictLocalTrackByResult(result);
                    const isDownloadedTrackActive = Boolean(downloadedTrack?.id && currentTrackId === downloadedTrack.id);
                    const isPreviewActive = !downloadedTrack?.id && currentPreviewKey === `browse-rec-${result.id}`;
                    return (
                      <OnlineTrackListItem
                        key={`browse-rec-${result.id}`}
                        track={result as OnlineTrackItemData}
                        isActive={isDownloadedTrackActive || isPreviewActive}
                        isPlaying={isPlaying}
                        canDownload
                        isDownloading={downloadLoadingId === result.id}
                        isDownloaded={Boolean(downloadedTrack?.id && !downloadedTrack.isPreviewOnly)}
                        emphasizeDownloaded
                        onDownload={() => downloadResult(result, { autoplayAfterDownload: true })}
                        onArtistClick={(artistName) => navigateWithBrowseContext(resolveArtistRoute(artistName, artists))}
                        onPlay={() => {
                          if (downloadedTrack?.id) {
                            playTrack(downloadedTrack.id, [downloadedTrack.id], null);
                            return;
                          }
                          if (result.previewUrl) {
                            playPreview({
                              key: `browse-rec-${result.id}`,
                              url: result.previewUrl,
                              title: result.title,
                              artist: result.artist,
                              artworkUrl: result.artworkUrl,
                            });
                          }
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {!hasQuery && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-slate-500">Рандомное</div>
                  <button
                    type="button"
                    onClick={() => void loadRandomOnlineTracks()}
                    className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700"
                  >
                    <RefreshCcw className={`w-3.5 h-3.5 ${isRandomLoading ? 'animate-spin' : ''}`} />
                    Обновить
                  </button>
                </div>
                <div className="space-y-2">
                  {randomOnlineTracks.map((result) => {
                    const downloadedTrackId = downloadedTrackIds[result.id];
                    const downloadedTrack = downloadedTrackId
                      ? tracks[downloadedTrackId]
                      : findStrictLocalTrackByResult(result);
                    const isDownloadedTrackActive = Boolean(downloadedTrack?.id && currentTrackId === downloadedTrack.id);
                    const isPreviewActive = !downloadedTrack?.id && currentPreviewKey === `online-random-${result.id}`;
                    return (
                      <OnlineTrackListItem
                        key={`browse-random-${result.id}`}
                        track={result as OnlineTrackItemData}
                        isActive={isDownloadedTrackActive || isPreviewActive}
                        isPlaying={isPlaying}
                        canDownload
                        isDownloading={downloadLoadingId === result.id}
                        isDownloaded={Boolean(downloadedTrack?.id && !downloadedTrack.isPreviewOnly)}
                        emphasizeDownloaded
                        onDownload={() => downloadResult(result)}
                        onArtistClick={(artistName) => navigateWithBrowseContext(resolveArtistRoute(artistName, artists))}
                        onPlay={() => {
                          if (downloadedTrack?.id) {
                            playTrack(downloadedTrack.id, [downloadedTrack.id], null);
                            return;
                          }
                          if (result.previewUrl) {
                            const previewQueue = randomOnlineTracks
                              .filter((item) => Boolean(item.previewUrl))
                              .map((item) => ({
                                key: `online-random-${item.id}`,
                                url: item.previewUrl!,
                                title: item.title,
                                artist: item.artist,
                                artworkUrl: item.artworkUrl,
                              }));
                            playPreview(
                              {
                                key: `online-random-${result.id}`,
                                url: result.previewUrl,
                                title: result.title,
                                artist: result.artist,
                                artworkUrl: result.artworkUrl,
                              },
                              previewQueue
                            );
                          }
                        }}
                      />
                    );
                  })}
                  {!isRandomLoading && randomOnlineTracks.length === 0 && (
                    <div className="text-sm text-zinc-500 py-2">Не удалось загрузить рандомные треки.</div>
                  )}
                </div>
              </div>
            )}
            {visibleStandaloneTracks.length === 0 &&
              visibleAlbumGroups.length === 0 &&
              visiblePlaylistGroups.length === 0 &&
              favoriteArtistRows.length === 0 &&
              (!hasQuery || neMusicSearchResults.length === 0) && (
              <div className="text-center text-zinc-500 py-10">
                {searchQuery ? 'Нет результатов' : 'Нет треков.'}
              </div>
              )}
          </div>
          {hasQuery && (
            <div className="mt-6">
              <div className="text-sm font-medium text-slate-500 mb-2">Глобальный поиск</div>
              <div className="space-y-2">
                {neMusicError && (
                  <div className="text-sm text-rose-500 py-3">{neMusicError}</div>
                )}
                {orderedItunesResults.map((result, index) => (
                  (() => {
                    const downloadedTrackId = downloadedTrackIds[result.id];
                    const normalize = (value: string) => value.trim().toLowerCase();
                    const downloadedTrack = downloadedTrackId
                      ? tracks[downloadedTrackId]
                      : Object.values(tracks).find((track) => {
                          const trackArtistsText = toStringArray(track.artistIds).join(', ');
                          const artistMatched = hasTokenOverlap(trackArtistsText, result.artist);
                          const titleMatched =
                            hasTokenOverlap(track.title, result.title) ||
                            normalize(track.title).includes(normalize(result.title)) ||
                            normalize(result.title).includes(normalize(track.title));
                          return artistMatched && titleMatched;
                        });
                    const onlineLyrics = neLyricsByTrackId[result.id];
                    const resolvedLyrics = downloadedTrack?.lyrics || onlineLyrics;
                    const lyricsSnippet = getLyricsSnippet(resolvedLyrics, searchQuery);
                    const isDownloadedTrackActive = Boolean(downloadedTrack?.id && currentTrackId === downloadedTrack.id);
                    const isPreviewActive = !downloadedTrack?.id && currentPreviewKey === `online-${result.id}`;
                    const helperInsertIndex = Math.max(1, Math.floor(orderedItunesResults.length / 2));
                    return (
                      <React.Fragment key={result.id}>
                        <OnlineTrackListItem
                          track={result as OnlineTrackItemData}
                          title={<Highlight text={result.title} highlight={searchQuery} />}
                          subtitle={<Highlight text={result.artist} highlight={searchQuery} />}
                          extra={lyricsSnippet ? (
                            <div className="text-xs text-slate-500 truncate mt-0.5">
                              <span className="text-slate-400 mr-1">Lyrics:</span>
                              <Highlight text={lyricsSnippet.snippet} highlight={lyricsSnippet.highlight} />
                            </div>
                          ) : undefined}
                          isActive={isDownloadedTrackActive || isPreviewActive}
                          isPlaying={isPlaying}
                          canDownload
                          isDownloading={downloadLoadingId === result.id}
                          isDownloaded={Boolean(downloadedTrack?.id && !downloadedTrack.isPreviewOnly)}
                          onDownload={() => downloadResult(result)}
                          onArtistClick={(artistName) => navigate(resolveArtistRoute(artistName, artists))}
                          onPlay={() => playOnlineResult(result)}
                        />
                        {orderedItunesResults.length >= 4 && index + 1 === helperInsertIndex && (
                          <div className="w-full text-left flex items-center gap-3 p-2 rounded-3xl bg-violet-50/80 border border-violet-100">
                            <div className="w-12 h-12 bg-violet-100 rounded-[2px] overflow-hidden flex-shrink-0 relative flex items-center justify-center">
                              <Search className="w-5 h-5 text-violet-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate text-slate-700">Не нашли свой трек?</div>
                              <div className="text-sm text-slate-500 truncate">Листайте вниз к подробному поиску - там больше редких совпадений.</div>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })()
                ))}
                {hasQuery && !neMusicError && (isNeMusicLoading || orderedYoutubeResults.length > 0) && (
                  <div className="pt-3">
                    <div className="text-sm font-medium text-slate-500 mb-2">Подробный поиск</div>
                    {isNeMusicLoading ? (
                      <div className="text-sm text-zinc-500 py-2">Ищем подробнее...</div>
                    ) : orderedYoutubeResults.length > 0 ? (
                      orderedYoutubeResults.map((result) => (
                        (() => {
                          const downloadedTrackId = downloadedTrackIds[result.id];
                          const normalize = (value: string) => value.trim().toLowerCase();
                          const downloadedTrack = downloadedTrackId
                            ? tracks[downloadedTrackId]
                            : Object.values(tracks).find((track) => {
                                const trackArtistsText = toStringArray(track.artistIds).join(', ');
                                const artistMatched = hasTokenOverlap(trackArtistsText, result.artist);
                                const titleMatched =
                                  hasTokenOverlap(track.title, result.title) ||
                                  normalize(track.title).includes(normalize(result.title)) ||
                                  normalize(result.title).includes(normalize(track.title));
                                return artistMatched && titleMatched;
                              });
                          const onlineLyrics = neLyricsByTrackId[result.id];
                          const resolvedLyrics = downloadedTrack?.lyrics || onlineLyrics;
                          const lyricsSnippet = getLyricsSnippet(resolvedLyrics, searchQuery);
                          const isDownloadedTrackActive = Boolean(downloadedTrack?.id && currentTrackId === downloadedTrack.id);
                          const isPreviewActive = !downloadedTrack?.id && currentPreviewKey === `online-${result.id}`;
                          return (
                            <OnlineTrackListItem
                              key={result.id}
                              track={result as OnlineTrackItemData}
                              title={<Highlight text={result.title} highlight={searchQuery} />}
                              subtitle={<Highlight text={result.artist} highlight={searchQuery} />}
                              extra={lyricsSnippet ? (
                                <div className="text-xs text-slate-500 truncate mt-0.5">
                                  <span className="text-slate-400 mr-1">Lyrics:</span>
                                  <Highlight text={lyricsSnippet.snippet} highlight={lyricsSnippet.highlight} />
                                </div>
                              ) : (
                                <div className="text-xs text-slate-400 mt-0.5">YouTube</div>
                              )}
                              isActive={isDownloadedTrackActive || isPreviewActive}
                              isPlaying={isPlaying}
                              canDownload
                              isDownloading={downloadLoadingId === result.id}
                              isDownloaded={Boolean(downloadedTrack?.id && !downloadedTrack.isPreviewOnly)}
                              onDownload={() => downloadResult(result)}
                              onArtistClick={(artistName) => navigate(resolveArtistRoute(artistName, artists))}
                              onPlay={() => playOnlineResult(result)}
                            />
                          );
                        })()
                      ))
                    ) : null}
                  </div>
                )}
                {!isNeMusicLoading && !neMusicError && neMusicSearchResults.length === 0 && (
                  <div className="text-sm text-zinc-500 py-3">По вашему запросу NEmusic ничего не нашёл.</div>
                )}
              </div>
            </div>
          )}
      </div>

      {editingTrack && <EditTrackModal track={editingTrack} onClose={() => setEditingTrack(null)} />}
      {addingToPlaylistTrackId && <AddToPlaylistModal trackId={addingToPlaylistTrackId} onClose={() => setAddingToPlaylistTrackId(null)} />}
      {isUploadModalOpen && <UploadTrackModal onClose={() => setIsUploadModalOpen(false)} />}
      {notice && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[120] px-4 py-2 rounded-full bg-slate-900 text-white text-sm shadow-xl">
          {notice}
        </div>
      )}
    </div>
  );
}
