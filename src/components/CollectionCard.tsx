import { Disc3, ListMusic, Play } from 'lucide-react';
import { CachedImage } from './CachedImage';
import React from 'react';

interface CollectionCardProps {
  title: React.ReactNode;
  subtitle: React.ReactNode;
  coverUrl?: string;
  type: 'album' | 'playlist';
}

export function CollectionCard({ title, subtitle, coverUrl, type }: CollectionCardProps) {
  return (
    <div className="group bg-white/80 rounded-[4px] overflow-hidden hover:bg-white transition-colors">
      <div className="aspect-square bg-violet-50 relative">
        {coverUrl ? (
          <CachedImage src={coverUrl} alt={typeof title === 'string' ? title : type} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {type === 'album' ? <Disc3 className="w-12 h-12 text-slate-400" /> : <ListMusic className="w-12 h-12 text-slate-400" />}
          </div>
        )}
        <div className="absolute inset-0 bg-slate-900/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Play className="w-10 h-10 text-white fill-current ml-1" />
        </div>
      </div>
      <div className="p-3">
        <div className="font-bold truncate">{title}</div>
        <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider truncate">{subtitle}</div>
      </div>
    </div>
  );
}
