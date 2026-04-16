import React from 'react';
import { ChevronDown, ChevronRight, Disc3, Download, MoreVertical, Pause, Play } from 'lucide-react';
import { CachedImage } from './CachedImage';
import { escapeRegExp } from '../lib/safe';
import { splitArtistField } from '../lib/artistRouting';
import { getImageFile } from '../lib/db';
import { getAverageColor } from '../lib/colorExtractor';

interface AlbumTrackListItemProps {
  title: string;
  artistName: string;
  coverUrl?: string;
  trackCount: number;
  qualityLabel: string;
  isExplicit: boolean;
  isActive: boolean;
  isPlaying: boolean;
  downloadedTracks?: number;
  totalTracks?: number;
  itemLabel?: string;
  openLabel?: string;
  playLabel?: string;
  clearWithTracksLabel?: string;
  clearGroupOnlyLabel?: string;
  isDownloading?: boolean;
  isFullyDownloaded?: boolean;
  isExpanded?: boolean;
  nestedVisibleCount?: number;
  searchQuery: string;
  onOpen: () => void;
  onPlay: () => void;
  onToggleExpand?: () => void;
  onArtistClick?: (artistName: string) => void;
  onEdit?: () => void;
  onClearCache?: () => void;
  onRemoveAlbumOnly?: () => void;
  onDownload?: () => void;
}

const Highlight = ({ text, highlight }: { text: string; highlight: string }) => {
  if (!highlight.trim() || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(highlight)})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <span key={i} className="bg-indigo-500/50 text-white rounded px-0.5">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

export function AlbumTrackListItem({
  title,
  artistName,
  coverUrl,
  trackCount,
  qualityLabel,
  isExplicit,
  isActive,
  isPlaying,
  downloadedTracks,
  totalTracks,
  itemLabel = 'Альбом',
  openLabel = 'Открыть альбом',
  playLabel = 'Воспроизвести альбом',
  clearWithTracksLabel = 'Удалить с треками',
  clearGroupOnlyLabel = 'Удалить альбом - треки оставить',
  isDownloading = false,
  isFullyDownloaded = false,
  isExpanded = false,
  nestedVisibleCount,
  searchQuery,
  onOpen,
  onPlay,
  onToggleExpand,
  onArtistClick,
  onEdit,
  onClearCache,
  onRemoveAlbumOnly,
  onDownload,
}: AlbumTrackListItemProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [coverObjectUrl, setCoverObjectUrl] = React.useState<string | null>(null);
  const [dynamicColors, setDynamicColors] = React.useState<{
    rowBackground: string;
    rowBorder: string;
    primaryText: string;
    secondaryText: string;
    badgeBackground: string;
    badgeText: string;
    iconColor: string;
  } | null>(null);
  const artistParts = splitArtistField(artistName || '');
  const clickableArtists = Array.from(new Set([...artistParts.primaryArtists, ...artistParts.featuringArtists]));

  const resolvedDownloaded = typeof downloadedTracks === 'number' ? downloadedTracks : trackCount;
  const resolvedTotal = typeof totalTracks === 'number' && totalTracks > 0 ? totalTracks : trackCount;
  const FALLBACK_COLORS = React.useMemo(
    () => ({
      rowBackground: 'rgb(238, 242, 255)',
      rowBorder: 'rgba(167, 139, 250, 0.35)',
      primaryText: '#1f2937',
      secondaryText: '#475569',
      badgeBackground: 'rgba(255, 255, 255, 0.45)',
      badgeText: '#334155',
      iconColor: '#334155',
    }),
    []
  );

  React.useEffect(() => {
    if (!coverUrl) {
      setCoverObjectUrl(null);
      return;
    }
    if (coverUrl.startsWith('http') || coverUrl.startsWith('data:') || coverUrl.startsWith('blob:')) {
      setCoverObjectUrl(coverUrl);
      return;
    }
    let active = true;
    let newUrl: string | null = null;
    void getImageFile(coverUrl)
      .then((blob) => {
        if (!active || !blob) return;
        newUrl = URL.createObjectURL(blob);
        setCoverObjectUrl(newUrl);
      })
      .catch(() => {
        if (active) setCoverObjectUrl(null);
      });

    return () => {
      active = false;
      if (newUrl) URL.revokeObjectURL(newUrl);
    };
  }, [coverUrl]);

  React.useEffect(() => {
    if (!coverObjectUrl) {
      setDynamicColors(null);
      return;
    }
    let active = true;
    const parseRgb = (value: string): [number, number, number] | null => {
      const match = value.match(/rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/i);
      if (!match) return null;
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    };
    const clamp = (num: number) => Math.max(0, Math.min(255, Math.round(num)));
    const toRgba = (r: number, g: number, b: number, a: number) => `rgba(${clamp(r)}, ${clamp(g)}, ${clamp(b)}, ${a})`;
    const invert = (r: number, g: number, b: number): [number, number, number] => [255 - r, 255 - g, 255 - b];
    const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

    void getAverageColor(coverObjectUrl)
      .then((rgb) => {
        if (!active) return;
        const parsed = parseRgb(rgb);
        if (!parsed) {
          setDynamicColors(null);
          return;
        }
        const [r, g, b] = parsed;
        const [invR, invG, invB] = invert(r, g, b);
        const baseIsDark = luminance(r, g, b) < 135;
        const primaryText = baseIsDark ? '#ffffff' : '#111827';
        const secondaryText = baseIsDark ? 'rgba(255,255,255,0.86)' : 'rgba(17,24,39,0.78)';
        setDynamicColors({
          rowBackground: toRgba(r, g, b, 1),
          rowBorder: toRgba(r, g, b, 0.62),
          primaryText,
          secondaryText,
          badgeBackground: toRgba(invR, invG, invB, 0.22),
          badgeText: primaryText,
          iconColor: secondaryText,
        });
      })
      .catch(() => {
        if (active) setDynamicColors(null);
      });

    return () => {
      active = false;
    };
  }, [coverObjectUrl]);

  const palette = dynamicColors || FALLBACK_COLORS;

  return (
    <div
      className="flex items-center gap-3 p-2 rounded-3xl cursor-pointer group relative transition-colors"
      style={{
        backgroundColor: palette.rowBackground,
        border: `1px solid ${palette.rowBorder}`,
      }}
      onClick={onOpen}
    >
      <div
        className="w-12 h-12 bg-violet-100 rounded-[2px] overflow-hidden flex-shrink-0 relative"
        onClick={(e) => {
          e.stopPropagation();
          onPlay();
        }}
      >
        {coverUrl ? (
          <CachedImage src={coverUrl} alt={title} className="w-full h-full object-cover" />
        ) : (
          <Disc3 className="w-full h-full p-3 text-slate-400" />
        )}
        <div className="absolute inset-0 bg-slate-900/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          {isActive && isPlaying ? (
            <Pause className="w-6 h-6 text-white fill-current" />
          ) : (
            <Play className="w-6 h-6 text-white fill-current ml-1" />
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium flex items-baseline gap-2 min-w-0" style={{ color: palette.primaryText }}>
          <span className="min-w-0 flex-1 truncate text-[clamp(11px,2.1vw,16px)]">
            <Highlight text={title} highlight={searchQuery} />
          </span>
          <span
            className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap flex-shrink-0"
            style={{ color: palette.badgeText }}
          >
            {itemLabel}
          </span>
          <span className="text-xs whitespace-nowrap flex-shrink-0" style={{ color: palette.secondaryText }}>
            {resolvedDownloaded}/{resolvedTotal}
          </span>
        </div>
        <div className="leading-tight break-words line-clamp-2 text-[clamp(10px,1.9vw,14px)]" style={{ color: palette.secondaryText }}>
          {onArtistClick && clickableArtists.length > 0 ? (
            clickableArtists.map((artist, index) => (
              <React.Fragment key={`${title}-album-artist-${artist}-${index}`}>
                {index > 0 && <span>, </span>}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onArtistClick(artist);
                  }}
                  className="transition-colors underline-offset-2 hover:underline"
                  style={{ color: palette.secondaryText }}
                >
                  <Highlight text={artist} highlight={searchQuery} />
                </button>
              </React.Fragment>
            ))
          ) : (
            <Highlight text={artistName || 'Unknown artist'} highlight={searchQuery} />
          )}
        </div>
      </div>
      <div className="flex gap-1 opacity-100 transition-opacity mr-2">
        {isExplicit && (
          <span
            className="px-1.5 py-0.5 text-[9px] font-bold rounded-full border"
            style={{ borderColor: palette.badgeText, color: palette.badgeText }}
          >
            E
          </span>
        )}
        <span
          className="px-1.5 py-0.5 text-[9px] font-bold rounded-full uppercase border"
          style={{ borderColor: palette.badgeText, color: palette.badgeText }}
        >
          {qualityLabel}
        </span>
      </div>
      {onToggleExpand && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="w-8 h-8 rounded-full border flex items-center justify-center shadow-sm"
          style={{ borderColor: palette.badgeText, color: palette.primaryText, backgroundColor: 'rgba(255,255,255,0.12)' }}
          aria-label={isExpanded ? 'Свернуть альбом' : 'Развернуть альбом'}
        >
          {isExpanded ? <ChevronDown className="w-4.5 h-4.5" /> : <ChevronRight className="w-4.5 h-4.5" />}
        </button>
      )}
      {onDownload && !isFullyDownloaded && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          className="p-2 rounded-full"
          style={{ color: palette.iconColor }}
        >
          <Download className={`w-4 h-4 ${isDownloading ? 'animate-pulse' : ''}`} />
        </button>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsMenuOpen((prev) => !prev);
        }}
        className="p-2 rounded-full"
        style={{ color: palette.iconColor }}
      >
        <MoreVertical className="w-5 h-5" />
      </button>
      {isMenuOpen && (
        <div className="absolute right-0 top-12 w-48 bg-white rounded-3xl shadow-xl z-10 overflow-hidden border border-violet-100">
          {onEdit && (
            <button
              className="w-full text-left px-4 py-3 text-sm hover:bg-violet-50"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
                setIsMenuOpen(false);
              }}
            >
              Редактировать
            </button>
          )}
          <button
            className="w-full text-left px-4 py-3 text-sm hover:bg-violet-50"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
              setIsMenuOpen(false);
            }}
          >
            {openLabel}
          </button>
          <button
            className="w-full text-left px-4 py-3 text-sm hover:bg-violet-50"
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
              setIsMenuOpen(false);
            }}
          >
            {playLabel}
          </button>
          {onClearCache && (
            <button
              className="w-full text-left px-4 py-3 text-sm hover:bg-rose-50 text-rose-600"
              onClick={(e) => {
                e.stopPropagation();
                onClearCache();
                setIsMenuOpen(false);
              }}
            >
              {clearWithTracksLabel}
            </button>
          )}
          {onRemoveAlbumOnly && (
            <button
              className="w-full text-left px-4 py-3 text-sm hover:bg-amber-50 text-amber-700"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveAlbumOnly();
                setIsMenuOpen(false);
              }}
            >
              {clearGroupOnlyLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
