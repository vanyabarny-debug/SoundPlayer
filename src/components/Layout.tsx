import { ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { MiniPlayer } from './MiniPlayer';
import { AudioPlayer } from './AudioPlayer';
import { usePlayerStore } from '../store/playerStore';
import { useMockServer } from '../store/mockServer';
import { getImageFile } from '../lib/db';
import { getAverageColor } from '../lib/colorExtractor';

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const currentTrackId = usePlayerStore(state => state.currentTrackId);
  const tracks = useMockServer(state => state.tracks);
  const isRadoogaPage = location.pathname === '/radooga';

  useEffect(() => {
  }, [location.pathname]);

  useEffect(() => {
    let objectUrl: string | undefined;
    const setAccent = (accent: string) => {
      const root = document.documentElement;
      root.style.setProperty('--accent-color', accent);
      root.style.setProperty('--accent-soft', `${accent}22`);
      root.style.setProperty('--accent-soft-strong', `${accent}33`);
    };

    const track = currentTrackId ? tracks[currentTrackId] : null;
    if (!track?.coverUrl) {
      setAccent('#8b5cf6');
      return;
    }

    getImageFile(track.coverUrl)
      .then(blob => {
        if (!blob) return Promise.reject('No blob');
        objectUrl = URL.createObjectURL(blob);
        return getAverageColor(objectUrl);
      })
      .then(color => {
        setAccent(color);
      })
      .catch(() => {
        setAccent('#8b5cf6');
      })
      .finally(() => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      });

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [currentTrackId, tracks]);

  return (
    <div className="flex flex-col h-[100dvh] bg-gradient-to-b from-violet-50 via-sky-50 to-slate-100 text-slate-700 overflow-hidden">
      <main className={`flex-1 overflow-y-auto ${isRadoogaPage ? 'pb-16' : 'pb-32'}`}>
        {children}
      </main>
      <div className="fixed bottom-0 left-0 right-0 z-50">
        {!isRadoogaPage && <MiniPlayer />}
        <BottomNav />
      </div>
      <AudioPlayer />
    </div>
  );
}
