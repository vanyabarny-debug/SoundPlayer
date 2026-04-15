import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload } from 'lucide-react';
import { useMockServer, TrackMetadata } from '../store/mockServer';
import { v4 as uuidv4 } from 'uuid';
import { saveImageFile } from '../lib/db';
import { CachedImage } from './CachedImage';

export function EditTrackModal({ track, onClose }: { track: TrackMetadata, onClose: () => void }) {
  const { updateTrack } = useMockServer();
  
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artistIds.join(', '));
  const [isExplicit, setIsExplicit] = useState(track.isExplicit);
  const [isSingle, setIsSingle] = useState(track.isSingle);
  const [producer, setProducer] = useState(track.producer || '');
  const [features, setFeatures] = useState(track.features?.join(', ') || '');
  const [lyrics, setLyrics] = useState(track.lyrics || '');
  const [albumId, setAlbumId] = useState(track.albumId || '');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(track.coverUrl || null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let coverId = track.coverUrl;
    if (coverFile) {
      coverId = uuidv4();
      await saveImageFile(coverId, coverFile);
    }

    updateTrack(track.id, {
      title,
      artistIds: artist.split(',').map(a => a.trim()).filter(Boolean),
      isExplicit,
      isSingle,
      producer,
      features: features.split(',').map(f => f.trim()).filter(Boolean),
      lyrics,
      albumId: albumId || undefined,
      coverUrl: coverId || undefined,
    });

    // Auto-create artists if they don't exist
    const artistNames = artist.split(',').map(a => a.trim()).filter(Boolean);
    const existingArtists = Object.values(useMockServer.getState().artists);
    artistNames.forEach(name => {
      if (!existingArtists.find(a => a.name === name)) {
        useMockServer.getState().addArtist({
          id: uuidv4(),
          name,
          description: '',
        });
      }
    });

    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-zinc-900 w-full max-w-md rounded-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-xl font-bold">Редактировать трек</h2>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="overflow-y-auto p-4 flex-1">
          <form id="edit-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Название трека</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full bg-zinc-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/20"
                required
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Артист (через запятую)</label>
              <input
                type="text"
                value={artist}
                onChange={e => setArtist(e.target.value)}
                className="w-full bg-zinc-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/20"
                required
              />
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isExplicit} 
                  onChange={e => setIsExplicit(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-indigo-500 focus:ring-indigo-500"
                />
                <span className="text-sm text-zinc-300">Ненормативная лексика (E)</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isSingle} 
                  onChange={e => setIsSingle(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-indigo-500 focus:ring-indigo-500"
                />
                <span className="text-sm text-zinc-300">Сингл</span>
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Продюсер</label>
              <input
                type="text"
                value={producer}
                onChange={e => setProducer(e.target.value)}
                className="w-full bg-zinc-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Фиты (через запятую)</label>
              <input
                type="text"
                value={features}
                onChange={e => setFeatures(e.target.value)}
                className="w-full bg-zinc-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>

            <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Текст песни</label>
              <textarea
                value={lyrics}
                onChange={e => setLyrics(e.target.value)}
                rows={4}
                className="w-full bg-zinc-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/20 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Обложка трека</label>
              <div 
                className="w-full h-32 bg-zinc-800 rounded-xl border-2 border-dashed border-zinc-700 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-700/50 transition-colors relative overflow-hidden"
                onClick={() => coverInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={coverInputRef} 
                  onChange={handleCoverChange} 
                  accept="image/*" 
                  className="hidden" 
                />
                {coverPreview ? (
                  <CachedImage src={coverPreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-zinc-500 mb-2" />
                    <span className="text-xs font-medium text-zinc-400">Выбрать фото</span>
                  </>
                )}
              </div>
            </div>
          </form>
        </div>
        
        <div className="p-4 border-t border-zinc-800">
          <button
            type="submit"
            form="edit-form"
            className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-zinc-200 transition-colors"
          >
            Сохранить изменения
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
