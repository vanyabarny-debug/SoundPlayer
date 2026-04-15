import React from 'react';
import { Disc3, MoreVertical, Pause, Play } from 'lucide-react';
import { CachedImage } from './CachedImage';
import { escapeRegExp } from '../lib/safe';

interface AlbumTrackListItemProps {
  title: string;
  artistName: string;
  coverUrl?: string;
  trackCount: number;
  qualityLabel: string;
  isExplicit: boolean;
  isActive: boolean;
  isPlaying: boolean;
  searchQuery: string;
  onOpen: () => void;
  onPlay: () => void;
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
  searchQuery,
  onOpen,
  onPlay,
}: AlbumTrackListItemProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const clickTimeoutRef = React.useRef<number | null>(null);

  const handleRowClick = () => {
    if (clickTimeoutRef.current) {
      window.clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      onOpen();
      return;
    }
    clickTimeoutRef.current = window.setTimeout(() => {
      onPlay();
      clickTimeoutRef.current = null;
    }, 220);
  };

  return (
    <div
      className="flex items-center gap-3 p-2 hover:bg-slate-200/45 rounded-3xl cursor-pointer group relative transition-colors"
      onClick={handleRowClick}
    >
      <div className="w-12 h-12 bg-violet-100 rounded-[2px] overflow-hidden flex-shrink-0 relative">
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
        <div className="font-medium truncate flex items-center gap-2">
          <Highlight text={title} highlight={searchQuery} />
          <span className="text-xs text-slate-400 whitespace-nowrap">· {trackCount} треков</span>
        </div>
        <div className="text-sm text-slate-400 truncate">
          <Highlight text={artistName || 'Unknown artist'} highlight={searchQuery} />
        </div>
      </div>
      <div className="flex gap-1 opacity-100 transition-opacity mr-2">
        {isExplicit && <span className="px-1.5 py-0.5 bg-violet-100 text-violet-600 text-[9px] font-bold rounded-full">E</span>}
        <span className="px-1.5 py-0.5 bg-violet-100 text-violet-600 text-[9px] font-bold rounded-full uppercase">{qualityLabel}</span>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsMenuOpen((prev) => !prev);
        }}
        className="p-2 text-slate-400 hover:text-violet-500 rounded-full"
      >
        <MoreVertical className="w-5 h-5" />
      </button>
      {isMenuOpen && (
        <div className="absolute right-0 top-12 w-48 bg-white rounded-3xl shadow-xl z-10 overflow-hidden border border-violet-100">
          <button
            className="w-full text-left px-4 py-3 text-sm hover:bg-violet-50"
            onClick={(e) => {
              e.stopPropagation();
              clickTimeoutRef.current && window.clearTimeout(clickTimeoutRef.current);
              clickTimeoutRef.current = null;
              onOpen();
              setIsMenuOpen(false);
            }}
          >
            Открыть альбом
          </button>
          <button
            className="w-full text-left px-4 py-3 text-sm hover:bg-violet-50"
            onClick={(e) => {
              e.stopPropagation();
              clickTimeoutRef.current && window.clearTimeout(clickTimeoutRef.current);
              clickTimeoutRef.current = null;
              onPlay();
              setIsMenuOpen(false);
            }}
          >
            Воспроизвести альбом
          </button>
        </div>
      )}
    </div>
  );
}
