import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useMockServer } from '../store/mockServer';
import { useAuthStore } from '../store/authStore';

interface CreatePlaylistModalProps {
  onClose: () => void;
  onCreated?: (playlistId: string) => void;
}

export function CreatePlaylistModal({ onClose, onCreated }: CreatePlaylistModalProps) {
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { addPlaylist, users, updateUser } = useMockServer();
  const { currentUserId } = useAuthStore();

  const handleCreate = async () => {
    if (!title.trim() || !currentUserId) return;
    
    setIsLoading(true);
    try {
      const playlistId = `pl-${Date.now()}`;
      addPlaylist({
        id: playlistId,
        title: title.trim(),
        ownerId: currentUserId,
        trackIds: [],
        type: 'playlist',
      });
      const user = users[currentUserId];
      if (user) {
        const favoritePlaylistIds = user.favoritePlaylistIds || [];
        if (!favoritePlaylistIds.includes(playlistId)) {
          updateUser(user.id, { favoritePlaylistIds: [...favoritePlaylistIds, playlistId] });
        }
      }
      onCreated?.(playlistId);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-md border border-zinc-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Создать плейлист</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <input
          type="text"
          placeholder="Название плейлиста"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleCreate()}
          autoFocus
          className="w-full bg-zinc-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/20 mb-6"
        />

        <div className="flex gap-3">
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
    </div>
  );
}
