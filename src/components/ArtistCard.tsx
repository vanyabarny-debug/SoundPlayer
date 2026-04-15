import { Heart, Play, User } from 'lucide-react';
import { Artist } from '../store/mockServer';
import { CachedImage } from './CachedImage';
import React from 'react';

interface ArtistCardProps {
  artist: Artist;
  subtitle?: React.ReactNode;
  onClick?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: (e: React.MouseEvent) => void;
}

export function ArtistCard({ artist, subtitle, onClick, isFavorite, onToggleFavorite }: ArtistCardProps) {
  return (
    <div className="group relative" onClick={onClick}>
      <div className="bg-white/80 rounded-[4px] overflow-hidden hover:bg-white transition-colors cursor-pointer">
        <div className="aspect-square bg-violet-50 relative">
          {artist.bannerUrl ? (
            <CachedImage src={artist.bannerUrl} alt={artist.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User className="w-12 h-12 text-slate-400" />
            </div>
          )}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ boxShadow: 'inset 0 -30px 45px rgba(15,23,42,0.22), inset 0 0 20px rgba(255,255,255,0.08)' }}
          />
          <div className="absolute inset-0 bg-slate-900/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Play className="w-10 h-10 text-white fill-current ml-1" />
          </div>
        </div>
        <div className="p-3">
          <div className="font-bold truncate">{artist.name}</div>
          <div className="text-xs text-slate-400 mt-1 line-clamp-2">{subtitle ?? (artist.description?.trim() || 'Без описания')}</div>
        </div>
      </div>
      {onToggleFavorite && (
        <button
          onClick={onToggleFavorite}
          className="absolute top-2 right-2 p-2 bg-white/85 rounded-full text-violet-500 hover:bg-white transition-colors"
        >
          <Heart className={`w-5 h-5 ${isFavorite ? 'fill-rose-500 text-rose-500' : 'text-violet-500'}`} />
        </button>
      )}
    </div>
  );
}
