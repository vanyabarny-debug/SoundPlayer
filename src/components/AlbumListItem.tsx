import { Disc3, Play } from 'lucide-react';
import { CachedImage } from './CachedImage';

interface AlbumListItemProps {
  title: string;
  subtitle?: string;
  coverUrl?: string;
  trackCount: number;
  onOpen: () => void;
  onPlay?: () => void;
}

export function AlbumListItem({ title, subtitle, coverUrl, trackCount, onOpen, onPlay }: AlbumListItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="w-full flex items-center gap-3 p-2.5 bg-white/75 border rounded-2xl shadow-sm shadow-violet-100/40 hover:bg-white transition-colors text-left"
      style={{ borderColor: 'var(--accent-soft-strong)' }}
    >
      <div className="w-12 h-12 bg-violet-100 rounded-[2px] overflow-hidden flex-shrink-0">
        {coverUrl ? (
          <CachedImage src={coverUrl} alt={title} className="w-full h-full object-cover" />
        ) : (
          <Disc3 className="w-full h-full p-3 text-slate-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-slate-700 truncate">{title}</div>
        <div className="text-xs text-slate-400 truncate uppercase tracking-wide">
          {subtitle || 'Альбом'} · {trackCount} треков
        </div>
      </div>
      {onPlay && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          className="p-2 text-slate-500 hover:text-violet-500 rounded-full"
        >
          <Play className="w-5 h-5 fill-current" />
        </button>
      )}
    </div>
  );
}
