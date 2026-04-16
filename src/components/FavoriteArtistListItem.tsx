import React from 'react';
import { Heart, Pause, Play, User } from 'lucide-react';
import { CachedImage } from './CachedImage';
import { Artist } from '../store/mockServer';

interface FavoriteArtistListItemProps {
  artist: Artist;
  isActive: boolean;
  isPlaying: boolean;
  colorIndex?: number;
  onOpen: () => void;
  onPlay: () => void;
}

const RAINBOW_PALETTE = [
  [239, 68, 68],
  [249, 115, 22],
  [234, 179, 8],
  [34, 197, 94],
  [59, 130, 246],
  [99, 102, 241],
  [168, 85, 247],
] as const;

const buildPalette = (rgb: readonly [number, number, number]) => {
  const [r, g, b] = rgb;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  const isDark = luminance < 140;
  const primaryText = isDark ? '#ffffff' : '#0f172a';
  const secondaryText = isDark ? 'rgba(255,255,255,0.86)' : 'rgba(15,23,42,0.78)';
  return {
    bg: `rgb(${r}, ${g}, ${b})`,
    border: isDark ? 'rgba(255,255,255,0.32)' : 'rgba(15,23,42,0.20)',
    badge: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.58)',
    primaryText,
    secondaryText,
  };
};

const getRainbowColorByArtist = (seed: string) => {
  const source = seed || 'artist';
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(i);
    hash |= 0;
  }
  return RAINBOW_PALETTE[Math.abs(hash) % RAINBOW_PALETTE.length];
};

export function FavoriteArtistListItem({
  artist,
  isActive,
  isPlaying,
  colorIndex,
  onOpen,
  onPlay,
}: FavoriteArtistListItemProps) {
  const rainbowBase = typeof colorIndex === 'number'
    ? RAINBOW_PALETTE[Math.abs(colorIndex) % RAINBOW_PALETTE.length]
    : getRainbowColorByArtist(artist.id || artist.name);
  const rainbowColor = buildPalette(rainbowBase);
  return (
    <div
      className="flex items-center gap-3 p-2 rounded-3xl cursor-pointer group relative transition-colors"
      style={{ backgroundColor: rainbowColor.bg, border: `1px solid ${rainbowColor.border}` }}
      onClick={onOpen}
    >
      <div className="w-12 h-12 rounded-[2px] overflow-hidden flex-shrink-0 relative" style={{ backgroundColor: rainbowColor.badge }}>
        {artist.bannerUrl ? (
          <CachedImage src={artist.bannerUrl} alt={artist.name} className="w-full h-full object-cover" />
        ) : (
          <User className="w-full h-full p-3 text-slate-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate flex items-center gap-2" style={{ color: rainbowColor.primaryText }}>
          <span>{artist.name}</span>
          <span
            className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap"
            style={{ backgroundColor: rainbowColor.badge, color: rainbowColor.primaryText }}
          >
            Артист
          </span>
          <Heart className="w-3.5 h-3.5 fill-current" style={{ color: rainbowColor.primaryText }} />
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPlay();
        }}
        className="p-2 rounded-full"
        style={{ color: rainbowColor.primaryText }}
        aria-label="Воспроизвести треки артиста"
      >
        {isActive && isPlaying ? (
          <Pause className="w-5 h-5 fill-current" />
        ) : (
          <Play className="w-5 h-5 fill-current ml-0.5" />
        )}
      </button>
    </div>
  );
}
