import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMockServer } from '../store/mockServer';
import { X, Plus, Search, Music, Disc3 } from 'lucide-react';

export function LinkToArtistModal({ artistId, artistName, onClose }: { artistId: string, artistName: string, onClose: () => void }) {
  const { tracks, albums, updateTrack, updateAlbum } = useMockServer();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'tracks' | 'albums'>('tracks');

  const allTracks = Object.values(tracks);
  const allAlbums = Object.values(albums);

  const filteredTracks = allTracks.filter(t => 
    !t.artistIds.includes(artistName) && 
    (t.title.toLowerCase().includes(search.toLowerCase()) || t.artistIds.join(' ').toLowerCase().includes(search.toLowerCase()))
  );

  const filteredAlbums = allAlbums.filter(a => 
    !(a.artistIds || []).includes(artistId) && 
    a.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddTrack = (trackId: string) => {
    const track = tracks[trackId];
    updateTrack(trackId, { artistIds: [...track.artistIds, artistName] });
  };

  const handleAddAlbum = (albumId: string) => {
    const album = albums[albumId];
    const artistIds = album.artistIds || [];
    if (!artistIds.includes(artistId)) {
      updateAlbum(albumId, { artistIds: [...artistIds, artistId] });
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/55 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white/95 rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] text-slate-700">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-xl font-bold">Добавить к артисту</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-4 border-b border-slate-200">
          <div className="flex gap-2 mb-4">
            <button 
              onClick={() => setTab('tracks')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${tab === 'tracks' ? 'bg-violet-500 text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              Треки
            </button>
            <button 
              onClick={() => setTab('albums')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${tab === 'albums' ? 'bg-violet-500 text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              Альбомы
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder={`Поиск ${tab === 'tracks' ? 'треков' : 'альбомов'}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white text-slate-700 pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </div>
        </div>

        <div className="overflow-y-auto p-4 flex-1">
          {tab === 'tracks' && (
            <div className="space-y-2">
              {filteredTracks.map(track => (
                <div key={track.id} className="flex items-center gap-3 p-2 bg-slate-100/80 rounded-xl">
                  <div className="w-10 h-10 bg-slate-200 rounded-[2px] overflow-hidden flex-shrink-0">
                    {track.coverUrl ? (
                      <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
                    ) : (
                      <Music className="w-full h-full p-2 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-700 truncate">{track.title}</div>
                    <div className="text-sm text-slate-400 truncate">{track.artistIds.join(', ')}</div>
                  </div>
                  <button 
                    onClick={() => handleAddTrack(track.id)}
                    className="p-2 text-slate-400 hover:text-violet-500 hover:bg-white rounded-full transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              ))}
              {filteredTracks.length === 0 && (
                <div className="text-center text-slate-400 py-4">Ничего не найдено</div>
              )}
            </div>
          )}

          {tab === 'albums' && (
            <div className="space-y-2">
              {filteredAlbums.map(album => (
                <div key={album.id} className="flex items-center gap-3 p-2 bg-slate-100/80 rounded-xl">
                  <div className="w-10 h-10 bg-slate-200 rounded-[2px] overflow-hidden flex-shrink-0">
                    {album.coverUrl ? (
                      <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover" />
                    ) : (
                      <Disc3 className="w-full h-full p-2 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-700 truncate">{album.title}</div>
                    <div className="text-sm text-slate-400 truncate uppercase">{album.status || 'Альбом'}</div>
                  </div>
                  <button 
                    onClick={() => handleAddAlbum(album.id)}
                    className="p-2 text-slate-400 hover:text-violet-500 hover:bg-white rounded-full transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              ))}
              {filteredAlbums.length === 0 && (
                <div className="text-center text-slate-400 py-4">Ничего не найдено</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
