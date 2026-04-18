import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMockServer, Album, Artist } from '../store/mockServer';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { Check, Download, Edit2, ArrowLeft, Plus, Music, Link as LinkIcon, Upload, Heart, MoreVertical } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { LinkToArtistModal } from '../components/LinkToArtistModal';
import { deleteAudioFile, deleteImageFile, saveAudioFile, saveImageFile } from '../lib/db';
import { CachedImage } from '../components/CachedImage';
import { TrackListItem } from '../components/TrackListItem';
import { CollectionCard } from '../components/CollectionCard';
import {
  extractFeaturingArtists,
  normalizeArtistName,
  resolveArtistId,
  resolveArtistRoute,
  splitArtistField,
  splitArtistNames,
} from '../lib/artistRouting';
import { OnlineTrackItemData, OnlineTrackListItem } from '../components/OnlineTrackListItem';
import { toStringArray } from '../lib/safe';
import {
  getDownloadedAlbumTrackCount,
  resolveAlbumCollectionId,
  resolveAlbumTotalTracks,
} from '../lib/albumCounters';
import { popNavigationEntry, pushNavigationEntry } from '../lib/navigationHistory';
import { isPlaceholderArtistDescription, resolveArtistDescriptionRu } from '../lib/wikiDescriptions';
import { ensureArtistBannerFromTrackCover } from '../lib/artistBannerCache';
import { apiUrl } from '../lib/apiUrl';
import { upsertPreviewOnlyTrack } from '../lib/previewFallback';

export function ArtistPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const sourceParam = searchParams.get('source');
  const queryName = searchParams.get('name');
  const isVirtualArtist = Boolean(id?.startsWith('itunes-')) || sourceParam === 'itunes';
  const { artists, updateArtist, addArtist, tracks, albums, users, updateUser, addTrack, updateTrack, updateAlbum } = useMockServer();
  const { playTrack, playPreview, currentTrackId, currentPreviewKey, isPlaying } = usePlayerStore();
  const { currentUserId } = useAuthStore();
  const getArtistBackState = () => {
    const state = (location.state || {}) as Record<string, unknown>;
    return {
      ...(state.fromBrowse ? { fromBrowse: true, browseReturnCtx: state.browseReturnCtx } : {}),
      restorePageScrollTop: window.scrollY || 0,
    };
  };
  const handleBack = () => {
    const stacked = popNavigationEntry(`${location.pathname}${location.search}`);
    if (stacked) {
      // #region agent log
      fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf06a6'},body:JSON.stringify({sessionId:'bf06a6',runId:'run2',hypothesisId:'H7',location:'src/pages/ArtistPage.tsx:53',message:'artist handleBack uses stacked path',data:{currentPath:`${location.pathname}${location.search}`,targetPath:stacked.path,hasState:Boolean(stacked.state)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      navigate(stacked.path, { replace: true, state: stacked.state });
      return;
    }
    const state = location.state as { fromBrowse?: boolean; browseReturnCtx?: unknown } | null;
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
      // #region agent log
      fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf06a6'},body:JSON.stringify({sessionId:'bf06a6',runId:'run2',hypothesisId:'H7',location:'src/pages/ArtistPage.tsx:69',message:'artist handleBack uses browse context',data:{currentPath:`${location.pathname}${location.search}`},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      navigate('/browse', { state: { restoreBrowseCtx } });
      return;
    }
    // #region agent log
    fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf06a6'},body:JSON.stringify({sessionId:'bf06a6',runId:'run2',hypothesisId:'H7',location:'src/pages/ArtistPage.tsx:73',message:'artist handleBack uses navigate -1',data:{currentPath:`${location.pathname}${location.search}`},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    navigate(-1);
  };
  
  const isNew = id === 'new';
  const artist = isNew || isVirtualArtist ? null : artists[id || ''];
  
  const currentUser = currentUserId ? users[currentUserId] : null;
  
  const [isEditing, setIsEditing] = useState(isNew);
  const [name, setName] = useState(artist?.name || '');
  const [description, setDescription] = useState(artist?.description || '');
  
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(artist?.bannerUrl || null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [isLinking, setIsLinking] = useState(false);
  const [virtualArtistName, setVirtualArtistName] = useState(queryName || '');
  const [virtualArtistDescription, setVirtualArtistDescription] = useState('');
  const [virtualArtistBanner, setVirtualArtistBanner] = useState<string | null>(null);
  const [isVirtualArtistLoading, setIsVirtualArtistLoading] = useState(false);
  const [virtualArtistError, setVirtualArtistError] = useState<string | null>(null);
  const [onlineArtistDescription, setOnlineArtistDescription] = useState('');
  const [onlineArtistBanner, setOnlineArtistBanner] = useState<string | null>(null);
  const [albumActionMenuId, setAlbumActionMenuId] = useState<string | null>(null);
  const [popularTracks, setPopularTracks] = useState<OnlineTrackItemData[]>([]);
  const [isPopularTracksExpanded, setIsPopularTracksExpanded] = useState(false);
  const [isPopularTracksLoading, setIsPopularTracksLoading] = useState(false);
  const [popularTracksError, setPopularTracksError] = useState<string | null>(null);
  const [onlineAlbums, setOnlineAlbums] = useState<Array<{
    id: string;
    title: string;
    artist: string;
    coverUrl?: string;
    trackCount: number;
    releaseYear?: string;
    status: 'album' | 'ep';
  }>>([]);
  const [isAlbumsLoading, setIsAlbumsLoading] = useState(false);
  const [albumsError, setAlbumsError] = useState<string | null>(null);
  const [downloadLoadingId, setDownloadLoadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [itunesTrackCountByCollectionId, setItunesTrackCountByCollectionId] = useState<Record<string, number>>({});
  const upscaleItunesArtwork = (url?: string, size: number = 1200): string | undefined => {
    if (!url) return undefined;
    return url.replace(
      /\/\d{2,4}x\d{2,4}(?:bb)?\.(jpg|jpeg|png|webp)(\?.*)?$/i,
      `/${size}x${size}bb.$1$2`
    );
  };
  const normalizeAlbumTitle = (value: string): string =>
    value
      .toLowerCase()
      .replace(/\((deluxe|expanded|remaster(?:ed)?|edition|bonus|version|explicit|clean)[^)]*\)/gi, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9а-яё]+/gi, ' ')
      .trim();

  useEffect(() => {
  }, [id, isNew]);
  useEffect(() => {
    const restoreTop = (location.state as { restorePageScrollTop?: number } | null)?.restorePageScrollTop;
    if (typeof restoreTop === 'number' && Number.isFinite(restoreTop)) {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: restoreTop });
      });
    }
  }, [location.state]);

  const displayArtistName = (isVirtualArtist ? virtualArtistName : artist?.name) || '';
  const favoriteArtistId =
    artist?.id ||
    Object.values(artists).find((item) => normalizeArtistName(item.name) === normalizeArtistName(displayArtistName))?.id ||
    null;
  const isFavorite = Boolean(favoriteArtistId && currentUser?.favoriteArtistIds?.includes(favoriteArtistId));
  const canToggleFavorite = Boolean(currentUser && displayArtistName.trim());
  const toggleFavorite = () => {
    if (!currentUser) return;
    let targetArtistId = favoriteArtistId;
    if (!targetArtistId) {
      const generatedArtistId = uuidv4();
      addArtist({
        id: generatedArtistId,
        name: displayArtistName.trim(),
        description: displayArtistDescription || '',
        bannerUrl: displayBannerPreview || undefined,
        ownerId: currentUser.id,
      });
      targetArtistId = generatedArtistId;
    }
    const currentFavorites = currentUser.favoriteArtistIds || [];
    const newFavorites = isFavorite
      ? currentFavorites.filter((fid) => fid !== targetArtistId)
      : [...currentFavorites, targetArtistId];
    updateUser(currentUser.id, { favoriteArtistIds: newFavorites });
  };
  const shouldIgnoreStoredDescription = !isVirtualArtist && isPlaceholderArtistDescription(artist?.description);
  const displayArtistDescription = isVirtualArtist
    ? (virtualArtistDescription || onlineArtistDescription)
    : ((shouldIgnoreStoredDescription ? '' : artist?.description) || onlineArtistDescription || '');
  const displayBannerPreview = isVirtualArtist
    ? (virtualArtistBanner || onlineArtistBanner)
    : (bannerPreview || onlineArtistBanner);

  useEffect(() => {
    if (!isVirtualArtist) return;
    const fallbackName = queryName?.trim() || decodeURIComponent((id || '').replace(/^itunes-/, '').replace(/-/g, ' ')).trim();
    if (!fallbackName) return;
    setVirtualArtistName(fallbackName);
    const localByName = Object.values(artists).find(
      (item) => normalizeArtistName(item.name) === normalizeArtistName(fallbackName)
    );
    if (localByName) {
      navigate(`/artist/${localByName.id}`, { replace: true });
      return;
    }

    const controller = new AbortController();
    const loadVirtualArtist = async () => {
      setIsVirtualArtistLoading(true);
      setVirtualArtistError(null);
      try {
        const artistSearchResponse = await fetch(
          `https://itunes.apple.com/search?entity=musicArtist&limit=1&term=${encodeURIComponent(fallbackName)}`,
          { signal: controller.signal }
        );
        if (!artistSearchResponse.ok) throw new Error('itunes search failed');
        const artistSearchPayload = await artistSearchResponse.json() as {
          results?: Array<{ artistName?: string; artistLinkUrl?: string; artistId?: number }>;
        };
        const matchedArtist = (artistSearchPayload.results || [])[0];
        if (matchedArtist?.artistName) setVirtualArtistName(String(matchedArtist.artistName));

        if (matchedArtist?.artistId) {
          const songsResponse = await fetch(
            `https://itunes.apple.com/lookup?id=${matchedArtist.artistId}&entity=song&limit=1`,
            { signal: controller.signal }
          );
          if (songsResponse.ok) {
            const songsPayload = await songsResponse.json() as {
              results?: Array<{ wrapperType?: string; artworkUrl100?: string; artworkUrl600?: string }>;
            };
            const firstSong = (songsPayload.results || []).find((item) => item.wrapperType === 'track');
            const bannerUrl = upscaleItunesArtwork(firstSong?.artworkUrl600 || firstSong?.artworkUrl100, 1200);
            if (bannerUrl) setVirtualArtistBanner(bannerUrl);
          }
        }

        const wikiProfile = await resolveArtistDescriptionRu(fallbackName);
        if (wikiProfile.description) setVirtualArtistDescription(wikiProfile.description);
        if (!virtualArtistBanner && wikiProfile.imageUrl) setVirtualArtistBanner(wikiProfile.imageUrl);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setVirtualArtistError('Не удалось загрузить данные артиста.');
      } finally {
        setIsVirtualArtistLoading(false);
      }
    };
    void loadVirtualArtist();
    return () => controller.abort();
  }, [isVirtualArtist, id, queryName, artists]);

  useEffect(() => {
    if (isNew || !displayArtistName.trim()) return;
    const controller = new AbortController();
    const loadArtistMeta = async () => {
      try {
        const artistSearchResponse = await fetch(
          `https://itunes.apple.com/search?entity=musicArtist&limit=1&term=${encodeURIComponent(displayArtistName.trim())}`,
          { signal: controller.signal }
        );
        if (!artistSearchResponse.ok) return;
        const artistSearchPayload = await artistSearchResponse.json() as {
          results?: Array<{ artistId?: number }>;
        };
        const matchedArtist = (artistSearchPayload.results || [])[0];
        if (matchedArtist?.artistId) {
          const songsResponse = await fetch(
            `https://itunes.apple.com/lookup?id=${matchedArtist.artistId}&entity=song&limit=1`,
            { signal: controller.signal }
          );
          if (songsResponse.ok) {
            const songsPayload = await songsResponse.json() as {
              results?: Array<{ wrapperType?: string; artworkUrl100?: string; artworkUrl600?: string }>;
            };
            const firstSong = (songsPayload.results || []).find((item) => item.wrapperType === 'track');
            const bannerUrl = upscaleItunesArtwork(firstSong?.artworkUrl600 || firstSong?.artworkUrl100, 1200);
            if (bannerUrl) setOnlineArtistBanner(bannerUrl);
          }
        }

        const wikiProfile = await resolveArtistDescriptionRu(displayArtistName);
        if (wikiProfile.description) setOnlineArtistDescription(wikiProfile.description);
        if (wikiProfile.imageUrl) setOnlineArtistBanner((prev) => prev || wikiProfile.imageUrl || '');
        if (artist?.id && wikiProfile.description && isPlaceholderArtistDescription(artist.description)) {
          updateArtist(artist.id, { description: wikiProfile.description });
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
      }
    };
    void loadArtistMeta();
    return () => controller.abort();
  }, [displayArtistName, isNew, artist?.id, artist?.description, updateArtist]);

  useEffect(() => {
    if (isNew || !displayArtistName.trim()) {
      setPopularTracks([]);
      setIsPopularTracksExpanded(false);
      setPopularTracksError(null);
      setIsPopularTracksLoading(false);
      return;
    }

    const controller = new AbortController();
    const loadPopularTracks = async () => {
      setIsPopularTracksLoading(true);
      setPopularTracksError(null);
      try {
        const normalizedArtist = displayArtistName.trim().toLowerCase();
        const artistSearchResponse = await fetch(
          `https://itunes.apple.com/search?entity=musicArtist&limit=1&term=${encodeURIComponent(displayArtistName.trim())}`,
          { signal: controller.signal }
        );
        if (!artistSearchResponse.ok) {
          throw new Error(`iTunes request failed with status ${artistSearchResponse.status}`);
        }
        const artistSearchPayload = await artistSearchResponse.json() as {
          results?: Array<{
            artistId?: number;
            artistName?: string;
          }>;
        };
        const matchedArtist = (artistSearchPayload.results || []).find(
          (item) => item.artistId && item.artistName?.trim().toLowerCase().includes(normalizedArtist)
        );
        if (!matchedArtist?.artistId) {
          setPopularTracks([]);
          return;
        }

        const rawTracks: Array<{
          trackId?: number;
          trackName?: string;
          artistName?: string;
          artworkUrl100?: string;
          artworkUrl600?: string;
          previewUrl?: string;
        }> = [];
        const pageSize = 200;
        const maxPages = 20;
        for (let page = 0; page < maxPages; page += 1) {
          const offset = page * pageSize;
          const response = await fetch(
            `https://itunes.apple.com/lookup?id=${matchedArtist.artistId}&entity=song&limit=${pageSize}&offset=${offset}`,
            { signal: controller.signal }
          );
          if (!response.ok) {
            throw new Error(`iTunes request failed with status ${response.status}`);
          }
          const payload = await response.json() as {
            results?: Array<{
              wrapperType?: string;
              artistId?: number;
              trackId?: number;
              trackName?: string;
              artistName?: string;
              artworkUrl100?: string;
              artworkUrl600?: string;
              previewUrl?: string;
            }>;
          };
          const pageTracks = (payload.results || [])
            .filter((item) => item.wrapperType === 'track' && item.trackId)
            .filter((item) => item.artistId === matchedArtist.artistId);
          rawTracks.push(...pageTracks);
          if (pageTracks.length < pageSize) break;
        }

        const uniqueTrackIds = new Set<string>();
        const tracks = rawTracks
          .filter((item) => item.trackName && item.artistName)
          .filter((item) => {
            const artistFieldParts = splitArtistField(item.artistName || '');
            const artistsFromField = [...artistFieldParts.primaryArtists, ...artistFieldParts.featuringArtists];
            const featuringFromTitle = extractFeaturingArtists(item.trackName || '');
            const normalizedCandidates = Array.from(new Set([...artistsFromField, ...featuringFromTitle]))
              .map((value) => value.toLowerCase());
            return normalizedCandidates.some((candidate) => candidate.includes(normalizedArtist));
          })
          .map((item) => ({
            id: String(item.trackId),
            title: String(item.trackName),
            artist: String(item.artistName),
            artworkUrl: upscaleItunesArtwork(item.artworkUrl600 || item.artworkUrl100, 1200),
            previewUrl: item.previewUrl,
          }))
          .filter((item) => {
            if (uniqueTrackIds.has(item.id)) return false;
            uniqueTrackIds.add(item.id);
            return true;
          });

        setPopularTracks(tracks);
        setIsPopularTracksExpanded(false);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setPopularTracks([]);
        setPopularTracksError('Не удалось загрузить популярные треки.');
      } finally {
        setIsPopularTracksLoading(false);
      }
    };

    void loadPopularTracks();

    return () => controller.abort();
  }, [displayArtistName, isNew]);

  useEffect(() => {
    const candidates = Object.values(albums)
      .filter((albumItem) => (albumItem.artistIds || []).includes(artist?.id || ''))
      .map((albumItem) => albumItem.itunesCollectionId || albumItem.id.match(/^itunes-(\d+)$/)?.[1] || '')
      .filter(Boolean)
      .filter((collectionId, index, arr) => arr.indexOf(collectionId) === index)
      .filter((collectionId) => !itunesTrackCountByCollectionId[collectionId]);
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
          (albumItem) =>
            albumItem.itunesCollectionId === collectionId ||
            albumItem.id === `itunes-${collectionId}`
        );
        const nextCollectionId = targetAlbum?.itunesCollectionId || collectionId;
        if (
          targetAlbum &&
          (targetAlbum.sourceTrackCount !== trackCount ||
            targetAlbum.itunesCollectionId !== nextCollectionId)
        ) {
          updateAlbum(targetAlbum.id, {
            sourceTrackCount: trackCount,
            itunesCollectionId: nextCollectionId,
          });
        }
      });
    };

    void loadTrackCounts();
    return () => controller.abort();
  }, [albums, artist, itunesTrackCountByCollectionId, updateAlbum]);

  useEffect(() => {
    if (isNew || !displayArtistName.trim()) {
      setOnlineAlbums([]);
      setAlbumsError(null);
      setIsAlbumsLoading(false);
      return;
    }

    const controller = new AbortController();
    const loadAlbums = async () => {
      setIsAlbumsLoading(true);
      setAlbumsError(null);
      try {
        const normalizedArtist = displayArtistName.trim().toLowerCase();
        const artistSearchResponse = await fetch(
          `https://itunes.apple.com/search?entity=musicArtist&limit=1&term=${encodeURIComponent(displayArtistName.trim())}`,
          { signal: controller.signal }
        );
        if (!artistSearchResponse.ok) {
          throw new Error(`iTunes request failed with status ${artistSearchResponse.status}`);
        }
        const artistSearchPayload = await artistSearchResponse.json() as {
          results?: Array<{
            artistId?: number;
            artistName?: string;
          }>;
        };
        const matchedArtist = (artistSearchPayload.results || []).find(
          (item) => item.artistId && item.artistName?.trim().toLowerCase().includes(normalizedArtist)
        );
        if (!matchedArtist?.artistId) {
          setOnlineAlbums([]);
          return;
        }

        const response = await fetch(
          `https://itunes.apple.com/lookup?id=${matchedArtist.artistId}&entity=album&limit=200`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error(`iTunes request failed with status ${response.status}`);
        }
        const payload = await response.json() as {
          results?: Array<{
            wrapperType?: string;
            collectionId?: number;
            collectionName?: string;
            artistName?: string;
            artworkUrl100?: string;
            artworkUrl600?: string;
            trackCount?: number;
            collectionType?: string;
            releaseDate?: string;
          }>;
        };

        const albumsByKey = new Map<string, {
          id: string;
          title: string;
          artist: string;
          coverUrl?: string;
          trackCount: number;
          releaseYear?: string;
          status: 'album' | 'ep';
        }>();
        (payload.results || [])
          .filter((item) => item.wrapperType === 'collection' && item.collectionId && item.collectionName)
          .filter((item) => (item.artistName || '').toLowerCase().includes(normalizedArtist))
          .filter((item) => Number(item.trackCount || 0) > 1)
          .forEach((item) => {
            const collectionType = (item.collectionType || '').toLowerCase();
            const status: 'album' | 'ep' = collectionType.includes('ep') ? 'ep' : 'album';
            const nextAlbum = {
              id: String(item.collectionId),
              title: String(item.collectionName),
              artist: String(item.artistName || displayArtistName),
              coverUrl: upscaleItunesArtwork(item.artworkUrl600 || item.artworkUrl100, 1200),
              trackCount: Number(item.trackCount || 0),
              releaseYear: item.releaseDate ? String(new Date(item.releaseDate).getFullYear()) : undefined,
              status,
            };
            const dedupeKey = `${status}:${normalizeAlbumTitle(nextAlbum.title)}`;
            const existing = albumsByKey.get(dedupeKey);
            if (!existing) {
              albumsByKey.set(dedupeKey, nextAlbum);
              return;
            }
            const shouldReplace =
              nextAlbum.trackCount > existing.trackCount ||
              (!!nextAlbum.coverUrl && !existing.coverUrl) ||
              ((nextAlbum.releaseYear || '') > (existing.releaseYear || ''));
            if (shouldReplace) {
              albumsByKey.set(dedupeKey, nextAlbum);
            }
          });
        const parsedAlbums = Array.from(albumsByKey.values());
        setOnlineAlbums(parsedAlbums);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setOnlineAlbums([]);
        setAlbumsError('Не удалось загрузить альбомы и EP.');
      } finally {
        setIsAlbumsLoading(false);
      }
    };

    void loadAlbums();

    return () => controller.abort();
  }, [displayArtistName, isNew]);

  if (!isNew && !isVirtualArtist && !artist) {
    return <div className="p-4 pt-8">Артист не найден</div>;
  }

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setBannerFile(file);
      setBannerPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!currentUserId) return;

    let bannerId = artist?.bannerUrl || '';
    if (bannerFile) {
      bannerId = uuidv4();
      await saveImageFile(bannerId, bannerFile);
    }

    if (isNew) {
      const newId = uuidv4();
      addArtist({ 
        id: newId, 
        name, 
        description, 
        bannerUrl: bannerId || undefined,
        ownerId: currentUserId
      });
      if (currentUser) {
        const favoriteArtistIds = currentUser.favoriteArtistIds || [];
        if (!favoriteArtistIds.includes(newId)) {
          updateUser(currentUser.id, { favoriteArtistIds: [...favoriteArtistIds, newId] });
        }
      }
      navigate(`/artist/${newId}`, { replace: true });
    } else if (artist) {
      updateArtist(artist.id, { 
        name, 
        description, 
        bannerUrl: bannerId || undefined 
      });
    }
    setIsEditing(false);
  };

  const artistTracks = isNew
    ? []
    : Object.values(tracks).filter((trackItem) => {
        const normalizedDisplayName = normalizeArtistName(displayArtistName);
        const artistRefs = toStringArray(trackItem.artistIds);
        const features = toStringArray(trackItem.features);
        return [...artistRefs, ...features].some(
          (artistRef) => normalizeArtistName(artistRef) === normalizedDisplayName
        );
      });
  const artistAlbums = isNew
    ? []
    : Object.values(albums).filter(
        (a) => (a.artistIds || []).includes(artist?.id || '') && (a.trackIds?.length || 0) > 1
      );
  const onlineAlbumsByNormalizedTitle = new Map(
    onlineAlbums.map((album) => [normalizeAlbumTitle(album.title), album] as const)
  );
  const onlineAlbumsById = new Map(onlineAlbums.map((album) => [album.id, album] as const));
  const localAlbumTitleSet = new Set(artistAlbums.map((album) => normalizeAlbumTitle(album.title)));
  const visibleOnlineAlbums = onlineAlbums.filter((album) => !localAlbumTitleSet.has(normalizeAlbumTitle(album.title)));

  useEffect(() => {
    if (onlineAlbums.length === 0 || artistAlbums.length === 0) return;
    artistAlbums.forEach((album) => {
      if (album.sourceTrackCount && album.sourceTrackCount > 0 && album.itunesCollectionId) return;
      const matchedOnline = onlineAlbums.find(
        (onlineAlbum) => normalizeAlbumTitle(onlineAlbum.title) === normalizeAlbumTitle(album.title)
      );
      if (!matchedOnline) return;
      const nextSourceTrackCount = album.sourceTrackCount || matchedOnline.trackCount;
      const nextItunesCollectionId = album.itunesCollectionId || matchedOnline.id;
      if (
        album.sourceTrackCount === nextSourceTrackCount &&
        album.itunesCollectionId === nextItunesCollectionId
      ) {
        return;
      }
      updateAlbum(album.id, {
        sourceTrackCount: nextSourceTrackCount,
        itunesCollectionId: nextItunesCollectionId,
      });
    });
  }, [artistAlbums, onlineAlbums, updateAlbum]);

  useEffect(() => {
    if (artistAlbums.length === 0) return;
    artistAlbums.forEach((album) => {
      const matchedOnline = onlineAlbumsByNormalizedTitle.get(normalizeAlbumTitle(album.title));
      const matchedOnlineByCollectionId = album.itunesCollectionId ? onlineAlbumsById.get(album.itunesCollectionId) : undefined;
      const fallbackCollectionId = resolveAlbumCollectionId(album);
      const resolvedOnlineTotal = fallbackCollectionId ? (itunesTrackCountByCollectionId[fallbackCollectionId] || 0) : 0;
      const downloadedTracks = getDownloadedAlbumTrackCount(album.id, album.trackIds, tracks);
      const resolvedTotal = resolveAlbumTotalTracks({
        downloadedTracks,
        persistedSourceTrackCount: album.sourceTrackCount,
        lookupTrackCount: resolvedOnlineTotal,
        onlineTrackCount: Number(matchedOnlineByCollectionId?.trackCount || matchedOnline?.trackCount || 0),
      });
      if (resolvedTotal > 0 && album.sourceTrackCount !== resolvedTotal) {
        updateAlbum(album.id, {
          sourceTrackCount: resolvedTotal,
          itunesCollectionId: album.itunesCollectionId || matchedOnlineByCollectionId?.id || matchedOnline?.id,
        });
      }
    });
  }, [
    artistAlbums,
    onlineAlbumsById,
    onlineAlbumsByNormalizedTitle,
    itunesTrackCountByCollectionId,
    tracks,
    updateAlbum,
  ]);

  const albumCards = [
    ...artistAlbums.map((album) => {
      const matchedOnline = onlineAlbumsByNormalizedTitle.get(normalizeAlbumTitle(album.title));
      const matchedOnlineByCollectionId = album.itunesCollectionId ? onlineAlbumsById.get(album.itunesCollectionId) : undefined;
      const releaseYear = matchedOnline?.releaseYear;
      const fallbackCollectionId = resolveAlbumCollectionId(album);
      const resolvedOnlineTotal = fallbackCollectionId ? (itunesTrackCountByCollectionId[fallbackCollectionId] || 0) : 0;
      const downloadedTracks = getDownloadedAlbumTrackCount(album.id, album.trackIds, tracks);
      const totalTracks = resolveAlbumTotalTracks({
        downloadedTracks,
        persistedSourceTrackCount: album.sourceTrackCount,
        lookupTrackCount: resolvedOnlineTotal,
        onlineTrackCount: Number(matchedOnlineByCollectionId?.trackCount || matchedOnline?.trackCount || 0),
      });
      return {
        id: `local-${album.id}`,
        title: album.title,
        coverUrl: album.coverUrl || matchedOnline?.coverUrl,
        subtitle: `${album.status || 'Альбом'} · ${downloadedTracks}/${totalTracks}${releaseYear ? ` · ${releaseYear}` : ''}`,
        releaseYear: releaseYear ? Number(releaseYear) : Number.POSITIVE_INFINITY,
        href: album.itunesCollectionId
          ? `/album/itunes-${album.itunesCollectionId}`
          : (/^itunes-album-(\d+)$/.test(album.id)
            ? `/album/itunes-${album.id.replace('itunes-album-', '')}`
            : `/album/${album.id}`),
        onlineAlbumId: matchedOnline?.id ?? null,
        localAlbumId: album.id,
        downloadedTracks,
        totalTracks,
        isFullyCached: downloadedTracks > 0,
      };
    }),
    ...visibleOnlineAlbums.map((album) => {
      const localAlbum = Object.values(albums).find((candidate) => normalizeAlbumTitle(candidate.title) === normalizeAlbumTitle(album.title));
      const downloadedTracks = localAlbum
        ? getDownloadedAlbumTrackCount(localAlbum.id, localAlbum.trackIds, tracks)
        : 0;
      return {
        id: `online-${album.id}`,
        title: album.title,
        coverUrl: album.coverUrl,
        subtitle: `${album.status === 'ep' ? 'EP' : 'Альбом'} · ${downloadedTracks}/${album.trackCount}${album.releaseYear ? ` · ${album.releaseYear}` : ''}`,
        releaseYear: album.releaseYear ? Number(album.releaseYear) : Number.POSITIVE_INFINITY,
        href: null as string | null,
        onlineAlbumId: album.id,
        localAlbumId: localAlbum?.id || null,
        downloadedTracks,
        totalTracks: album.trackCount,
        isFullyCached: downloadedTracks > 0,
      };
    }),
  ].sort((a, b) => {
    if (a.releaseYear !== b.releaseYear) return a.releaseYear - b.releaseYear;
    return a.title.localeCompare(b.title, 'ru');
  });
  const sanitizeLyricsForUi = (lyrics: string): string =>
    lyrics
      .replace(/\[\d{1,2}:\d{2}(?:\.\d{1,2})?\]\s*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
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
  const findLocalAlbumByOnline = (onlineAlbumId: string): Album | undefined => {
    const targetOnline = onlineAlbumsById.get(onlineAlbumId);
    if (!targetOnline) return undefined;
    const normalizedTitle = normalizeAlbumTitle(targetOnline.title);
    return Object.values(albums).find((candidate) => {
      if (normalizeAlbumTitle(candidate.title) !== normalizedTitle) return false;
      if ((candidate.artistIds || []).includes(artist?.id || '')) return true;
      const candidateArtistName = candidate.artistIds
        .map((artistId) => artists[artistId]?.name || '')
        .find(Boolean);
      return normalizeArtistName(candidateArtistName || '') === normalizeArtistName(displayArtistName);
    });
  };
  const getAlbumRouteForOnline = (onlineAlbumId: string): string => {
    const existingLocal = findLocalAlbumByOnline(onlineAlbumId);
    if (existingLocal) return `/album/${existingLocal.id}`;
    const artistQuery = artist?.id ? `&artistId=${encodeURIComponent(artist.id)}` : '';
    return `/album/itunes-${encodeURIComponent(onlineAlbumId)}?source=itunes${artistQuery}`;
  };
  const openAlbumAndAutoDownloadFirstTrack = (onlineAlbumId: string) => {
    const baseRoute = getAlbumRouteForOnline(onlineAlbumId);
    const separator = baseRoute.includes('?') ? '&' : '?';
    navigate(`${baseRoute}${separator}autodownload=1`);
  };
  const clearAlbumCache = async (albumId: string) => {
    const targetAlbum = albums[albumId];
    if (!targetAlbum) return;
    const shouldClear = window.confirm(
      'Удалить скачанные треки альбома только из приложения? Файлы на устройстве вне приложения не удаляются.'
    );
    if (!shouldClear) return;
    const trackIds = [...(targetAlbum.trackIds || [])];
    for (const trackId of trackIds) {
      await deleteAudioFile(trackId).catch(() => undefined);
    }
    const usedTrackIds = new Set(
      Object.values(albums)
        .filter((albumItem) => albumItem.id !== albumId)
        .flatMap((albumItem) => albumItem.trackIds || [])
    );
    for (const trackId of trackIds) {
      if (!usedTrackIds.has(trackId)) {
        const track = tracks[trackId];
        if (track?.coverUrl && !track.coverUrl.startsWith('http') && !track.coverUrl.startsWith('data:')) {
          await deleteImageFile(track.coverUrl).catch(() => undefined);
        }
      }
    }
    useMockServer.setState((state) => {
      const updatedTracks = { ...state.tracks };
      for (const trackId of trackIds) {
        if (!usedTrackIds.has(trackId)) {
          delete updatedTracks[trackId];
        }
      }
      const updatedAlbums = { ...state.albums };
      const updatedUsers = { ...state.users };
      delete updatedAlbums[albumId];
      Object.keys(updatedUsers).forEach((userId) => {
        const user = updatedUsers[userId];
        updatedUsers[userId] = {
          ...user,
          favoriteAlbumIds: (user.favoriteAlbumIds || []).filter((favoriteId) => favoriteId !== albumId),
        };
      });
      return {
        tracks: updatedTracks,
        albums: updatedAlbums,
        users: updatedUsers,
      };
    });
  };
  const importOnlineTrackToLibrary = async (track: OnlineTrackItemData): Promise<string> => {
      const response = new Response(null, { status: 410, statusText: 'Server media download removed' });
      if (!response.ok) {
        throw new Error('Download request failed');
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const headerFilename = extractFilenameFromDisposition(response.headers.get('content-disposition'));
      const headerLyricsEncoded = response.headers.get('x-track-lyrics');
      const headerLyrics = headerLyricsEncoded ? sanitizeLyricsForUi(decodeURIComponent(headerLyricsEncoded)) : '';
      const fallbackFilename = `${sanitizeDownloadFilename(`${track.artist} - ${track.title}`) || 'track'}-processed.mp3`;
      const downloadFilename = sanitizeDownloadFilename(headerFilename || fallbackFilename) || 'download.mp3';

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = downloadFilename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      const normalizedTitle = track.title.trim().toLowerCase();
      const artistFieldParts = splitArtistField(track.artist);
      const featuringArtistsFromTitle = extractFeaturingArtists(track.title);
      const sourceArtists = Array.from(new Set([
        ...artistFieldParts.primaryArtists,
        ...artistFieldParts.featuringArtists,
        ...featuringArtistsFromTitle,
      ]));
      const featuringArtists = Array.from(new Set([
        ...artistFieldParts.featuringArtists,
        ...featuringArtistsFromTitle,
      ]));
      const normalizedArtists = sourceArtists.map((value) => value.toLowerCase());
      const existingTrack = Object.values(tracks).find((candidate) => {
        if (candidate.title.trim().toLowerCase() !== normalizedTitle) return false;
        const candidateArtists = candidate.artistIds.map((artistRef) => artistRef.trim().toLowerCase());
        return normalizedArtists.some((artistName) => candidateArtists.includes(artistName));
      });

      const targetTrackId = existingTrack?.id || `downloaded-${Date.now()}-${track.id}`;
      await saveAudioFile(targetTrackId, blob);

      const fetchArtistProfile = async (artistName: string): Promise<{ description: string; imageUrl?: string }> => (
        resolveArtistDescriptionRu(artistName, {
          fallbackDescription: `${artistName} - артист в твоей коллекции rainboow. Скачан автоматически по метаданным трека.`,
        })
      );

      for (const artistName of sourceArtists) {
        const exists = Object.values(useMockServer.getState().artists).some(
          (candidateArtist) => candidateArtist.name.trim().toLowerCase() === artistName.toLowerCase()
        );
        if (!exists) {
          const isCurrentVirtualArtist =
            isVirtualArtist && normalizeArtistName(artistName) === normalizeArtistName(displayArtistName);
          const prefetchedDescription = isCurrentVirtualArtist ? displayArtistDescription : '';
          const prefetchedImageUrl = isCurrentVirtualArtist ? displayBannerPreview || undefined : undefined;
          const { description, imageUrl } = prefetchedDescription || prefetchedImageUrl
            ? { description: prefetchedDescription || `${artistName} - артист в твоей коллекции rainboow.`, imageUrl: prefetchedImageUrl }
            : await fetchArtistProfile(artistName);
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

          if (!bannerId && track.artworkUrl) {
            try {
              const coverResponse = await fetch(track.artworkUrl);
              if (coverResponse.ok) {
                bannerId = `artist-banner-${artistId}`;
                await saveImageFile(bannerId, await coverResponse.blob());
              }
            } catch {
              // keep artist creation even if banner fetch fails
            }
          }

          addArtist({
            id: artistId,
            name: artistName,
            description,
            bannerUrl: bannerId,
            ownerId: currentUserId || undefined,
          });
        } else if (track.artworkUrl) {
          const existingArtist = Object.values(useMockServer.getState().artists).find(
            (candidateArtist) => candidateArtist.name.trim().toLowerCase() === artistName.toLowerCase()
          );
          if (existingArtist) {
            await ensureArtistBannerFromTrackCover({
              artist: existingArtist,
              coverUrl: track.artworkUrl,
              updateArtist,
            });
          }
        }
      }

      let coverId: string | undefined = existingTrack?.coverUrl;
      if (track.artworkUrl) {
        try {
          const coverResponse = await fetch(track.artworkUrl);
          if (coverResponse.ok) {
            coverId = `cover-${targetTrackId}`;
            await saveImageFile(coverId, await coverResponse.blob());
          }
        } catch {
          // Keep working even if cover download fails.
        }
      }

      if (!existingTrack) {
        const duration = await getAudioDurationFromBlob(blob);
        addTrack({
          id: targetTrackId,
          title: track.title.trim() || 'Unknown title',
          artistIds: sourceArtists.length > 0 ? sourceArtists : [track.artist.trim() || 'Unknown artist'],
          duration,
          isExplicit: false,
          isSingle: true,
          format: 'mp3',
          coverUrl: coverId,
          ownerId: currentUserId || 'system',
          lyrics: headerLyrics,
          features: featuringArtists,
          previewUrl: track.previewUrl,
          isPreviewOnly: false,
        });
        return targetTrackId;
      } else {
        updateTrack(existingTrack.id, {
          artistIds: sourceArtists.length > 0 ? sourceArtists : existingTrack.artistIds,
          coverUrl: coverId || existingTrack.coverUrl,
          lyrics: headerLyrics || existingTrack.lyrics,
          features: featuringArtists.length > 0 ? featuringArtists : existingTrack.features,
          previewUrl: track.previewUrl || existingTrack.previewUrl,
          isPreviewOnly: false,
        });
        return existingTrack.id;
      }
  };
  const downloadPopularTrack = async (track: OnlineTrackItemData) => {
    setDownloadLoadingId(track.id);
    setDownloadError(null);
    try {
      await importOnlineTrackToLibrary(track);
      if (isVirtualArtist) {
        const localArtistId = resolveArtistId(displayArtistName, useMockServer.getState().artists);
        if (localArtistId) {
          navigate(`/artist/${localArtistId}`, { replace: true });
        }
      }
    } catch (error) {
      if (track.previewUrl) {
        const previewTrackId = upsertPreviewOnlyTrack({
          existingTracks: useMockServer.getState().tracks,
          resultId: track.id,
          title: track.title,
          artist: track.artist,
          artworkUrl: track.artworkUrl,
          previewUrl: track.previewUrl,
          ownerId: currentUserId || 'system',
          addTrack: useMockServer.getState().addTrack,
          updateTrack: useMockServer.getState().updateTrack,
        });
        if (isVirtualArtist) {
          const localArtistId = resolveArtistId(displayArtistName, useMockServer.getState().artists);
          if (localArtistId) {
            navigate(`/artist/${localArtistId}`, { replace: true });
          }
        } else {
          playTrack(previewTrackId, [previewTrackId], null);
        }
        setDownloadError('Полная версия сейчас недоступна. Добавили preview-трек, можно попробовать скачать позже.');
      } else {
        setDownloadError((error as Error).message || 'Не удалось скачать трек.');
      }
    } finally {
      setDownloadLoadingId(null);
    }
  };
  const collapsedPopularTracksLimit = 5;
  const visiblePopularTracks = isPopularTracksExpanded
    ? popularTracks
    : popularTracks.slice(0, collapsedPopularTracksLimit);
  const hasHiddenPopularTracks = popularTracks.length > collapsedPopularTracksLimit;
  const totalArtistTrackCount = Math.max(artistTracks.length, popularTracks.length);

  return (
    <div className="pb-32">
      <div className="relative h-[300px] w-full bg-violet-100 overflow-hidden">
        {isEditing ? (
          <div 
            className="absolute inset-0 flex flex-col items-center justify-center bg-violet-500/50 z-10 cursor-pointer hover:bg-violet-500/60 transition-colors"
            onClick={() => bannerInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={bannerInputRef} 
              onChange={handleBannerChange} 
              accept="image/*" 
              className="hidden" 
            />
            <Upload className="w-8 h-8 text-white mb-2" />
            <span className="text-sm text-white font-medium">Изменить баннер</span>
          </div>
        ) : null}
        {displayBannerPreview ? (
          <CachedImage src={displayBannerPreview} alt={displayArtistName || 'Artist'} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-20 h-20 text-slate-400" />
          </div>
        )}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.64) 28%, rgba(2,6,23,0.38) 52%, var(--accent-soft-strong) 72%, transparent 88%)'
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-28 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.48) 45%, transparent 100%)' }}
        />
        
        <button 
          onClick={handleBack}
          className="absolute top-9 right-4 p-1 text-white z-20"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        <div className="absolute bottom-6 left-4 right-4 z-20">
          {isEditing ? (
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)}
              placeholder="Имя артиста"
              className="bg-transparent text-4xl font-bold text-white outline-none w-full placeholder:text-white/70"
              autoFocus
            />
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-4xl font-bold text-white truncate">{displayArtistName}</h1>
                {!isNew && (
                  <button
                    onClick={toggleFavorite}
                    disabled={!canToggleFavorite}
                    className="p-1 text-white hover:text-white transition-colors flex-shrink-0 disabled:opacity-70 disabled:cursor-default"
                    title="В избранное"
                    aria-label="Добавить артиста в избранное"
                  >
                    <Heart
                      className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`}
                      style={isFavorite ? { color: '#ef4444' } : { color: '#ffffff' }}
                    />
                  </button>
                )}
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-white/90 text-xs backdrop-blur-sm">
                <span>{artistTracks.length}/{totalArtistTrackCount} треков скачано</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 relative z-10 -mt-8 space-y-4">
        {!isEditing && (
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-4 shadow-md shadow-violet-100/70 border border-white/70">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Профиль артиста</div>
                <h2 className="text-xl font-bold text-slate-700 truncate">{displayArtistName}</h2>
              </div>
              <div className="flex items-center gap-2">
                {!isVirtualArtist && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2.5 bg-white rounded-full text-slate-500 hover:text-violet-500 transition-colors"
                  title="Редактировать"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                )}
              </div>
            </div>
          </div>
        )}
        {isVirtualArtistLoading && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 shadow-md shadow-violet-100/70 text-sm text-slate-400">
            Загружаем данные артиста...
          </div>
        )}
        {virtualArtistError && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 shadow-md shadow-violet-100/70 text-sm text-rose-500">
            {virtualArtistError}
          </div>
        )}

        {isEditing ? (
          <div className="space-y-4 bg-white/95 backdrop-blur-sm rounded-2xl p-4 shadow-md shadow-violet-100/70 border border-white/70">
            <div>
              <label className="block text-xs uppercase tracking-wide text-slate-400 mb-2">Имя артиста</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Имя артиста"
                className="w-full bg-white text-slate-700 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200"
              />
            </div>
            <textarea 
              value={description} 
              onChange={e => setDescription(e.target.value)}
              placeholder="Описание артиста"
              rows={4}
              className="w-full bg-white text-slate-700 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 bg-slate-100 text-slate-600 font-semibold py-3 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Отмена
              </button>
              <button 
                onClick={handleSave}
                className="flex-1 bg-violet-500 text-white font-bold py-3 rounded-xl hover:bg-violet-600 transition-colors"
              >
                Сохранить
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-md shadow-violet-100/70 mt-1">
            <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">О исполнителе</div>
            <p className="text-slate-600 leading-relaxed">{displayArtistDescription || 'Нет описания'}</p>
          </div>
        )}

        {!isNew && (
          <div className="space-y-4">
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 shadow-md shadow-violet-100/70">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Скачанные</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-full text-violet-600 font-medium">
                    {artistTracks.length}
                  </span>
                  {isEditing && (
                    <button 
                      onClick={() => setIsLinking(true)}
                      className="p-2 text-slate-400 hover:text-violet-500 bg-white rounded-full"
                      title="Привязать существующие треки/альбомы"
                    >
                      <LinkIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
              {artistTracks.slice(0, 5).map((track, index) => (
                <TrackListItem
                  key={track.id}
                  track={track}
                  user={currentUser}
                  isPlaying={isPlaying}
                  isActive={currentTrackId === track.id}
                  searchQuery=""
                  onPlay={() => playTrack(track.id, artistTracks.map(t => t.id), null)}
                  onArtistClick={(artistRef) => {
                    const artistId = resolveArtistId(artistRef, artists);
                    if (artistId) navigate(`/artist/${artistId}`);
                  }}
                  onToggleFavorite={() => {}}
                  onAddToPlaylist={() => {}}
                  onOpenRecommendations={() => navigate(`/radooga?mode=track&seed=${encodeURIComponent(track.id)}`)}
                  onEdit={() => {}}
                  showMenu={false}
                />
              ))}
              {artistTracks.length === 0 && (
                <div className="text-center text-slate-400 py-4 bg-white rounded-xl">Нет треков</div>
              )}
            </div>
            </div>

            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 shadow-md shadow-violet-100/70">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Популярные треки</h2>
                {hasHiddenPopularTracks ? (
                  <button
                    onClick={() => setIsPopularTracksExpanded((prev) => !prev)}
                    className="text-xs px-2.5 py-1 rounded-full bg-violet-50 text-violet-600 font-medium hover:bg-violet-100 transition-colors"
                  >
                    {isPopularTracksExpanded ? 'Свернуть' : 'Показать все'}
                  </button>
                ) : null}
              </div>
              <div className="space-y-2">
                {isPopularTracksLoading && (
                  <div className="text-sm text-slate-400 py-3">Ищем в iTunes...</div>
                )}
                {popularTracksError && (
                  <div className="text-sm text-rose-500 py-3">{popularTracksError}</div>
                )}
                {visiblePopularTracks.map((track) => {
                  const localTrack = findLocalTrackByOnline(track);
                  const isLocalActive = Boolean(localTrack?.id && localTrack.id === currentTrackId);
                  const isPreviewActive = !localTrack?.id && currentPreviewKey === `online-${track.id}`;
                  return (
                    <OnlineTrackListItem
                      key={track.id}
                      track={track}
                      isActive={isLocalActive || isPreviewActive}
                      isPlaying={isPlaying}
                      canDownload
                      isDownloading={downloadLoadingId === track.id}
                      isDownloaded={Boolean(localTrack && !localTrack.isPreviewOnly)}
                      onDownload={() => downloadPopularTrack(track)}
                      onArtistClick={(artistName) => navigate(resolveArtistRoute(artistName, artists))}
                      onOpenRecommendations={() => {
                        if (localTrack?.id) {
                          navigate(`/radooga?mode=track&seed=${encodeURIComponent(localTrack.id)}`);
                        }
                      }}
                      onPlay={() => {
                        if (localTrack?.id) {
                          playTrack(localTrack.id, artistTracks.map((item) => item.id), null);
                          return;
                        }
                        if (track.previewUrl) {
                          const previewQueue = popularTracks
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
                              key: `online-${track.id}`,
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
                {!isPopularTracksLoading && !popularTracksError && popularTracks.length === 0 && (
                  <div className="text-center text-slate-400 py-4 bg-white rounded-xl">Пока пусто</div>
                )}
                {downloadError && (
                  <div className="text-sm text-rose-500 py-2">{downloadError}</div>
                )}
              </div>
            </div>

            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 shadow-md shadow-violet-100/70">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Альбомы и EP</h2>
                <button
                  onClick={() => navigate(`/album/new?type=album${artist?.id ? `&artistId=${encodeURIComponent(artist.id)}` : ''}`)}
                  disabled={!artist?.id}
                  className="p-2 text-slate-400 hover:text-violet-500 disabled:opacity-40"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {albumCards.map((album) => {
                  const albumRoute = album.href || getAlbumRouteForOnline(album.onlineAlbumId);
                  return (
                    <div key={album.id} className="relative">
                      <CollectionCard
                        title={album.title}
                        subtitle={album.subtitle}
                        coverUrl={album.coverUrl}
                        type="album"
                        onClick={() => {
                          pushNavigationEntry({
                            path: `${location.pathname}${location.search}`,
                            state: getArtistBackState(),
                          });
                          navigate(albumRoute, {
                            state: {
                              fromArtist: true,
                              returnToArtist: location.pathname + location.search,
                            },
                          });
                        }}
                        imageActions={
                          <>
                            {!album.isFullyCached && album.onlineAlbumId ? (
                              <button
                                type="button"
                                onClick={() => openAlbumAndAutoDownloadFirstTrack(album.onlineAlbumId)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-violet-600"
                                title="Скачать первый трек альбома"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            ) : null}
                            {album.isFullyCached ? (
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-violet-600">
                                <Check className="w-4 h-4" />
                              </span>
                            ) : null}
                          </>
                        }
                        footerActions={
                          <button
                            type="button"
                            onClick={() => setAlbumActionMenuId((prev) => (prev === album.id ? null : album.id))}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:text-violet-500"
                            title="Действия"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        }
                      />
                      {albumActionMenuId === album.id ? (
                        <div className="absolute right-2 top-12 z-30 w-52 rounded-2xl border border-violet-100 bg-white shadow-xl">
                          {album.localAlbumId ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAlbumActionMenuId(null);
                                pushNavigationEntry({
                                  path: `${location.pathname}${location.search}`,
                                  state: getArtistBackState(),
                                });
                                navigate(`/album/${album.localAlbumId}`, {
                                  state: {
                                    fromArtist: true,
                                    returnToArtist: location.pathname + location.search,
                                  },
                                });
                              }}
                              className="block w-full px-4 py-3 text-left text-sm hover:bg-violet-50"
                            >
                              Редактировать
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              setAlbumActionMenuId(null);
                              pushNavigationEntry({
                                path: `${location.pathname}${location.search}`,
                                state: getArtistBackState(),
                              });
                              navigate(albumRoute, {
                                state: {
                                  fromArtist: true,
                                  returnToArtist: location.pathname + location.search,
                                },
                              });
                            }}
                            className="block w-full px-4 py-3 text-left text-sm hover:bg-violet-50"
                          >
                            Открыть альбом
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAlbumActionMenuId(null);
                              pushNavigationEntry({
                                path: `${location.pathname}${location.search}`,
                                state: getArtistBackState(),
                              });
                              navigate(albumRoute, {
                                state: {
                                  fromArtist: true,
                                  returnToArtist: location.pathname + location.search,
                                },
                              });
                            }}
                            className="block w-full px-4 py-3 text-left text-sm hover:bg-violet-50"
                          >
                            Слушать альбом
                          </button>
                          {album.localAlbumId && album.downloadedTracks > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAlbumActionMenuId(null);
                                void clearAlbumCache(album.localAlbumId);
                              }}
                              className="block w-full px-4 py-3 text-left text-sm text-rose-600 hover:bg-rose-50"
                            >
                              Очистить из приложения
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {isAlbumsLoading && (
                  <div className="col-span-2 text-center text-slate-400 py-8 bg-white/70 rounded-[6px]">
                    Загружаем альбомы...
                  </div>
                )}
                {albumsError && (
                  <div className="col-span-2 text-center text-rose-500 py-8 bg-white/70 rounded-[6px]">
                    {albumsError}
                  </div>
                )}
                {!isAlbumsLoading && !albumsError && albumCards.length === 0 && (
                  <div className="col-span-2 text-center text-slate-400 py-8 bg-white/70 rounded-[6px]">
                    Нет релизов
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {isLinking && artist && (
        <LinkToArtistModal 
          artistId={artist.id} 
          artistName={artist.name} 
          onClose={() => setIsLinking(false)} 
        />
      )}
    </div>
  );
}
