import { Library, User, Compass } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';

export function BottomNav() {
  const location = useLocation();

  const navItems = [
    { icon: Compass, label: 'Обзор', path: '/browse' },
    { icon: Library, label: 'Медиатека', path: '/library' },
    { icon: User, label: 'Профиль', path: '/profile' },
  ];

  return (
    <div className="bg-white/75 backdrop-blur-xl pb-safe shadow-[0_-8px_24px_rgba(148,163,184,0.18)]">
      <div className="flex justify-around items-center h-16 px-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                isActive ? "text-violet-600" : "text-slate-400 hover:text-violet-500"
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
