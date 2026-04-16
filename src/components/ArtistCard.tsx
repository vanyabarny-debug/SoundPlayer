import { Heart, Play, User } from 'lucide-react';
import { Artist } from '../store/mockServer';
import { CachedImage } from './CachedImage';
import React from 'react';

interface ArtistCardProps {
  artist: Artist;
  subtitle?: React.ReactNode;
  hideSubtitle?: boolean;
  onClick?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: (e: React.MouseEvent) => void;
}

export function ArtistCard({ artist, subtitle, hideSubtitle = false, onClick, isFavorite, onToggleFavorite }: ArtistCardProps) {
  return (
    <div className="group relative" onClick={onClick}>
      <div className="bg-white rounded-[4px] overflow-hidden transition-colors cursor-pointer">
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
          <div className="absolute inset-0 bg-slate-900/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-out">
            <Play className="w-10 h-10 text-white fill-current ml-1" />
          </div>
        </div>
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="font-bold leading-tight break-words line-clamp-2 text-[clamp(11px,2.3vw,17px)] flex-1 min-w-0">
              {artist.name}
            </div>
            {onToggleFavorite && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleFavorite(event);
                }}
                className="p-1 text-violet-500 hover:text-rose-500 transition-colors flex-shrink-0"
                aria-label="Добавить в избранные артисты"
              >
                <Heart className={`w-5 h-5 ${isFavorite ? 'fill-rose-500 text-rose-500' : 'text-violet-500'}`} />
              </button>
            )}
          </div>
          {!hideSubtitle && (
            <div className="text-xs text-slate-400 mt-1 line-clamp-2">{subtitle ?? (artist.description?.trim() || 'Без описания')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
