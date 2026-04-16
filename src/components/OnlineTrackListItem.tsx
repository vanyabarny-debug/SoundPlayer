import React from 'react';
import { Check, Download, Loader2, Pause, Play } from 'lucide-react';
import { CachedImage } from './CachedImage';
import { splitArtistField } from '../lib/artistRouting';

export type OnlineTrackItemData = {
  id: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  previewUrl?: string;
};

interface OnlineTrackListItemProps {
  track: OnlineTrackItemData;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  extra?: React.ReactNode;
  isPlaying: boolean;
  isActive: boolean;
  canDownload?: boolean;
  isDownloading?: boolean;
  isDownloaded?: boolean;
  emphasizeDownloaded?: boolean;
  onPlay: () => void;
  onDownload?: () => void;
  onArtistClick?: (artistName: string) => void;
  onOpenRecommendations?: () => void;
}

export function OnlineTrackListItem({
  track,
  title,
  subtitle,
  extra,
  isPlaying,
  isActive,
  canDownload = false,
  isDownloading = false,
  isDownloaded = false,
  emphasizeDownloaded = false,
  onPlay,
  onDownload,
  onArtistClick,
  onOpenRecommendations,
}: OnlineTrackListItemProps) {
  const showPause = isActive && isPlaying;
  const artistParts = splitArtistField(track.artist);
  const clickableArtists = Array.from(new Set([...artistParts.primaryArtists, ...artistParts.featuringArtists]));
  const rowToneClass = emphasizeDownloaded && isDownloaded
    ? 'bg-white/85 border border-violet-200/70 shadow-sm shadow-violet-100/60 hover:bg-white'
    : 'bg-white/45 hover:bg-slate-200/45';

  return (
    <div className={`w-full text-left flex items-center gap-3 p-2 rounded-3xl transition-colors group relative ${rowToneClass}`}>
      <div
        onClick={onPlay}
        className="w-12 h-12 bg-violet-100 rounded-[2px] overflow-hidden flex-shrink-0 relative cursor-pointer"
      >
        {track.artworkUrl ? (
          <CachedImage src={track.artworkUrl} alt={track.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-violet-50" />
        )}
        <div className="absolute inset-0 bg-slate-900/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          {showPause ? (
            <Pause className="w-6 h-6 text-white fill-current" />
          ) : (
            <Play className="w-6 h-6 text-white fill-current ml-1" />
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{title ?? track.title}</div>
        {onArtistClick ? (
          <div className="text-sm text-slate-400 truncate">
            {clickableArtists.length > 0 ? (
              clickableArtists.map((artistName, index) => (
                <React.Fragment key={`${track.id}-online-artist-${artistName}-${index}`}>
                  {index > 0 && <span>, </span>}
                  <button
                    type="button"
                    onClick={() => onArtistClick(artistName)}
                    className="hover:text-violet-500 transition-colors underline-offset-2 hover:underline"
                  >
                    {artistName}
                  </button>
                </React.Fragment>
              ))
            ) : (
              <button
                type="button"
                onClick={() => onArtistClick(track.artist)}
                className="hover:text-violet-500 transition-colors underline-offset-2 hover:underline"
              >
                {subtitle ?? track.artist}
              </button>
            )}
          </div>
        ) : (
          <div className="text-sm text-slate-400 truncate">{subtitle ?? track.artist}</div>
        )}
        {extra}
      </div>

      {canDownload && onDownload && (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={onDownload}
            disabled={isDownloading}
            aria-label="Скачать и обработать трек"
            className={`inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
              isDownloaded
                ? 'text-violet-600 hover:text-violet-700'
                : 'text-violet-600 hover:text-violet-700'
            }`}
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isDownloaded ? (
              <Check className="w-4 h-4" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
