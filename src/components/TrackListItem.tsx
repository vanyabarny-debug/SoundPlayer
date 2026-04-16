import React from 'react';
import { Music, Play, Pause, MoreVertical, Heart, PlusCircle, Edit2, Trash2 } from 'lucide-react';
import { TrackMetadata, User } from '../store/mockServer';
import { CachedImage } from './CachedImage';
import { escapeRegExp, toStringArray } from '../lib/safe';

const Highlight = ({ text, highlight }: { text: string, highlight: string }) => {
  if (!highlight.trim() || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(highlight)})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === highlight.toLowerCase() ? (
          <span key={i} className="bg-indigo-500/50 text-white rounded px-0.5">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

const getLyricsSnippet = (lyrics: string | undefined, query: string): { snippet: string; highlight: string } | null => {
  if (!lyrics || !query.trim()) return null;

  const normalizedLyrics = lyrics.replace(/\s+/g, ' ').trim();
  const queryTokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (queryTokens.length === 0) return null;

  const lowerLyrics = normalizedLyrics.toLowerCase();
  let bestIndex = -1;
  let matchedToken = '';

  for (const token of queryTokens) {
    const index = lowerLyrics.indexOf(token);
    if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index;
      matchedToken = token;
    }
  }

  if (bestIndex === -1) return null;

  const start = Math.max(0, bestIndex - 28);
  const end = Math.min(normalizedLyrics.length, bestIndex + matchedToken.length + 34);
  const rawSnippet = normalizedLyrics.slice(start, end).trim();
  const snippet = `${start > 0 ? '... ' : ''}${rawSnippet}${end < normalizedLyrics.length ? ' ...' : ''}`;

  return { snippet, highlight: matchedToken };
};

interface TrackListItemProps {
  track: TrackMetadata;
  user: User | null;
  isPlaying: boolean;
  isActive: boolean;
  leadingContent?: React.ReactNode;
  searchQuery: string;
  onPlay: () => void;
  onToggleFavorite: () => void;
  onAddToPlaylist: () => void;
  onAddToAlbum?: () => void;
  onArtistClick?: (artistRef: string) => void;
  onEdit: () => void;
  onDelete?: () => void;
  showMenu?: boolean;
}

export function TrackListItem({ 
  track, user, isPlaying, isActive, leadingContent, searchQuery, 
  onPlay, onToggleFavorite, onAddToPlaylist, onAddToAlbum, onArtistClick, onEdit, onDelete, showMenu = true
}: TrackListItemProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const artistRefs = toStringArray(track.artistIds);
  const artistNames = artistRefs.join(', ');
  const lyricsSnippet = getLyricsSnippet(track.lyrics, searchQuery);

  const isFavorite = user?.favoriteTrackIds?.includes(track.id);
  return (
    <div 
      className="flex items-center gap-3 p-2 hover:bg-slate-200/45 rounded-3xl cursor-pointer group relative transition-colors"
      onClick={onPlay}
    >
      {leadingContent && (
        <div className="w-7 text-center text-slate-400 font-medium flex-shrink-0">
          {leadingContent}
        </div>
      )}
      <div className="w-12 h-12 bg-violet-100 rounded-[2px] overflow-hidden flex-shrink-0 relative">
        {track.coverUrl ? (
          <CachedImage src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
        ) : (
          <Music className="w-full h-full p-3 text-slate-400" />
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
        <div className="font-medium truncate">
          <Highlight text={track.title} highlight={searchQuery} />
        </div>
        <div className="text-sm text-slate-400 truncate">
          {onArtistClick && artistRefs.length > 0 ? (
            <>
              {artistRefs.map((artistRef, index) => (
                <React.Fragment key={`${track.id}-artist-${artistRef}-${index}`}>
                  {index > 0 && <span>, </span>}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onArtistClick(artistRef);
                    }}
                    className="hover:text-violet-500 transition-colors underline-offset-2 hover:underline"
                  >
                    <Highlight text={artistRef} highlight={searchQuery} />
                  </button>
                </React.Fragment>
              ))}
            </>
          ) : (
            <Highlight text={artistNames || 'Unknown artist'} highlight={searchQuery} />
          )}
          {track.producer && <span className="text-slate-400"> · prod. by {track.producer}</span>}
        </div>
        {lyricsSnippet && (
          <div className="text-xs text-slate-500 truncate mt-0.5">
            <span className="text-slate-400 mr-1">Lyrics:</span>
            <Highlight text={lyricsSnippet.snippet} highlight={lyricsSnippet.highlight} />
          </div>
        )}
      </div>
      <div className="flex gap-1 opacity-100 transition-opacity mr-2">
        {track.isExplicit && <span className="px-1.5 py-0.5 bg-violet-100 text-violet-600 text-[9px] font-bold rounded-full">E</span>}
        <span className="px-1.5 py-0.5 bg-violet-100 text-violet-600 text-[9px] font-bold rounded-full uppercase">{track.format}</span>
      </div>
      {showMenu && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setIsMenuOpen(!isMenuOpen);
          }}
          className="p-2 text-slate-400 hover:text-violet-500 rounded-full"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
      )}
      {showMenu && isMenuOpen && (
        <div className="absolute right-0 top-12 w-48 bg-white rounded-3xl shadow-xl z-10 overflow-hidden border border-violet-100">
          <button 
            className="w-full text-left px-4 py-3 text-sm hover:bg-violet-50 flex items-center gap-2"
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); setIsMenuOpen(false); }}
          >
            <Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`} /> {isFavorite ? 'Удалить из избранного' : 'В избранное'}
          </button>
          <button 
            className="w-full text-left px-4 py-3 text-sm hover:bg-violet-50 flex items-center gap-2"
            onClick={(e) => { e.stopPropagation(); onAddToPlaylist(); setIsMenuOpen(false); }}
          >
            <PlusCircle className="w-4 h-4" /> В плейлист
          </button>
          {onAddToAlbum && (
            <button 
              className="w-full text-left px-4 py-3 text-sm hover:bg-violet-50 flex items-center gap-2"
              onClick={(e) => { e.stopPropagation(); onAddToAlbum(); setIsMenuOpen(false); }}
            >
              <PlusCircle className="w-4 h-4" /> В альбом
            </button>
          )}
          <button 
            className="w-full text-left px-4 py-3 text-sm hover:bg-violet-50 flex items-center gap-2"
            onClick={(e) => { e.stopPropagation(); onEdit(); setIsMenuOpen(false); }}
          >
            <Edit2 className="w-4 h-4" /> Редактировать
          </button>
          {onDelete && (
            <button
              className="w-full text-left px-4 py-3 text-sm hover:bg-rose-50 text-rose-600 flex items-center gap-2"
              onClick={(e) => { e.stopPropagation(); onDelete(); setIsMenuOpen(false); }}
            >
              <Trash2 className="w-4 h-4" /> Удалить из приложения
            </button>
          )}
        </div>
      )}
    </div>
  );
}
