import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useMockServer } from '../store/mockServer';
import { usePlayerStore } from '../store/playerStore';
import { Link } from 'react-router-dom';
import { LogOut, Edit2, Play, Music, ListMusic, Disc3 } from 'lucide-react';
import { CachedImage } from '../components/CachedImage';

export function ProfilePage() {
  const { currentUserId, logout } = useAuthStore();
  const { users, updateUser, tracks, playlists } = useMockServer();
  const { playTrack } = usePlayerStore();
  
  const user = currentUserId ? users[currentUserId] : null;
  
  const [isEditing, setIsEditing] = useState(false);
  const [emoji, setEmoji] = useState(user?.avatarEmoji || '🎵');
  const [gradient, setGradient] = useState(user?.avatarGradient || 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)');

  if (!user) return null;

  const handleSave = () => {
    updateUser(user.id, { avatarEmoji: emoji, avatarGradient: gradient });
    setIsEditing(false);
  };

  const gradients = [
    'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
    'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)',
    'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  ];

  const favoritePlaylists = user.favoritePlaylistIds?.map(id => playlists[id]).filter(Boolean) || [];

  useEffect(() => {
  }, [user.id, isEditing]);

  return (
    <div className="p-4 pt-8 h-full overflow-y-auto scrollbar-hide">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Профиль</h1>
        <button onClick={logout} className="p-2 text-slate-400 hover:text-violet-500">
          <LogOut className="w-6 h-6" />
        </button>
      </div>

      <div className="flex flex-col items-center mb-8">
        <div 
          className="w-32 h-32 rounded-full flex items-center justify-center text-5xl mb-4 relative group"
          style={{ background: isEditing ? gradient : user.avatarGradient }}
        >
          {isEditing ? emoji : user.avatarEmoji}
          
          {!isEditing && (
            <button 
              onClick={() => setIsEditing(true)}
              className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full flex items-center justify-center border-2 border-violet-100 text-violet-500"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
        </div>
        
        <h2 className="text-2xl font-bold">{user.username}</h2>
      </div>

      {isEditing && (
        <div className="bg-white/80 border border-violet-100 p-6 rounded-3xl mb-8">
          <h3 className="text-lg font-bold mb-4">Редактировать аватар</h3>
          
          <div className="mb-4">
            <label className="block text-sm text-slate-400 mb-2">Эмодзи</label>
            <input 
              type="text" 
              value={emoji} 
              onChange={e => setEmoji(e.target.value)}
              maxLength={2}
              className="w-full bg-violet-50 text-slate-700 px-4 py-3 rounded-xl text-center text-2xl border border-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm text-slate-400 mb-2">Фон</label>
            <div className="grid grid-cols-3 gap-3">
              {gradients.map(g => (
                <button
                  key={g}
                  onClick={() => setGradient(g)}
                  className={`h-12 rounded-xl border-2 ${gradient === g ? 'border-violet-500' : 'border-transparent'}`}
                  style={{ background: g }}
                />
              ))}
            </div>
          </div>

          <button 
            onClick={handleSave}
            className="w-full bg-violet-500 text-white font-bold py-3 rounded-xl hover:bg-violet-600 transition-colors"
          >
            Сохранить
          </button>
        </div>
      )}
      
      <div>
        
      </div>
    </div>
  );
}
