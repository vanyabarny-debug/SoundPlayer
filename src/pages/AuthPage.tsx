import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useMockServer } from '../store/mockServer';
import { v4 as uuidv4 } from 'uuid';
import { Download, Eye, EyeOff } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  
  const login = useAuthStore(state => state.login);
  const { users, addUser } = useMockServer();

  useEffect(() => {
    const standaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standaloneMode);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (installPromptEvent) {
      await installPromptEvent.prompt();
      await installPromptEvent.userChoice;
      setInstallPromptEvent(null);
      return;
    }

    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const message = isIOS
      ? 'Установка на iPhone/iPad: нажмите "Поделиться" в Safari и выберите "На экран Домой".'
      : 'Установка через браузер: откройте меню браузера и выберите "Установить приложение" / "Install app".';
    alert(message);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedUsername = username.trim();
    const normalizedPassword = password.trim();
    const usersList = Object.values(users ?? {});

    if (!normalizedUsername || !normalizedPassword) {
      alert('Введите логин и пароль');
      return;
    }

    if (isLogin) {
      const user = usersList.find(
        (u) => u.username === normalizedUsername && u.passwordHash === normalizedPassword
      );
      if (user?.id) {
        login(user.id);
      } else {
        alert('Неверный логин или пароль');
      }
    } else {
      if (usersList.some((u) => u.username === normalizedUsername)) {
        alert('Пользователь уже существует');
        return;
      }
      const newUser = {
        id: uuidv4(),
        username: normalizedUsername,
        passwordHash: normalizedPassword,
        avatarEmoji: '🎵',
        avatarGradient: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
        favoriteTrackIds: [],
      };
      addUser(newUser);
      login(newUser.id);
    }
  };

  const stripeConfigs = [
    { top: '-8%', delay: '-8s', duration: '42s', rotate: -4, width: '220vw', color: '#ff1f1f', drift: '34vh', depthDuration: '17s' },
    { top: '8%', delay: '-19s', duration: '48s', rotate: 3, width: '218vw', color: '#ff8c00', drift: '28vh', depthDuration: '19s' },
    { top: '24%', delay: '-11s', duration: '46s', rotate: -2, width: '224vw', color: '#ffd400', drift: '36vh', depthDuration: '16s' },
    { top: '40%', delay: '-3s', duration: '51s', rotate: 5, width: '216vw', color: '#21c95b', drift: '30vh', depthDuration: '21s' },
    { top: '56%', delay: '-23s', duration: '44s', rotate: -5, width: '222vw', color: '#1ea7ff', drift: '33vh', depthDuration: '18s' },
    { top: '72%', delay: '-30s', duration: '50s', rotate: 4, width: '219vw', color: '#3b4dff', drift: '29vh', depthDuration: '20s' },
    { top: '88%', delay: '-14s', duration: '47s', rotate: -3, width: '223vw', color: '#a125ff', drift: '35vh', depthDuration: '22s' },
  ];
  const noteConfigs = [
    { left: '8%', top: '-8%', size: '2.7rem', color: '#ff1f1f', delay: '-5s', duration: '24s', depthDuration: '11s', drift: '42vh', rotate: -12, z: 4, symbol: '♫' },
    { left: '22%', top: '4%', size: '2.1rem', color: '#ff8c00', delay: '-14s', duration: '21s', depthDuration: '10s', drift: '36vh', rotate: 8, z: 7, symbol: '♪' },
    { left: '36%', top: '16%', size: '2.9rem', color: '#ffd400', delay: '-9s', duration: '23s', depthDuration: '12s', drift: '39vh', rotate: -10, z: 3, symbol: '♬' },
    { left: '52%', top: '28%', size: '2.2rem', color: '#21c95b', delay: '-20s', duration: '25s', depthDuration: '13s', drift: '33vh', rotate: 9, z: 8, symbol: '♩' },
    { left: '68%', top: '42%', size: '2.5rem', color: '#1ea7ff', delay: '-7s', duration: '22s', depthDuration: '11s', drift: '37vh', rotate: -7, z: 5, symbol: '🎵' },
    { left: '84%', top: '56%', size: '2.8rem', color: '#3b4dff', delay: '-26s', duration: '26s', depthDuration: '12s', drift: '36vh', rotate: 13, z: 9, symbol: '♭' },
    { left: '16%', top: '68%', size: '2.3rem', color: '#a125ff', delay: '-11s', duration: '24s', depthDuration: '10s', drift: '34vh', rotate: -8, z: 6, symbol: '♮' },
    { left: '30%', top: '80%', size: '2.7rem', color: '#111111', delay: '-17s', duration: '23s', depthDuration: '12s', drift: '38vh', rotate: 10, z: 8, symbol: '♪' },
    { left: '74%', top: '90%', size: '2.4rem', color: '#ffffff', delay: '-23s', duration: '25s', depthDuration: '11s', drift: '32vh', rotate: -9, z: 5, symbol: '♬' },
    { left: '58%', top: '8%', size: '2.35rem', color: '#ffffff', delay: '-3s', duration: '20s', depthDuration: '9s', drift: '35vh', rotate: 7, z: 4, symbol: '♩' },
    { left: '90%', top: '22%', size: '2.05rem', color: '#000000', delay: '-12s', duration: '22s', depthDuration: '10s', drift: '30vh', rotate: -6, z: 6, symbol: '♫' },
  ];

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-violet-50 via-sky-50 to-fuchsia-50 flex items-center justify-center p-4 overflow-hidden">
      {!isStandalone && (
        <button
          type="button"
          onClick={handleInstallApp}
          className="absolute top-4 right-4 z-20 inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 shadow-sm transition-colors hover:bg-violet-50"
        >
          <Download className="h-4 w-4" />
          Установить
        </button>
      )}
      <div className="absolute inset-0 pointer-events-none">
        {stripeConfigs.map((stripe, index) => (
          <div
            key={`${stripe.top}-${index}`}
            className="auth-bg-stripe"
            style={{
              top: stripe.top,
              width: stripe.width,
              backgroundColor: stripe.color,
              animationDuration: `${stripe.duration}, ${stripe.depthDuration}`,
              animationDelay: `${stripe.delay}, ${stripe.delay}`,
              ['--base-rotate' as string]: `${stripe.rotate}deg`,
              ['--vertical-drift' as string]: stripe.drift,
              zIndex: index + 1,
            }}
          />
        ))}
        {noteConfigs.map((note, index) => (
          <span
            key={`${note.left}-${note.top}-${index}`}
            className="auth-bg-note"
            style={{
              left: note.left,
              top: note.top,
              fontSize: note.size,
              color: note.color,
              animationDuration: `${note.duration}, ${note.depthDuration}`,
              animationDelay: `${note.delay}, ${note.delay}`,
              ['--note-drift' as string]: note.drift,
              ['--note-rotate' as string]: `${note.rotate}deg`,
              zIndex: note.z,
            }}
            aria-hidden
          >
            {note.symbol}
          </span>
        ))}
      </div>
      <div className="relative z-10 w-full max-w-sm bg-white p-8 rounded-3xl border border-violet-100 shadow-xl shadow-violet-100/70">
        <div className="flex items-center justify-start gap-3 mb-1">
          <span className="inline-flex items-center justify-center text-[2rem] leading-none" aria-hidden>
            🌈
          </span>
          <div className="text-[1.55rem] font-extrabold tracking-[0.1em] uppercase text-slate-700">RADOOGA</div>
        </div>
        <div className="text-sm text-slate-500 mb-6">слушай музыку которую хочешь</div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="Логин"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-white text-slate-700 border border-violet-100 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200"
              required
            />
          </div>
          
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Пароль"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-white text-slate-700 border border-violet-100 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-violet-500"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <button
            type="submit"
            className="w-full bg-black text-white border border-zinc-400 font-bold py-3 rounded-xl hover:bg-zinc-900 transition-colors mt-4 shadow-sm shadow-zinc-300"
          >
            {isLogin ? 'Войти' : 'Создать аккаунт'}
          </button>
        </form>

        <button
          onClick={() => setIsLogin(!isLogin)}
          className="w-full text-left text-slate-500 text-sm mt-6 hover:text-violet-600 transition-colors"
        >
          {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
      </div>
      <style>{`
        .auth-bg-stripe {
          position: absolute;
          left: 50%;
          height: 3rem;
          border-radius: 9999px;
          opacity: 1;
          box-shadow: 0 24px 42px rgba(15, 23, 42, 0.28), 0 8px 20px rgba(15, 23, 42, 0.18);
          animation-name: authStripeVerticalDrift, authStripeDepth;
          animation-timing-function: ease-in-out, ease-in-out;
          animation-iteration-count: infinite, infinite;
          animation-direction: alternate, alternate;
          will-change: transform, box-shadow, filter;
        }

        .auth-bg-note {
          position: absolute;
          display: inline-block;
          line-height: 1;
          font-weight: 700;
          opacity: 1;
          text-shadow:
            0 1px 0 rgba(255, 255, 255, 0.2),
            0 10px 18px rgba(15, 23, 42, 0.22),
            0 2px 6px rgba(15, 23, 42, 0.2);
          filter: drop-shadow(0 6px 12px rgba(15, 23, 42, 0.24));
          animation-name: authNoteVerticalDrift, authNoteDepth;
          animation-timing-function: ease-in-out, ease-in-out;
          animation-iteration-count: infinite, infinite;
          animation-direction: alternate, alternate;
          will-change: transform, filter, text-shadow;
        }

        @keyframes authStripeVerticalDrift {
          0% {
            transform: translateX(-50%) translateY(calc(var(--vertical-drift) * -1)) rotate(calc(var(--base-rotate) - 2deg)) scale(0.95);
          }
          28% {
            transform: translateX(-50%) translateY(calc(var(--vertical-drift) * -0.2)) rotate(calc(var(--base-rotate) + 2deg)) scale(1.02);
          }
          57% {
            transform: translateX(-50%) translateY(calc(var(--vertical-drift) * 0.35)) rotate(calc(var(--base-rotate) - 3deg)) scale(0.98);
          }
          100% {
            transform: translateX(-50%) translateY(var(--vertical-drift)) rotate(calc(var(--base-rotate) + 4deg)) scale(1.06);
          }
        }

        @keyframes authStripeDepth {
          0% {
            filter: saturate(1.06) brightness(0.94);
            box-shadow: 0 12px 26px rgba(15, 23, 42, 0.16), 0 4px 12px rgba(15, 23, 42, 0.12);
          }
          50% {
            filter: saturate(1.12) brightness(1);
            box-shadow: 0 26px 44px rgba(15, 23, 42, 0.3), 0 10px 22px rgba(15, 23, 42, 0.2);
          }
          100% {
            filter: saturate(1.08) brightness(0.97);
            box-shadow: 0 16px 30px rgba(15, 23, 42, 0.2), 0 6px 14px rgba(15, 23, 42, 0.14);
          }
        }

        @keyframes authNoteVerticalDrift {
          0% {
            transform: translateY(calc(var(--note-drift) * -1)) rotate(calc(var(--note-rotate) - 4deg)) scale(0.82);
          }
          27% {
            transform: translateY(calc(var(--note-drift) * -0.25)) rotate(calc(var(--note-rotate) + 3deg)) scale(1.06);
          }
          61% {
            transform: translateY(calc(var(--note-drift) * 0.28)) rotate(calc(var(--note-rotate) - 2deg)) scale(0.9);
          }
          100% {
            transform: translateY(var(--note-drift)) rotate(calc(var(--note-rotate) + 4deg)) scale(1.14);
          }
        }

        @keyframes authNoteDepth {
          0% {
            filter: drop-shadow(0 4px 10px rgba(15, 23, 42, 0.16));
            text-shadow:
              0 1px 0 rgba(255, 255, 255, 0.12),
              0 6px 12px rgba(15, 23, 42, 0.16),
              0 2px 4px rgba(15, 23, 42, 0.12);
          }
          50% {
            filter: drop-shadow(0 16px 24px rgba(15, 23, 42, 0.34));
            text-shadow:
              0 1px 0 rgba(255, 255, 255, 0.22),
              0 18px 26px rgba(15, 23, 42, 0.34),
              0 4px 10px rgba(15, 23, 42, 0.3);
          }
          100% {
            filter: drop-shadow(0 8px 14px rgba(15, 23, 42, 0.24));
            text-shadow:
              0 1px 0 rgba(255, 255, 255, 0.16),
              0 10px 18px rgba(15, 23, 42, 0.24),
              0 3px 7px rgba(15, 23, 42, 0.2);
          }
        }
      `}</style>
    </div>
  );
}
