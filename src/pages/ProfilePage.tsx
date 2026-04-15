import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useMockServer } from '../store/mockServer';
import { usePlayerStore } from '../store/playerStore';
import { Link } from 'react-router-dom';
import { LogOut, Edit2, ExternalLink, CheckCircle2 } from 'lucide-react';
import { CachedImage } from '../components/CachedImage';

const SOUNDCLOUD_CLIENT_ID_STORAGE_KEY = 'soundcloud-client-id';

export function ProfilePage() {
  const { currentUserId, logout } = useAuthStore();
  const { users, updateUser, playlists } = useMockServer();
  
  const user = currentUserId ? users[currentUserId] : null;
  
  const [isEditing, setIsEditing] = useState(false);
  const [emoji, setEmoji] = useState(user?.avatarEmoji || '🎵');
  const [gradient, setGradient] = useState(user?.avatarGradient || 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)');
  const [soundCloudClientId, setSoundCloudClientId] = useState('');
  const [isSaved, setIsSaved] = useState(false);

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
  const isConnected = useMemo(() => soundCloudClientId.trim().length > 0, [soundCloudClientId]);

  useEffect(() => {
  }, [user.id, isEditing]);
  
  useEffect(() => {
    const savedValue = window.localStorage.getItem(SOUNDCLOUD_CLIENT_ID_STORAGE_KEY) || '';
    setSoundCloudClientId(savedValue);
  }, []);

  const handleSaveSoundCloudClientId = () => {
    window.localStorage.setItem(SOUNDCLOUD_CLIENT_ID_STORAGE_KEY, soundCloudClientId.trim());
    setIsSaved(true);
    window.setTimeout(() => setIsSaved(false), 1500);
  };

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
        <div className="bg-white/80 border border-violet-100 p-6 rounded-3xl mb-8">
          <div className="flex items-center justify-between mb-3 gap-3">
            <h3 className="text-lg font-bold">Интеграция SoundCloud</h3>
            {isConnected ? (
              <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Подключено</span>
            ) : (
              <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold">Не подключено</span>
            )}
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Вставьте ваш SoundCloud Client ID один раз, и поиск начнет работать во вкладке Обзор.
          </p>
          <div className="space-y-3">
            <input
              type="text"
              value={soundCloudClientId}
              onChange={(e) => setSoundCloudClientId(e.target.value)}
              placeholder="Введите SoundCloud Client ID..."
              className="w-full bg-violet-50 text-slate-700 px-4 py-3 rounded-xl border border-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
            <button
              onClick={handleSaveSoundCloudClientId}
              className="w-full bg-violet-500 text-white font-bold py-3 rounded-xl hover:bg-violet-600 transition-colors"
            >
              Сохранить Client ID
            </button>
            {isSaved && (
              <div className="text-sm text-emerald-600 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Сохранено. Поиск SoundCloud готов.
              </div>
            )}
          </div>
          <div className="mt-4 p-3 rounded-xl bg-violet-50 border border-violet-100 text-sm text-slate-600">
            <div className="font-semibold mb-1">Как получить Client ID</div>
            <ol className="list-decimal list-inside space-y-1">
              <li>Откройте SoundCloud for Developers.</li>
              <li>Создайте приложение и скопируйте Client ID.</li>
              <li>Вставьте его выше и нажмите Сохранить.</li>
            </ol>
            <a
              href="https://developers.soundcloud.com/"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-violet-600 hover:text-violet-700 font-medium"
            >
              Открыть портал разработчика
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
