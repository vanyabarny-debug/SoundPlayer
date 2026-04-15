import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useMockServer } from '../store/mockServer';
import { v4 as uuidv4 } from 'uuid';
import { Eye, EyeOff } from 'lucide-react';

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const login = useAuthStore(state => state.login);
  const { users, addUser } = useMockServer();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isLogin) {
      const user = Object.values(users).find(u => u.username === username && u.passwordHash === password);
      if (user) {
        login(user.id);
      } else {
        alert('Неверный логин или пароль');
      }
    } else {
      if (Object.values(users).some(u => u.username === username)) {
        alert('Пользователь уже существует');
        return;
      }
      const newUser = {
        id: uuidv4(),
        username,
        passwordHash: password,
        avatarEmoji: '🎵',
        avatarGradient: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
        favoriteTrackIds: [],
      };
      addUser(newUser);
      login(newUser.id);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-zinc-900 p-8 rounded-3xl border border-zinc-800">
        <h1 className="text-3xl font-bold text-white mb-8 text-center">
          {isLogin ? 'Вход' : 'Регистрация'}
        </h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="Логин"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-zinc-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/20"
              required
            />
          </div>
          
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Пароль"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-zinc-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/20"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <button
            type="submit"
            className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-zinc-200 transition-colors mt-4"
          >
            {isLogin ? 'Войти' : 'Создать аккаунт'}
          </button>
        </form>

        <button
          onClick={() => setIsLogin(!isLogin)}
          className="w-full text-zinc-400 text-sm mt-6 hover:text-white transition-colors"
        >
          {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
      </div>
    </div>
  );
}
