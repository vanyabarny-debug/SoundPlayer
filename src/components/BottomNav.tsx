import { User, Compass } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useRadoogaStore } from '../store/radoogaStore';

function RadoogaRainbowIcon({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center justify-center text-[1.3rem] leading-none', className)} aria-hidden>
      🌈
    </span>
  );
}

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isRadoogaPage = location.pathname === '/radooga';
  const { prefetchNextBatch } = useRadoogaStore();

  const navItems = [
    { icon: Compass, label: 'Обзор', path: '/browse' },
    { icon: RadoogaRainbowIcon, label: 'Radooga', path: '/radooga' },
    { icon: User, label: 'Профиль', path: '/profile' },
  ];

  return (
    <div className={cn(
      "backdrop-blur-xl pb-safe",
      isRadoogaPage
        ? "bg-black/95 shadow-[0_-8px_24px_rgba(0,0,0,0.45)]"
        : "bg-white/75 shadow-[0_-8px_24px_rgba(148,163,184,0.18)]"
    )}>
      <div className="flex justify-around items-center h-16 px-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              state={item.path === '/browse' ? { browseTabEntry: true } : undefined}
              onClick={(event) => {
                if (item.path !== '/browse') return;
                if (location.pathname === '/browse') {
                  event.preventDefault();
                  navigate('/browse', { state: { browseTabEntry: true } });
                }
              }}
              onMouseEnter={() => {
                if (item.path === '/radooga') {
                  void prefetchNextBatch();
                }
              }}
              onFocus={() => {
                if (item.path === '/radooga') {
                  void prefetchNextBatch();
                }
              }}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                isRadoogaPage
                  ? (isActive ? "text-white" : "text-white/70 hover:text-white")
                  : (isActive ? "text-violet-600" : "text-slate-400 hover:text-violet-500")
              )}
            >
              <item.icon className="w-6 h-6" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
