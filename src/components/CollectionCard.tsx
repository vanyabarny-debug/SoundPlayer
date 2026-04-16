import { Disc3, ListMusic, Play } from 'lucide-react';
import { CachedImage } from './CachedImage';
import React from 'react';

interface CollectionCardProps {
  title: React.ReactNode;
  subtitle: React.ReactNode;
  coverUrl?: string;
  type: 'album' | 'playlist';
  onClick?: () => void;
  imageActions?: React.ReactNode;
  footerActions?: React.ReactNode;
}

export function CollectionCard({ title, subtitle, coverUrl, type, onClick, imageActions, footerActions }: CollectionCardProps) {
  return (
    <div
      className="group bg-white rounded-[4px] overflow-hidden transition-colors"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <div className="aspect-square bg-violet-50 relative">
        {coverUrl ? (
          <CachedImage src={coverUrl} alt={typeof title === 'string' ? title : type} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {type === 'album' ? <Disc3 className="w-12 h-12 text-slate-400" /> : <ListMusic className="w-12 h-12 text-slate-400" />}
          </div>
        )}
        <div className="absolute inset-0 bg-slate-900/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-out">
          <Play className="w-10 h-10 text-white fill-current ml-1" />
        </div>
        {imageActions ? (
          <div
            className="absolute right-2 top-2 z-20 flex items-center gap-1"
            onClick={(event) => event.stopPropagation()}
          >
            {imageActions}
          </div>
        ) : null}
      </div>
      <div className="p-3">
        <div className="font-bold leading-tight break-words line-clamp-2 text-[clamp(11px,2.3vw,17px)]">
          {title}
        </div>
        <div className="mt-1 flex items-start justify-between gap-2">
          <div className="text-slate-400 leading-tight break-words text-[clamp(9px,1.8vw,12px)] flex-1 min-w-0">
            {subtitle}
          </div>
          {footerActions ? (
            <div className="flex items-center gap-1 flex-shrink-0" onClick={(event) => event.stopPropagation()}>
              {footerActions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
