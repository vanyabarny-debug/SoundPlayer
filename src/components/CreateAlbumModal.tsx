import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload } from 'lucide-react';
import { useMockServer } from '../store/mockServer';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import { saveImageFile } from '../lib/db';
import { CachedImage } from './CachedImage';

interface CreateAlbumModalProps {
  onClose: () => void;
  onCreated?: (albumId: string) => void;
}

export function CreateAlbumModal({ onClose, onCreated }: CreateAlbumModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { addAlbum, users, updateUser } = useMockServer();
  const { currentUserId } = useAuthStore();
  const coverInputRef = useRef<HTMLInputElement>(null);

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const handleCreate = async () => {
    if (!title.trim() || !currentUserId) return;
    
    setIsLoading(true);
    try {
      let coverId = '';
      if (coverFile) {
        coverId = uuidv4();
        await saveImageFile(coverId, coverFile);
      }

      const albumId = `alb-${Date.now()}`;
      addAlbum({
        id: albumId,
        title: title.trim(),
        description: description.trim(),
        ownerId: currentUserId,
        trackIds: [],
        type: 'album',
        artistIds: [],
        coverUrl: coverId || undefined,
        status: status.trim() || undefined,
      });
      const user = users[currentUserId];
      if (user) {
        const favoriteAlbumIds = user.favoriteAlbumIds || [];
        if (!favoriteAlbumIds.includes(albumId)) {
          updateUser(user.id, { favoriteAlbumIds: [...favoriteAlbumIds, albumId] });
        }
      }
      onCreated?.(albumId);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-zinc-900 w-full max-w-md rounded-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-xl font-bold">Создать альбом</h2>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="overflow-y-auto p-4 flex-1">
          <form id="create-album-form" className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Обложка альбома</label>
              <div 
                className="w-full h-40 bg-zinc-800 rounded-xl border-2 border-dashed border-zinc-700 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-700/50 transition-colors relative overflow-hidden"
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
                    <span className="text-xs font-medium text-zinc-400">Выбрать обложку</span>
                  </>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Название альбома</label>
              <input
                type="text"
                placeholder="Название альбома"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleCreate()}
                autoFocus
                className="w-full bg-zinc-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Описание</label>
              <textarea
                placeholder="Описание альбома"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-zinc-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/20 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Статус</label>
              <input
                type="text"
                placeholder="Например: Новый, В работе, Готов"
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full bg-zinc-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>
          </form>
        </div>
        
        <div className="p-4 border-t border-zinc-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors font-medium"
          >
            Отмена
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || isLoading}
            className="flex-1 px-4 py-2 bg-white text-black rounded-lg hover:bg-white/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
