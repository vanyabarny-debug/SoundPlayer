import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMockServer } from '../store/mockServer';
import { X } from 'lucide-react';

interface AddToAlbumModalProps {
  trackId: string;
  onClose: () => void;
}

export function AddToAlbumModal({ trackId, onClose }: AddToAlbumModalProps) {
  const { albums, updateAlbum, updateTrack } = useMockServer();
  const [search, setSearch] = useState('');

  const myAlbums = Object.values(albums).filter(a => a.type === 'album');
  
  const filteredAlbums = myAlbums.filter(a => 
    a.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddToAlbum = (albumId: string) => {
    const album = albums[albumId];
    if (!album.trackIds.includes(trackId)) {
      updateAlbum(albumId, { trackIds: [...album.trackIds, trackId] });
    }
    updateTrack(trackId, { albumId });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/55 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white/95 rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] text-slate-700">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-xl font-bold">Добавить в альбом</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 border-b border-slate-200">
          <input 
            type="text" 
            placeholder="Поиск альбома..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white text-slate-700 px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>

        <div className="overflow-y-auto p-2">
          {filteredAlbums.length === 0 ? (
            <div className="text-center text-slate-400 py-8">
              Альбомы не найдены
            </div>
          ) : (
            filteredAlbums.map(album => {
              const hasTrack = album.trackIds.includes(trackId);
              return (
                <button
                  key={album.id}
                  onClick={() => handleAddToAlbum(album.id)}
                  disabled={hasTrack}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    hasTrack ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100'
                  }`}
                >
                  <div className="w-12 h-12 bg-slate-100 rounded-[2px] overflow-hidden flex-shrink-0">
                    {album.coverUrl ? (
                      <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-100">
                        <div className="w-6 h-6 text-slate-400">📀</div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-slate-700">{album.title}</div>
                    <div className="text-xs text-slate-400">{album.trackIds.length} треков</div>
                  </div>
                  {hasTrack && (
                    <div className="text-xs text-slate-400">Уже добавлен</div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
