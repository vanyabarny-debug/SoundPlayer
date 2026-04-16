import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { getImageFile } from '../lib/db';

interface LyricsViewProps {
  lyrics: string;
  coverUrl?: string;
  onClose: () => void;
  children: React.ReactNode; // For player controls
}

export function LyricsView({ lyrics, coverUrl, onClose, children }: LyricsViewProps) {
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const hasLyrics = Boolean(lyrics && lyrics.trim().length > 0);

  useEffect(() => {
  }, [lyrics.length]);

  useEffect(() => {
  }, [hasLyrics]);

  useEffect(() => {
    let objectUrl: string | undefined;
    if (coverUrl) {
      if (coverUrl.startsWith('http')) {
        setBgImageUrl(coverUrl);
      } else {
        getImageFile(coverUrl)
          .then(blob => {
            if (blob) {
              objectUrl = URL.createObjectURL(blob);
              setBgImageUrl(prevUrl => {
                if (prevUrl) URL.revokeObjectURL(prevUrl);
                return objectUrl;
              });
            }
          });
      }
    }

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [coverUrl]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex flex-col p-4 md:p-6"
    >
      {/* Background */}
      <div 
        className="absolute inset-0 bg-cover bg-center filter blur-2xl"
        style={{ backgroundImage: bgImageUrl ? `url(${bgImageUrl})` : 'none' }}
      />
      <div className="absolute inset-0 bg-violet-500/30" />

      {/* Header */}
      <div className="relative z-10 flex-shrink-0">
        <button onClick={onClose} className="p-3 bg-white/80 text-violet-600 rounded-full shadow-md shadow-violet-200/60">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Lyrics Content */}
      <div className="relative z-10 flex-1 min-h-0 py-4">
        <div className="h-full w-full max-w-3xl mx-auto bg-white/45 backdrop-blur-xl border border-white/60 rounded-[2rem] px-6 py-8 md:px-10 md:py-10 overflow-y-auto scrollbar-hide shadow-xl shadow-violet-200/50">
          {hasLyrics ? (
            <p className="text-2xl md:text-3xl font-semibold text-violet-900/85 text-center leading-loose whitespace-pre-wrap">
              {lyrics}
            </p>
          ) : (
            <div className="h-full min-h-56 flex items-center justify-center">
              <div className="bg-white/80 border border-violet-100 rounded-[1.75rem] px-6 py-6 text-center shadow-sm shadow-violet-100/70">
                <p className="text-xl md:text-2xl font-semibold text-violet-700">Текст пока не добавлен</p>
                <p className="mt-2 text-sm text-slate-500">Открой другой трек или добавь слова в редакторе трека.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Player Controls (Vignette) */}
      <div className="relative z-10 flex-shrink-0 pb-2">
        <div className="absolute bottom-0 left-0 right-0 h-44 bg-gradient-to-t from-violet-500/40 to-transparent pointer-events-none" />
        <div className="relative bg-white/65 backdrop-blur-xl border border-white/70 rounded-[2rem] px-4 py-4 md:px-6 md:py-5 shadow-xl shadow-violet-200/50">
          {children}
        </div>
      </div>
    </motion.div>
  );
}
