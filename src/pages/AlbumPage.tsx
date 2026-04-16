import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMockServer } from '../store/mockServer';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { Edit2, ArrowLeft, Play, Music, Upload, Search, Plus, Heart } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { getAudioFile, getImageFile, saveAudioFile, saveImageFile } from '../lib/db';
import { CachedImage } from '../components/CachedImage';
import { TrackListItem } from '../components/TrackListItem';
import { resolveArtistId, resolveArtistRoute } from '../lib/artistRouting';
import { OnlineTrackItemData, OnlineTrackListItem } from '../components/OnlineTrackListItem';
import { getAverageColor } from '../lib/colorExtractor';

export function AlbumPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const typeParam = searchParams.get('type') as 'playlist' | 'album' | null;
  const sourceParam = searchParams.get('source');
  const queryArtistId = searchParams.get('artistId');
  const autoDownloadFirst = searchParams.get('autodownload') === '1';
  const itunesVirtualIdMatch = (id || '').match(/^itunes-(\d+)$/);
  const isItunesVirtual = Boolean(itunesVirtualIdMatch) || sourceParam === 'itunes';
  const itunesCollectionId = itunesVirtualIdMatch?.[1] || null;
  
  const { playlists, albums, tracks, artists, addPlaylist, updatePlaylist, addAlbum, updateAlbum, addArtist, addTrack, updateTrack, users, updateUser } = useMockServer();
  const { playTrack, playPreview, togglePlay, currentTrackId, currentPreviewKey, isPlaying } = usePlayerStore();
  const { currentUserId } = useAuthStore();
  const handleBack = () => {
    const state = location.state as { fromBrowse?: boolean; browseReturnCtx?: unknown; fromArtist?: boolean; returnToArtist?: string } | null;
    if (state?.fromArtist && state.returnToArtist) {
      navigate(state.returnToArtist);
      return;
    }
    const stateCtx = state?.fromBrowse ? state.browseReturnCtx : null;
    let fallbackCtx: unknown = null;
    if (!stateCtx) {
      try {
        const raw = window.sessionStorage.getItem('browse-return-context-v1');
        if (raw) fallbackCtx = JSON.parse(raw);
      } catch {
        fallbackCtx = null;
      }
    }
    const restoreBrowseCtx = stateCtx || (state?.fromBrowse ? fallbackCtx : null);
    if (restoreBrowseCtx) {
      navigate('/browse', { state: { restoreBrowseCtx } });
      return;
    }
    navigate(-1);
  };
  
  const isNew = id === 'new';
  const playlistItem = isNew ? null : playlists[id || ''];
  const albumItem = isNew ? null : albums[id || ''];
  const item = albumItem || playlistItem;
  const isAlbum = isNew ? typeParam === 'album' : Boolean(albumItem);
  const album = isAlbum ? albumItem : null;
  const forcedArtistId = isAlbum && isNew && queryArtistId && artists[queryArtistId] ? queryArtistId : null;
  const isArtistLocked = Boolean(forcedArtistId);
  
  const currentUser = currentUserId ? users[currentUserId] : null;
  const isFavorite = isAlbum
    ? (currentUser?.favoriteAlbumIds?.includes(item?.id || '') || false)
    : (currentUser?.favoritePlaylistIds?.includes(item?.id || '') || false);

  const toggleFavorite = () => {
    if (!currentUser || !item) return;
    if (isAlbum) {
      const currentFavorites = currentUser.favoriteAlbumIds || [];
      const newFavorites = isFavorite
        ? currentFavorites.filter(fid => fid !== item.id)
        : [...currentFavorites, item.id];
      updateUser(currentUser.id, { favoriteAlbumIds: newFavorites });
      return;
    }
    const currentFavorites = currentUser.favoritePlaylistIds || [];
    const newFavorites = isFavorite
      ? currentFavorites.filter(fid => fid !== item.id)
      : [...currentFavorites, item.id];
    updateUser(currentUser.id, { favoritePlaylistIds: newFavorites });
  };
  
  const [isEditing, setIsEditing] = useState(isNew);
  const [title, setTitle] = useState(item?.title || '');
  const [status, setStatus] = useState(item?.status || '');
  const [description, setDescription] = useState(
    item && 'description' in item ? item.description || '' : ''
  );
  
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(item?.coverUrl || null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [artistName, setArtistName] = useState('');
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);
  const artistInputRef = useRef<HTMLDivElement>(null);
  const [resolvedDurations, setResolvedDurations] = useState<Record<string, number>>({});
  const [itunesTracks, setItunesTracks] = useState<OnlineTrackItemData[]>([]);
  const [itunesDescription, setItunesDescription] = useState('');
  const [itunesAlbumMeta, setItunesAlbumMeta] = useState<{ title: string; artistName: string; coverUrl?: string; status: string } | null>(null);
  const [isItunesLoading, setIsItunesLoading] = useState(false);
  const [itunesError, setItunesError] = useState<string | null>(null);
  const [itunesDownloadLoadingId, setItunesDownloadLoadingId] = useState<string | null>(null);
  const [hasAutoDownloadStarted, setHasAutoDownloadStarted] = useState(false);
  const [playlistTrackQuery, setPlaylistTrackQuery] = useState('');
  const [draftPlaylistTrackIds, setDraftPlaylistTrackIds] = useState<string[]>(
    isNew ? [] : (item?.trackIds || [])
  );
  const [playlistOnlineResults, setPlaylistOnlineResults] = useState<OnlineTrackItemData[]>([]);
  const [isPlaylistOnlineLoading, setIsPlaylistOnlineLoading] = useState(false);
  const [playlistOnlineError, setPlaylistOnlineError] = useState<string | null>(null);
  const [playlistAddLoadingIds, setPlaylistAddLoadingIds] = useState<Record<string, true>>({});
  const [playlistHeaderColor, setPlaylistHeaderColor] = useState<string | null>(null);

  useEffect(() => {
    const currentArtistId = album?.artistIds?.[0];
    if (currentArtistId && artists[currentArtistId]) {
      setArtistName(artists[currentArtistId].name);
    }
  }, [album, artists]);

  useEffect(() => {
    if (forcedArtistId && artists[forcedArtistId]) {
      setArtistName(artists[forcedArtistId].name);
    }
  }, [forcedArtistId, artists]);

  useEffect(() => {
  }, [id, isNew, isAlbum]);

  useEffect(() => {
    if (isNew) {
      setDraftPlaylistTrackIds([]);
      return;
    }
    if (!isAlbum && item?.trackIds) {
      setDraftPlaylistTrackIds(item.trackIds);
    }
  }, [isAlbum, isNew, item?.id]);

  useEffect(() => {
    if (!isEditing || isAlbum) {
      setPlaylistOnlineResults([]);
      setPlaylistOnlineError(null);
      setIsPlaylistOnlineLoading(false);
      return;
    }
    const query = playlistTrackQuery.trim();
    if (!query) {
      setPlaylistOnlineResults([]);
      setPlaylistOnlineError(null);
      setIsPlaylistOnlineLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsPlaylistOnlineLoading(true);
      setPlaylistOnlineError(null);
      try {
        const response = await fetch(
          `https://itunes.apple.com/search?entity=song&limit=25&term=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error(`iTunes search failed: ${response.status}`);
        const payload = await response.json() as {
          results?: Array<{
            trackId?: number;
            trackName?: string;
            artistName?: string;
            artworkUrl100?: string;
            artworkUrl600?: string;
            previewUrl?: string;
          }>;
        };
        const deduped = new Set<string>();
        const mapped: OnlineTrackItemData[] = (payload.results || [])
          .filter((item) => item.trackId && item.trackName && item.artistName)
          .map((item) => ({
            id: String(item.trackId),
            title: String(item.trackName),
            artist: String(item.artistName),
            previewUrl: item.previewUrl,
            artworkUrl: upscaleItunesArtwork(item.artworkUrl600 || item.artworkUrl100, 1200),
          }))
          .filter((item) => {
            if (deduped.has(item.id)) return false;
            deduped.add(item.id);
            return true;
          });
        setPlaylistOnlineResults(mapped);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setPlaylistOnlineResults([]);
        setPlaylistOnlineError('Не удалось выполнить онлайн-поиск треков.');
      } finally {
        setIsPlaylistOnlineLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isAlbum, isEditing, playlistTrackQuery]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      // #region agent log
      fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'78e223'},body:JSON.stringify({sessionId:'78e223',runId:'album-click-debug',hypothesisId:'H4',location:'pages/AlbumPage.tsx:global-error',message:'Window error captured',data:{message:event.message,filename:event.filename,lineno:event.lineno,colno:event.colno},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      // #region agent log
      fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'78e223'},body:JSON.stringify({sessionId:'78e223',runId:'album-click-debug',hypothesisId:'H4',location:'pages/AlbumPage.tsx:unhandled-rejection',message:'Unhandled rejection captured',data:{reason:String(event.reason)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  const upscaleItunesArtwork = (url?: string, size: number = 1200): string | undefined => {
    if (!url) return undefined;
    return url.replace(
      /\/\d{2,4}x\d{2,4}(?:bb)?\.(jpg|jpeg|png|webp)(\?.*)?$/i,
      `/${size}x${size}bb.$1$2`
    );
  };
  const trimBySentence = (text: string, maxLength: number): string => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
    let result = '';
    for (const sentence of sentences) {
      const candidate = result ? `${result} ${sentence}` : sentence;
      if (candidate.length > maxLength) break;
      result = candidate;
    }
    if (!result) {
      const fallback = normalized.slice(0, Math.max(maxLength - 3, 1)).trimEnd();
      return `${fallback}...`;
    }
    return `${result}...`;
  };

  useEffect(() => {
    if (!itunesCollectionId) return;
    const primeFromLocalAlbum = (localAlbum: NonNullable<typeof albumItem>) => {
      const localArtistName = localAlbum.artistIds?.[0] ? (artists[localAlbum.artistIds[0]]?.name || '') : '';
      const localAlbumTracks = (localAlbum.trackIds || []).map((trackId) => tracks[trackId]).filter(Boolean);
      setItunesAlbumMeta({
        title: localAlbum.title,
        artistName: localArtistName,
        coverUrl: localAlbum.coverUrl,
        status: localAlbum.status || 'Альбом',
      });
      setItunesTracks(
        localAlbumTracks.map((track) => ({
          id: track.id,
          title: track.title,
          artist: track.artistIds.join(', '),
          artworkUrl: track.coverUrl,
        }))
      );
    };
    if (isItunesVirtual) {
      const existingLocal = albums[`itunes-${itunesCollectionId}`];
      if (existingLocal) {
        if (id !== existingLocal.id) {
          navigate(`/album/${existingLocal.id}`, { replace: true });
          return;
        }
        if (albumItem && itunesTracks.length === 0) {
          primeFromLocalAlbum(albumItem);
        }
      }
      const existingLegacyLocal = Object.values(albums).find(
        (albumItem) =>
          albumItem.itunesCollectionId === itunesCollectionId ||
          albumItem.id === `itunes-album-${itunesCollectionId}`
      );
      if (existingLegacyLocal) {
        if (id !== existingLegacyLocal.id) {
          navigate(`/album/${existingLegacyLocal.id}`, { replace: true });
          return;
        }
        if (itunesTracks.length === 0) {
          primeFromLocalAlbum(existingLegacyLocal);
        }
      }
    } else if (albumItem) {
      primeFromLocalAlbum(albumItem);
    }

    const controller = new AbortController();
    const fetchWikiDescription = async (albumTitle: string, albumArtist: string): Promise<string> => {
      try {
        const queries = [
          `"${albumTitle}" "${albumArtist}" album`,
          `${albumTitle} ${albumArtist} album`,
          `${albumTitle} album`,
        ];
        const candidateTitles: string[] = [];
        for (const query of queries) {
          const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json&origin=*`;
          const searchResponse = await fetch(searchUrl, { signal: controller.signal });
          if (!searchResponse.ok) continue;
          const payload = await searchResponse.json() as { query?: { search?: Array<{ title?: string }> } };
          for (const result of payload.query?.search || []) {
            if (result.title && !candidateTitles.includes(result.title)) candidateTitles.push(result.title);
          }
        }

        let bestDescription = '';
        let bestScore = -1;
        const normalizedTitle = albumTitle.toLowerCase();
        const normalizedArtist = albumArtist.toLowerCase();
        for (const candidateTitle of candidateTitles.slice(0, 10)) {
          const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(candidateTitle)}`;
          const summaryResponse = await fetch(summaryUrl, { signal: controller.signal });
          if (!summaryResponse.ok) continue;
          const payload = await summaryResponse.json() as { title?: string; description?: string; extract?: string };
          const combined = `${payload.title || ''} ${payload.description || ''} ${payload.extract || ''}`.toLowerCase();
          if (combined.includes('disambiguation') || combined.includes('may refer to')) continue;
          const firstParagraph = (payload.extract || '').split('\n').map((part) => part.trim()).find(Boolean);
          if (!firstParagraph) continue;
          const score =
            (combined.includes(normalizedTitle) ? 4 : 0) +
            (combined.includes(normalizedArtist) ? 3 : 0) +
            (combined.includes('album') || combined.includes('ep') ? 2 : 0);
          if (score > bestScore) {
            bestScore = score;
            bestDescription = trimBySentence(firstParagraph, 320);
          }
        }
        return bestDescription;
      } catch {
        return '';
      }
    };

    const loadItunesAlbum = async () => {
      setIsItunesLoading(true);
      setItunesError(null);
      try {
        const response = await fetch(
          `https://itunes.apple.com/lookup?id=${encodeURIComponent(itunesCollectionId)}&entity=song&limit=200`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error('Failed to load iTunes album');
        const payload = await response.json() as {
          results?: Array<{
            wrapperType?: string;
            collectionId?: number;
            collectionName?: string;
            artistName?: string;
            trackId?: number;
            trackName?: string;
            previewUrl?: string;
            artworkUrl100?: string;
            artworkUrl600?: string;
            collectionType?: string;
          }>;
        };
        const collectionMeta = (payload.results || []).find((item) => item.wrapperType === 'collection');
        const trackItems = (payload.results || []).filter((item) => item.wrapperType === 'track' && item.trackId && item.trackName && item.artistName);
        const normalizedTracks: OnlineTrackItemData[] = trackItems.map((track) => ({
          id: String(track.trackId),
          title: String(track.trackName),
          artist: String(track.artistName),
          previewUrl: track.previewUrl,
          artworkUrl: upscaleItunesArtwork(track.artworkUrl600 || track.artworkUrl100, 1200),
        }));
        const titleValue = String(collectionMeta?.collectionName || 'Альбом');
        const artistValue = String(collectionMeta?.artistName || '');
        setItunesAlbumMeta({
          title: titleValue,
          artistName: artistValue,
          coverUrl: upscaleItunesArtwork(collectionMeta?.artworkUrl600 || collectionMeta?.artworkUrl100, 1200),
          status: (collectionMeta?.collectionType || '').toLowerCase().includes('ep') ? 'EP' : 'Альбом',
        });
        setItunesTracks(normalizedTracks);
        const wiki = await fetchWikiDescription(titleValue, artistValue);
        setItunesDescription(wiki);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        if (isItunesVirtual) {
          setItunesError('Не удалось загрузить альбом iTunes.');
        }
      } finally {
        setIsItunesLoading(false);
      }
    };

    void loadItunesAlbum();
    return () => controller.abort();
  }, [isItunesVirtual, itunesCollectionId, albums, navigate, albumItem, artists, tracks, itunesTracks.length]);

  const allArtists = Object.values(artists);
  const filteredArtists = allArtists.filter(a => 
    a.name.toLowerCase().includes(artistName.toLowerCase())
  );

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!currentUserId) return;

    let coverId = item?.coverUrl || '';
    if (coverFile) {
      coverId = uuidv4();
      await saveImageFile(coverId, coverFile);
    }

    let finalArtistId = forcedArtistId || album?.artistIds?.[0];
    if (!forcedArtistId && isAlbum && artistName) {
      const existingArtist = allArtists.find(a => a.name.toLowerCase() === artistName.toLowerCase());
      if (existingArtist) {
        finalArtistId = existingArtist.id;
      } else {
        const newArtistId = uuidv4();
        addArtist({
          id: newArtistId,
          name: artistName,
          description: '',
          ownerId: currentUserId
        });
        if (currentUser) {
          const favoriteArtistIds = currentUser.favoriteArtistIds || [];
          if (!favoriteArtistIds.includes(newArtistId)) {
            updateUser(currentUser.id, { favoriteArtistIds: [...favoriteArtistIds, newArtistId] });
          }
        }
        finalArtistId = newArtistId;
      }
    }

    if (isNew) {
      const newId = uuidv4();
      if (isAlbum) {
        addAlbum({
          id: newId,
          title,
          coverUrl: coverId || undefined,
          description: description.trim() || undefined,
          status,
          ownerId: currentUserId,
          trackIds: [],
          type: 'album',
          artistIds: finalArtistId ? [finalArtistId] : []
        });
      } else {
        addPlaylist({
          id: newId,
          title,
          coverUrl: coverId || undefined,
          description: description.trim() || undefined,
          ownerId: currentUserId,
          trackIds: draftPlaylistTrackIds,
          type: 'playlist'
        });
      }
      if (currentUser) {
        if (isAlbum) {
          const favoriteAlbumIds = currentUser.favoriteAlbumIds || [];
          if (!favoriteAlbumIds.includes(newId)) {
            updateUser(currentUser.id, { favoriteAlbumIds: [...favoriteAlbumIds, newId] });
          }
        } else {
          const favoritePlaylistIds = currentUser.favoritePlaylistIds || [];
          if (!favoritePlaylistIds.includes(newId)) {
            updateUser(currentUser.id, { favoritePlaylistIds: [...favoritePlaylistIds, newId] });
          }
        }
      }
      navigate(`/playlist/${newId}`, { replace: true });
    } else if (item) {
      if (isAlbum) {
        updateAlbum(item.id, {
          title,
          coverUrl: coverId || undefined,
          description: description.trim() || undefined,
          status,
          artistIds: finalArtistId ? [finalArtistId] : []
        });
      } else {
        updatePlaylist(item.id, {
          title,
          coverUrl: coverId || undefined,
          description: description.trim() || undefined,
          trackIds: draftPlaylistTrackIds
        });
      }
    }
    setIsEditing(false);
  };

  const splitArtistNames = (value: string): string[] =>
    value
      .split(/\s*(?:,|&| x | X | and |;)\s*/g)
      .map((part) => part.trim())
      .filter(Boolean);
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
  const normalizeAlbumTitle = (value: string): string =>
    value
      .toLowerCase()
      .replace(/\((deluxe|expanded|remaster(?:ed)?|edition|bonus|version|explicit|clean)[^)]*\)/gi, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9а-яё]+/gi, ' ')
      .trim();
  const findLocalTrackByOnline = (onlineTrack: OnlineTrackItemData) => {
    const normalize = (value: string) => value.trim().toLowerCase();
    return Object.values(tracks).find((track) => {
      if (normalize(track.title) !== normalize(onlineTrack.title)) return false;
      const onlineArtists = splitArtistNames(onlineTrack.artist).map(normalize);
      return onlineArtists.some((onlineArtist) =>
        track.artistIds.some((artistRef) => normalize(artistRef) === onlineArtist)
      );
    });
  };
  const persistItunesTrack = async (track: OnlineTrackItemData): Promise<string> => {
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `${track.artist} - ${track.title}`,
        title: track.title,
        artist: track.artist,
        artworkUrl: track.artworkUrl || '',
      }),
    });
    if (!response.ok) throw new Error('Download request failed');
    const blob = await response.blob();
    const targetTrackId = `downloaded-${Date.now()}-${track.id}`;
    await saveAudioFile(targetTrackId, blob);
    const blobUrl = URL.createObjectURL(blob);
    const headerFilename = extractFilenameFromDisposition(response.headers.get('content-disposition'));
    const fallbackFilename = `${sanitizeDownloadFilename(`${track.artist} - ${track.title}`) || 'track'}-processed.mp3`;
    const downloadFilename = sanitizeDownloadFilename(headerFilename || fallbackFilename) || 'download.mp3';
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = downloadFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

    let coverId: string | undefined;
    if (track.artworkUrl) {
      try {
        const coverResponse = await fetch(track.artworkUrl);
        if (coverResponse.ok) {
          coverId = `cover-${targetTrackId}`;
          await saveImageFile(coverId, await coverResponse.blob());
        }
      } catch {
        // Ignore cover download failures
      }
    }
    const duration = await getAudioDurationFromBlob(blob);
    addTrack({
      id: targetTrackId,
      title: track.title.trim() || 'Unknown title',
      artistIds: splitArtistNames(track.artist),
      duration,
      isExplicit: false,
      isSingle: true,
      format: 'mp3',
      coverUrl: coverId,
      ownerId: currentUserId || 'system',
    });
    return targetTrackId;
  };
  const addOnlineTrackToDraftPlaylist = async (track: OnlineTrackItemData) => {
    setPlaylistAddLoadingIds((prev) => ({ ...prev, [track.id]: true }));
    try {
      const existingLocal = findLocalTrackByOnline(track);
      const trackId = existingLocal?.id || await persistItunesTrack(track);
      addTrackToDraftPlaylist(trackId);
    } catch (error) {
      setPlaylistOnlineError((error as Error).message || 'Не удалось добавить трек в плейлист.');
    } finally {
      setPlaylistAddLoadingIds((prev) => {
        const next = { ...prev };
        delete next[track.id];
        return next;
      });
    }
  };
  const downloadItunesAlbumTrack = async (track: OnlineTrackItemData, options?: { ensureAlbum?: boolean }) => {
    if (!itunesCollectionId || !itunesAlbumMeta) return;
    const ensureAlbum = options?.ensureAlbum ?? false;
    setItunesDownloadLoadingId(track.id);
    try {
      const existingLocalByExactId = albums[`itunes-${itunesCollectionId}`];
      const existingByNormalized = Object.values(albums).find((candidate) => {
        if (candidate.itunesCollectionId && candidate.itunesCollectionId === itunesCollectionId) return true;
        const sameTitle = normalizeAlbumTitle(candidate.title) === normalizeAlbumTitle(itunesAlbumMeta.title);
        const artistId = candidate.artistIds?.[0];
        const artistName = artistId ? artists[artistId]?.name : '';
        return sameTitle && artistName?.toLowerCase() === itunesAlbumMeta.artistName.toLowerCase();
      });
      const persistedAlbum = existingLocalByExactId || existingByNormalized;
      const persistedTrackId = await persistItunesTrack(track);
      const albumId = persistedAlbum?.id || `itunes-${itunesCollectionId}`;
      if (!persistedAlbum && ensureAlbum) {
        let artistId = queryArtistId && artists[queryArtistId] ? queryArtistId : undefined;
        if (!artistId) {
          const existingArtist = Object.values(artists).find((artistItem) => artistItem.name.toLowerCase() === itunesAlbumMeta.artistName.toLowerCase());
          artistId = existingArtist?.id;
        }
        addAlbum({
          id: albumId,
          title: itunesAlbumMeta.title,
          ownerId: currentUserId || 'system',
          coverUrl: itunesAlbumMeta.coverUrl,
          trackIds: [persistedTrackId],
          sourceTrackCount: itunesTracks.length || undefined,
          itunesCollectionId,
          type: 'album',
          artistIds: artistId ? [artistId] : [],
          description: itunesDescription || undefined,
          status: itunesAlbumMeta.status,
        });
      } else if (persistedAlbum) {
        updateAlbum(albumId, {
          trackIds: Array.from(new Set([...(persistedAlbum.trackIds || []), persistedTrackId])),
          sourceTrackCount: persistedAlbum.sourceTrackCount || itunesTracks.length || undefined,
          itunesCollectionId: persistedAlbum.itunesCollectionId || itunesCollectionId,
          description: persistedAlbum.description || itunesDescription || undefined,
          coverUrl: persistedAlbum.coverUrl || itunesAlbumMeta.coverUrl,
        });
      }
      if (persistedAlbum || ensureAlbum) {
        updateTrack(persistedTrackId, { albumId });
        navigate(`/album/${albumId}`, { replace: true });
      }
    } finally {
      setItunesDownloadLoadingId(null);
    }
  };

  useEffect(() => {
    if (!isItunesVirtual || !autoDownloadFirst || hasAutoDownloadStarted) return;
    if (itunesTracks.length === 0 || isItunesLoading || Boolean(itunesError)) return;
    const firstTrack = itunesTracks[0];
    if (!firstTrack) return;
    setHasAutoDownloadStarted(true);
    void downloadItunesAlbumTrack(firstTrack, { ensureAlbum: true });
  }, [isItunesVirtual, autoDownloadFirst, hasAutoDownloadStarted, itunesTracks, isItunesLoading, itunesError]);

  const linkedLocalItunesAlbum = itunesCollectionId
    ? (albums[`itunes-${itunesCollectionId}`] || Object.values(albums).find((candidate) => candidate.itunesCollectionId === itunesCollectionId))
    : null;
  const downloadedItunesTracksCount = itunesTracks.reduce((sum, track) => {
    return sum + (findLocalTrackByOnline(track) ? 1 : 0);
  }, 0);
  const matchedLocalTrackIds = Array.from(
    new Set(
      itunesTracks
        .map((track) => findLocalTrackByOnline(track)?.id)
        .filter((trackId): trackId is string => Boolean(trackId))
    )
  );

  useEffect(() => {
    if (!linkedLocalItunesAlbum || itunesTracks.length === 0) return;
    const expectedTotalTracks = itunesTracks.length;
    const nextTrackIds = matchedLocalTrackIds;
    const currentTrackIdsSorted = [...(linkedLocalItunesAlbum.trackIds || [])].sort();
    const nextTrackIdsSorted = [...nextTrackIds].sort();
    const hasTrackIdsDiff =
      currentTrackIdsSorted.length !== nextTrackIdsSorted.length ||
      currentTrackIdsSorted.some((id, index) => id !== nextTrackIdsSorted[index]);
    const hasTotalDiff = (linkedLocalItunesAlbum.sourceTrackCount || 0) !== expectedTotalTracks;
    if (!hasTrackIdsDiff && !hasTotalDiff) return;
    updateAlbum(linkedLocalItunesAlbum.id, {
      trackIds: nextTrackIds,
      sourceTrackCount: expectedTotalTracks,
      itunesCollectionId: linkedLocalItunesAlbum.itunesCollectionId || itunesCollectionId || undefined,
    });
  }, [linkedLocalItunesAlbum, itunesTracks, matchedLocalTrackIds, updateAlbum, itunesCollectionId]);

  const itemTracks = isNew
    ? []
    : Object.values(tracks).filter(t => item?.trackIds.includes(t.id) || (isAlbum && t.albumId === item?.id));
  const draftPlaylistTracks = draftPlaylistTrackIds
    .map((trackId) => tracks[trackId])
    .filter(Boolean);
  const normalizedPlaylistQuery = playlistTrackQuery.trim().toLowerCase();
  const localPlaylistCandidates = Object.values(tracks).filter((track) => {
    if (draftPlaylistTrackIds.includes(track.id)) return false;
    if (!normalizedPlaylistQuery) return true;
    const haystack = `${track.title} ${track.artistIds.join(' ')} ${(track.features || []).join(' ')}`.toLowerCase();
    return haystack.includes(normalizedPlaylistQuery);
  });
  const isAlbumQueueActive = Boolean(currentTrackId && itemTracks.some((track) => track.id === currentTrackId));
  const itemDescription = item && 'description' in item ? (item.description || '').trim() : '';
  useEffect(() => {
    if (isAlbum || isNew || itemTracks.length === 0) {
      setPlaylistHeaderColor(null);
      return;
    }
    const firstTrackCoverId = itemTracks[0]?.coverUrl;
    if (!firstTrackCoverId) {
      setPlaylistHeaderColor(null);
      return;
    }
    let objectUrl: string | null = null;
    let active = true;
    getImageFile(firstTrackCoverId)
      .then((blob) => {
        if (!active || !blob) return null;
        objectUrl = URL.createObjectURL(blob);
        return getAverageColor(objectUrl);
      })
      .then((avgColor) => {
        if (!active) return;
        setPlaylistHeaderColor(avgColor || null);
      })
      .catch(() => {
        if (active) setPlaylistHeaderColor(null);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isAlbum, isNew, itemTracks]);
  const addTrackToDraftPlaylist = (trackId: string) => {
    setDraftPlaylistTrackIds((prev) => (prev.includes(trackId) ? prev : [...prev, trackId]));
  };
  const removeTrackFromDraftPlaylist = (trackId: string) => {
    setDraftPlaylistTrackIds((prev) => prev.filter((id) => id !== trackId));
  };
  useEffect(() => {
    let cancelled = false;

    const loadMissingDurations = async () => {
      try {
        const missingTracks = itemTracks.filter((track) => {
          const hasTrackDuration = typeof (track as { duration?: number }).duration === 'number' && (track as { duration?: number }).duration! > 0;
          const hasResolvedDuration = typeof resolvedDurations[track.id] === 'number' && resolvedDurations[track.id] > 0;
          return !hasTrackDuration && !hasResolvedDuration;
        });
        if (missingTracks.length === 0) return;

        const updates: Record<string, number> = {};
        await Promise.all(
          missingTracks.map(async (track) => {
            try {
              const blob = await getAudioFile(track.id);
              if (!blob) return;
              const objectUrl = URL.createObjectURL(blob);
              try {
                const duration = await new Promise<number>((resolve) => {
                  const audio = document.createElement('audio');
                  audio.preload = 'metadata';
                  audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
                  audio.onerror = () => resolve(0);
                  audio.src = objectUrl;
                });
                if (duration > 0) updates[track.id] = duration;
              } finally {
                URL.revokeObjectURL(objectUrl);
              }
            } catch {
              // Keep UI stable even if metadata extraction fails.
            }
          })
        );

        if (!cancelled && Object.keys(updates).length > 0) {
          setResolvedDurations((prev) => ({ ...prev, ...updates }));
          Object.entries(updates).forEach(([trackId, duration]) => {
            updateTrack(trackId, { duration });
          });
        }
      } catch {
        // Defensive guard against runtime crash.
      }
    };

    loadMissingDurations();
    return () => {
      cancelled = true;
    };
  }, [itemTracks, resolvedDurations, updateTrack]);
  const totalDurationSec = itemTracks.reduce((sum, track) => {
    const duration = (track as { duration?: number }).duration ?? resolvedDurations[track.id];
    return sum + (typeof duration === 'number' && duration > 0 ? duration : 0);
  }, 0);
  const formatTotalDuration = (seconds: number) => {
    if (seconds <= 0) return '--:--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  const handleAlbumPlayToggle = () => {
    if (isAlbumQueueActive) {
      togglePlay();
      return;
    }
    if (itemTracks.length > 0) {
      playTrack(itemTracks[0].id, itemTracks.map(t => t.id), isAlbum ? item.id : null);
    }
  };
  const headerBackgroundStyle = {
    background: `linear-gradient(to bottom, ${(!isAlbum && playlistHeaderColor) ? playlistHeaderColor : 'var(--accent-color)'} 0%, ${(!isAlbum && playlistHeaderColor) ? playlistHeaderColor : 'var(--accent-color)'} 52%, rgb(2 6 23) 100%)`,
  };

  if (itunesCollectionId) {
    return (
      <div className="pb-10 h-full overflow-y-auto scrollbar-hide">
        <div
          className="relative pt-4 pb-8 px-4 text-white overflow-hidden"
          style={{ background: 'linear-gradient(to bottom, var(--accent-color) 0%, var(--accent-color) 52%, rgb(2 6 23) 100%)' }}
        >
          <button
            onClick={handleBack}
            className="absolute top-9 right-4 p-1 text-white z-20"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="mt-3 flex gap-4 items-end z-10">
            <div className="w-40 h-40 sm:w-44 sm:h-44 bg-violet-100 rounded-md shadow-2xl shadow-black/40 overflow-hidden relative flex-shrink-0">
              {itunesAlbumMeta?.coverUrl ? (
                <CachedImage src={itunesAlbumMeta.coverUrl} alt={itunesAlbumMeta.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full animate-pulse bg-white/20" />
              )}
            </div>
            <div className="min-w-0 h-40 sm:h-44 pb-1 flex flex-col justify-end overflow-hidden">
              <div className="text-xs uppercase tracking-wider text-white/80 mb-1">{itunesAlbumMeta?.status || 'Альбом'}</div>
              <h1 className="font-extrabold leading-tight break-words line-clamp-3 text-[clamp(1.5rem,4.8vw,3rem)]">
                {itunesAlbumMeta?.artistName ? `${itunesAlbumMeta.artistName} - ` : ''}
                {itunesAlbumMeta?.title || 'Загрузка альбома...'}
              </h1>
              <div className="text-sm text-white/80 mt-2">
                {itunesTracks.length > 0 ? `${downloadedItunesTracksCount}/${itunesTracks.length} треков скачано` : 'Загружаем треки...'}
              </div>
            </div>
          </div>
          {itunesDescription && (
            <div className="text-white/75 text-sm mt-4 leading-relaxed max-w-xl">{itunesDescription}</div>
          )}
        </div>
        <div className="px-4 mt-3">
          {isItunesLoading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={`itunes-skeleton-${idx}`} className="h-16 rounded-2xl bg-slate-200/50 animate-pulse" />
              ))}
            </div>
          )}
          {itunesError && <div className="text-rose-500 py-4">{itunesError}</div>}
          {!isItunesLoading && !itunesError && (
            <div className="space-y-2">
              {itunesTracks.map((track) => {
                const localTrack = findLocalTrackByOnline(track);
                const isPreviewActive = !localTrack?.id && currentPreviewKey === `itunes-${itunesCollectionId}-${track.id}`;
                return (
                  <OnlineTrackListItem
                    key={`itunes-track-${track.id}`}
                    track={track}
                    isPlaying={isPlaying}
                    isActive={Boolean(localTrack?.id && localTrack.id === currentTrackId) || isPreviewActive}
                    canDownload
                    isDownloaded={Boolean(localTrack)}
                    isDownloading={itunesDownloadLoadingId === track.id}
                    onDownload={() => downloadItunesAlbumTrack(track, { ensureAlbum: false })}
                    onArtistClick={(artistName) => navigate(resolveArtistRoute(artistName, artists))}
                    onOpenRecommendations={() => {
                      if (localTrack?.id) {
                        navigate(`/radooga?mode=track&seed=${encodeURIComponent(localTrack.id)}`);
                      }
                    }}
                    onPlay={() => {
                      if (localTrack?.id) {
                        playTrack(localTrack.id, itunesTracks.map((item) => findLocalTrackByOnline(item)?.id).filter(Boolean) as string[], null);
                        return;
                      }
                      if (track.previewUrl) {
                        const previewQueue = itunesTracks
                          .filter((item) => Boolean(item.previewUrl))
                          .map((item) => ({
                            key: `itunes-${itunesCollectionId}-${item.id}`,
                            url: item.previewUrl!,
                            title: item.title,
                            artist: item.artist,
                            artworkUrl: item.artworkUrl,
                          }));
                        playPreview(
                          {
                            key: `itunes-${itunesCollectionId}-${track.id}`,
                            url: track.previewUrl,
                            title: track.title,
                            artist: track.artist,
                            artworkUrl: track.artworkUrl,
                          },
                          previewQueue
                        );
                      }
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!isNew && !item) {
    return <div className="p-4 pt-8">Не найдено</div>;
  }

  return (
    <div className="pb-10 h-full overflow-y-auto scrollbar-hide">
      <div
        className="relative pt-4 pb-8 px-4 text-white overflow-hidden"
        style={headerBackgroundStyle}
      >
        <div className="absolute -top-16 -right-12 w-48 h-48 rounded-full bg-violet-300/25 blur-2xl pointer-events-none" />
        <div className="absolute top-28 -left-10 w-40 h-40 rounded-full bg-sky-300/25 blur-2xl pointer-events-none" />
        <div
          className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0))' }}
        />
        <button 
          onClick={handleBack}
          className="absolute top-9 right-4 p-1 text-white z-20"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        <div className="mt-3 flex gap-4 items-end z-10">
          <div className="w-40 h-40 sm:w-44 sm:h-44 bg-violet-100 rounded-md shadow-2xl shadow-black/40 overflow-hidden relative flex-shrink-0">
          {isEditing ? (
            <div 
              className="absolute inset-0 flex flex-col items-center justify-center bg-violet-500/45 z-10 p-4 cursor-pointer hover:bg-violet-500/55 transition-colors"
              onClick={() => coverInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={coverInputRef} 
                onChange={handleCoverChange} 
                accept="image/*" 
                className="hidden" 
              />
              <Upload className="w-8 h-8 text-white mb-2" />
              <span className="text-xs text-white font-medium text-center">Изменить обложку</span>
            </div>
          ) : null}
          {coverPreview ? (
            <CachedImage src={coverPreview} alt={title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-16 h-16 text-slate-400" />
            </div>
          )}
          </div>
          {!isEditing && (
            <div className="min-w-0 h-40 sm:h-44 pb-1 flex flex-col justify-end overflow-hidden">
              <div className="text-xs uppercase tracking-wider text-white/80 mb-1">{isAlbum ? (item?.status || 'Альбом') : 'ПЛЕЙЛИСТ'}</div>
              <h1 className="font-extrabold leading-tight break-words line-clamp-3 text-[clamp(1.5rem,4.8vw,3rem)]">
                {album?.artistIds?.[0] && artists[album.artistIds[0]] ? (
                  <button
                    onClick={() => navigate(`/artist/${album.artistIds[0]}`)}
                    className="hover:underline underline-offset-4"
                  >
                    {artists[album.artistIds[0]].name}
                  </button>
                ) : null}
                {album?.artistIds?.[0] && artists[album.artistIds[0]] ? ' - ' : ''}
                {item?.title}
              </h1>
              <div className="text-sm text-white/80 mt-2">
                {itemTracks.length} треков · {formatTotalDuration(totalDurationSec)}
              </div>
            </div>
          )}
        </div>

        {isEditing ? (
          isAlbum ? (
            <div className="w-full max-w-sm space-y-3 mt-4">
              <input 
                type="text" 
                value={title} 
                onChange={e => setTitle(e.target.value)}
                placeholder="Название"
                className="bg-white/90 text-2xl font-bold text-slate-700 px-4 py-2 rounded-xl border border-violet-100 w-full text-center"
                autoFocus
              />
              <div className="relative" ref={artistInputRef}>
                <input
                  type="text"
                  value={artistName}
                  onChange={e => {
                    if (isArtistLocked) return;
                    setArtistName(e.target.value);
                    setShowArtistDropdown(true);
                  }}
                  onFocus={() => {
                    if (!isArtistLocked) setShowArtistDropdown(true);
                  }}
                  placeholder="Имя артиста"
                  className="bg-white/90 text-slate-700 px-4 py-2 rounded-xl border border-violet-100 w-full text-center text-sm"
                  autoComplete="off"
                  readOnly={isArtistLocked}
                />
                {isArtistLocked && (
                  <div className="text-xs text-white/80 mt-1 text-center">Артист задан из карточки артиста и не изменяется</div>
                )}
                {!isArtistLocked && showArtistDropdown && artistName && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-violet-100 rounded-xl shadow-xl max-h-48 overflow-y-auto text-left">
                    {filteredArtists.map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setArtistName(a.name);
                          setShowArtistDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-violet-50 text-sm flex items-center gap-2"
                      >
                        <Search className="w-4 h-4 text-slate-400" />
                        {a.name}
                      </button>
                    ))}
                    {!filteredArtists.find(a => a.name.toLowerCase() === artistName.toLowerCase()) && (
                      <button
                        type="button"
                        onClick={() => setShowArtistDropdown(false)}
                        className="w-full text-left px-4 py-2 hover:bg-violet-50 text-sm text-violet-500 flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Создать артиста: <span className="font-bold text-slate-700">{artistName}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <input 
                type="text" 
                value={status} 
                onChange={e => setStatus(e.target.value)}
                placeholder="Статус (EP, Mixtape...)"
                className="bg-white/90 text-slate-400 px-4 py-2 rounded-xl border border-violet-100 w-full text-center text-sm"
              />
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Описание альбома"
                rows={4}
                className="bg-white/90 text-slate-600 px-4 py-3 rounded-xl border border-violet-100 w-full text-sm resize-none"
              />
              <button 
                onClick={handleSave}
                className="w-full bg-violet-500 text-white font-bold py-3 rounded-xl hover:bg-violet-600 transition-colors mt-4"
              >
                Сохранить
              </button>
            </div>
          ) : (
            <div className="w-full max-w-sm space-y-3 mt-4">
              <div className="bg-white/90 rounded-xl border border-violet-100 p-3 space-y-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Метаданные плейлиста</div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Название плейлиста"
                  className="w-full bg-white text-slate-700 px-4 py-2 rounded-xl border border-violet-100 text-center font-semibold"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Описание плейлиста"
                  rows={4}
                  className="w-full bg-white text-slate-600 px-4 py-3 rounded-xl border border-violet-100 resize-none text-sm"
                />
              </div>

              <div className="bg-white/90 rounded-xl border border-violet-100 p-3 space-y-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Уже добавлено</div>
                <div className="text-sm text-slate-600">{draftPlaylistTrackIds.length} треков в плейлисте</div>
                {draftPlaylistTracks.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {draftPlaylistTracks.map((track) => (
                      <div key={`draft-playlist-track-${track.id}`} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-violet-50 border border-violet-100/60">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{track.title}</div>
                          <div className="text-xs text-slate-500 truncate">{track.artistIds.join(', ')}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTrackFromDraftPlaylist(track.id)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-white border border-violet-100 hover:bg-violet-50"
                        >
                          Убрать
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Пока пусто.</div>
                )}
              </div>

              <div className="bg-white/90 rounded-xl border border-violet-100 p-3 space-y-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Добавить треки</div>
                <input
                  type="text"
                  value={playlistTrackQuery}
                  onChange={(e) => setPlaylistTrackQuery(e.target.value)}
                  placeholder="Поиск по библиотеке и онлайн..."
                  className="w-full bg-white text-slate-700 px-4 py-2.5 rounded-xl border border-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-200"
                />

                <div className="text-sm font-medium text-slate-700">Из библиотеки</div>
                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {localPlaylistCandidates.slice(0, 8).map((track) => (
                    <div key={`local-playlist-candidate-${track.id}`} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-violet-100">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{track.title}</div>
                        <div className="text-xs text-slate-500 truncate">{track.artistIds.join(', ')}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => addTrackToDraftPlaylist(track.id)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-violet-500 text-white hover:bg-violet-600"
                      >
                        Добавить
                      </button>
                    </div>
                  ))}
                </div>

                <div className="text-sm font-medium text-slate-700">Онлайн</div>
                {isPlaylistOnlineLoading && <div className="text-xs text-slate-500">Ищем онлайн...</div>}
                {playlistOnlineError && <div className="text-xs text-rose-500">{playlistOnlineError}</div>}
                {!isPlaylistOnlineLoading && playlistOnlineResults.length > 0 && (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {playlistOnlineResults.slice(0, 10).map((onlineTrack) => {
                      const localMatch = findLocalTrackByOnline(onlineTrack);
                      const isAlreadyAdded = Boolean(localMatch?.id && draftPlaylistTrackIds.includes(localMatch.id));
                      return (
                        <OnlineTrackListItem
                          key={`playlist-online-${onlineTrack.id}`}
                          track={onlineTrack}
                          isActive={Boolean(localMatch?.id && currentTrackId === localMatch.id)}
                          isPlaying={isPlaying}
                          canDownload
                          isDownloading={Boolean(playlistAddLoadingIds[onlineTrack.id])}
                          isDownloaded={isAlreadyAdded}
                          onDownload={() => addOnlineTrackToDraftPlaylist(onlineTrack)}
                          onArtistClick={(artistRef) => navigate(resolveArtistRoute(artistRef, artists))}
                          onOpenRecommendations={() => {
                            if (localMatch?.id) {
                              navigate(`/radooga?mode=track&seed=${encodeURIComponent(localMatch.id)}`);
                            }
                          }}
                          onPlay={() => {
                            if (localMatch?.id) {
                              playTrack(localMatch.id, draftPlaylistTrackIds, null);
                              return;
                            }
                            if (onlineTrack.previewUrl) {
                              const previewQueue = playlistOnlineResults
                                .filter((item) => Boolean(item.previewUrl))
                                .map((item) => ({
                                  key: `playlist-online-${item.id}`,
                                  url: item.previewUrl!,
                                  title: item.title,
                                  artist: item.artist,
                                  artworkUrl: item.artworkUrl,
                                }));
                              playPreview(
                                {
                                  key: `playlist-online-${onlineTrack.id}`,
                                  url: onlineTrack.previewUrl,
                                  title: onlineTrack.title,
                                  artist: onlineTrack.artist,
                                  artworkUrl: onlineTrack.artworkUrl,
                                },
                                previewQueue
                              );
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                onClick={handleSave}
                className="w-full bg-violet-500 text-white font-bold py-3 rounded-xl hover:bg-violet-600 transition-colors mt-1"
              >
                Сохранить
              </button>
            </div>
          )
        ) : (
          <div className="w-full mt-5 z-10">
            <div className="flex items-center gap-3 flex-wrap">
              {!isNew && (
                <button
                  onClick={handleAlbumPlayToggle}
                  className="h-14 w-14 rounded-full flex items-center justify-center text-black shadow-lg shadow-black/35 hover:scale-[1.02] transition-transform"
                  style={{ backgroundColor: 'var(--accent-color)' }}
                >
                  {isAlbumQueueActive && isPlaying ? (
                    <div className="w-6 h-6 flex items-center justify-center">
                      <span className="w-1.5 h-5 bg-white rounded-sm" />
                      <span className="w-1.5 h-5 bg-white rounded-sm ml-1.5" />
                    </div>
                  ) : (
                    <Play className="w-6 h-6 fill-current ml-0.5 text-white" />
                  )}
                </button>
              )}
              <button
                onClick={toggleFavorite}
                className={`h-11 w-11 rounded-full text-white transition-colors ${isAlbum ? 'bg-white/15 border border-white/20 hover:bg-white/25' : 'bg-transparent border-transparent hover:bg-transparent'}`}
                style={isFavorite ? { color: '#fda4af' } : undefined}
              >
                <Heart className={`w-5 h-5 mx-auto ${isFavorite ? 'fill-current' : ''}`} />
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className={`h-11 w-11 rounded-full text-white transition-colors ${isAlbum ? 'bg-white/15 border border-white/20 hover:bg-white/25' : 'bg-transparent border-transparent hover:bg-transparent'}`}
              >
                <Edit2 className="w-5 h-5 mx-auto" />
              </button>
            </div>
            {itemDescription && (
              <div className="text-white/75 text-sm mt-4 leading-relaxed max-w-xl">
                {itemDescription}
              </div>
            )}
          </div>
        )}
      </div>

      {!isNew && !isEditing && (
        <div className="px-4 mt-3">
          <div className="space-y-1">
            {itemTracks.map((track, index) => (
              <div key={track.id} className="flex items-center gap-2">
                <div className="w-6 text-center text-slate-400 text-sm">{index + 1}</div>
                <div className="flex-1">
                  <TrackListItem
                    track={track}
                    user={currentUser}
                    isPlaying={isPlaying}
                    isActive={currentTrackId === track.id}
                    searchQuery=""
                    onPlay={() => {
                      // #region agent log
                      fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'78e223'},body:JSON.stringify({sessionId:'78e223',runId:'album-click-debug',hypothesisId:'H1',location:'pages/AlbumPage.tsx:track-onPlay:before',message:'Track row clicked in album',data:{albumId:item?.id ?? null,trackId:track.id,queueLength:itemTracks.length,isAlbum,currentTrackIdBefore:currentTrackId,isPlayingBefore:isPlaying},timestamp:Date.now()})}).catch(()=>{});
                      // #endregion
                      playTrack(track.id, itemTracks.map(t => t.id), isAlbum ? item?.id || null : null);
                      // #region agent log
                      fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'78e223'},body:JSON.stringify({sessionId:'78e223',runId:'album-click-debug',hypothesisId:'H1',location:'pages/AlbumPage.tsx:track-onPlay:after',message:'playTrack dispatched from album row',data:{albumId:item?.id ?? null,trackId:track.id},timestamp:Date.now()})}).catch(()=>{});
                      // #endregion
                    }}
                    onArtistClick={(artistRef) => navigate(resolveArtistRoute(artistRef, artists))}
                    onToggleFavorite={() => {
                      if (!currentUser) return;
                      const favoriteTrackIds = currentUser.favoriteTrackIds || [];
                      const nextFavorites = favoriteTrackIds.includes(track.id)
                        ? favoriteTrackIds.filter((id) => id !== track.id)
                        : [...favoriteTrackIds, track.id];
                      updateUser(currentUser.id, { favoriteTrackIds: nextFavorites });
                    }}
                    onAddToPlaylist={() => {}}
                    onAddToAlbum={() => {}}
                    onOpenRecommendations={() => navigate(`/radooga?mode=track&seed=${encodeURIComponent(track.id)}`)}
                    onEdit={() => {}}
                    showMenu={false}
                  />
                </div>
              </div>
            ))}
            
            {itemTracks.length === 0 && (
              <div className="text-center text-slate-400 py-10">
                Нет треков
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
