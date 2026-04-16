import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMockServer } from '../store/mockServer';
import { useAuthStore } from '../store/authStore';
import { X, Plus } from 'lucide-react';

interface AddToPlaylistModalProps {
  trackId: string;
  onClose: () => void;
}

export function AddToPlaylistModal({ trackId, onClose }: AddToPlaylistModalProps) {
  const { playlists, updatePlaylist, addPlaylist } = useMockServer();
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const [search, setSearch] = useState('');
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');

  const myPlaylists = Object.values(playlists).filter((p) => p.ownerId === currentUserId);
  
  const filteredPlaylists = myPlaylists.filter(p => 
    p.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddToPlaylist = (playlistId: string) => {
    const playlist = playlists[playlistId];
    if (!playlist.trackIds.includes(trackId)) {
      updatePlaylist(playlistId, { trackIds: [...playlist.trackIds, trackId] });
    }
    onClose();
  };
  const handleCreateAndAdd = () => {
    if (!currentUserId || !newPlaylistTitle.trim()) return;
    const playlistId = `pl-${Date.now()}`;
    addPlaylist({
      id: playlistId,
      title: newPlaylistTitle.trim(),
      ownerId: currentUserId,
      trackIds: [trackId],
      type: 'playlist',
    });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/55 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white/95 rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] text-slate-700">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-xl font-bold">Добавить в плейлист</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 border-b border-slate-200">
          <input 
            type="text" 
            placeholder="Поиск плейлиста..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white text-slate-700 px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              placeholder="Новый плейлист..."
              value={newPlaylistTitle}
              onChange={(e) => setNewPlaylistTitle(e.target.value)}
              className="flex-1 bg-white text-slate-700 px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
            <button
              type="button"
              onClick={handleCreateAndAdd}
              disabled={!newPlaylistTitle.trim()}
              className="px-3 py-2 rounded-xl bg-violet-600 text-white disabled:opacity-50"
            >
              Создать
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-2">
          {filteredPlaylists.length === 0 ? (
            <div className="text-center text-slate-400 py-8">
              Плейлисты не найдены
            </div>
          ) : (
            filteredPlaylists.map(playlist => {
              const hasTrack = playlist.trackIds.includes(trackId);
              return (
                <button
                  key={playlist.id}
                  onClick={() => handleAddToPlaylist(playlist.id)}
                  disabled={hasTrack}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    hasTrack ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100'
                  }`}
                >
                  <div className="w-12 h-12 bg-slate-100 rounded-[2px] overflow-hidden flex-shrink-0">
                    {playlist.coverUrl ? (
                      <img src={playlist.coverUrl} alt={playlist.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-100">
                        <Plus className="w-6 h-6 text-slate-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-slate-700">{playlist.title}</div>
                    <div className="text-xs text-slate-400">{playlist.trackIds.length} треков</div>
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
