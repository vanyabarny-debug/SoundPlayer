import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { getImageFile } from '../lib/db';

interface LyricsViewProps {
  lyrics: string;
  coverUrl?: string;
  accentColor: string;
  trackTitle: string;
  artistName: string;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onClose: () => void;
  children: React.ReactNode; // For player controls
}

const invertColor = (color: string): string => {
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let value = hex[1];
    if (value.length === 3) value = value.split('').map((c) => c + c).join('');
    const r = 255 - parseInt(value.slice(0, 2), 16);
    const g = 255 - parseInt(value.slice(2, 4), 16);
    const b = 255 - parseInt(value.slice(4, 6), 16);
    return `rgb(${r}, ${g}, ${b})`;
  }
  const rgb = color.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    const r = 255 - Number(rgb[1]);
    const g = 255 - Number(rgb[2]);
    const b = 255 - Number(rgb[3]);
    return `rgb(${r}, ${g}, ${b})`;
  }
  return '#FFFFFF';
};

const parseRgb = (color: string): { r: number; g: number; b: number } | null => {
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let value = hex[1];
    if (value.length === 3) value = value.split('').map((c) => c + c).join('');
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }
  const rgb = color.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!rgb) return null;
  return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
};

const isLightColor = (color: string): boolean => {
  const parsed = parseRgb(color);
  if (!parsed) return false;
  const luminance = (0.2126 * parsed.r + 0.7152 * parsed.g + 0.0722 * parsed.b) / 255;
  return luminance > 0.68;
};

export function LyricsView({ lyrics, coverUrl, accentColor, trackTitle, artistName, currentTime, duration, onSeek, onClose, children }: LyricsViewProps) {
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [manualProgress, setManualProgress] = useState<number | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const hasLyrics = Boolean(lyrics && lyrics.trim().length > 0);
  const playbackProgress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
  const displayProgress = manualProgress ?? playbackProgress;
  const accentIsLight = useMemo(() => isLightColor(accentColor), [accentColor]);
  const sliderActiveColor = 'rgba(255,255,255,0.95)';
  const sliderInactiveColor = 'rgba(255,255,255,0.22)';
  const glowPassedStrong = 'rgba(255,255,255,0.75)';
  const glowPassedSoft = 'rgba(255,255,255,0.42)';
  const glowUpcomingSoft = 'rgba(255,255,255,0.14)';

  useEffect(() => {
  }, [lyrics.length]);

  useEffect(() => {
  }, [hasLyrics]);

  useEffect(() => {
    if (!hasLyrics || manualProgress !== null) return;
    const container = lyricsContainerRef.current;
    if (!container) return;
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const easedProgress = Math.pow(playbackProgress, 1.08);
    container.scrollTo({ top: maxScroll * easedProgress, behavior: 'smooth' });
  }, [hasLyrics, playbackProgress, manualProgress]);

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
        style={{
          backgroundImage: bgImageUrl ? `url(${bgImageUrl})` : 'none',
          transform: 'scale(2)',
          transformOrigin: 'center',
        }}
      />
      <div className="absolute inset-0 bg-black/25" />
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(to bottom, ${accentColor}55, transparent 45%, ${accentColor}44)` }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: accentIsLight
            ? 'linear-gradient(to top, rgba(8,8,12,0.86), transparent)'
            : `linear-gradient(to top, ${accentColor}88, transparent)`,
          transform: 'scale(2)',
          transformOrigin: 'center',
        }}
      />

      {/* Header */}
      <div className="relative z-10 flex-shrink-0 flex items-center justify-between gap-4">
        <div className="min-w-0 text-white/90 text-sm md:text-base font-medium truncate">
          {artistName} - {trackTitle}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Назад"
          className="p-3 text-white/90 hover:text-white transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
      </div>

      {/* Lyrics Content */}
      <div className="relative z-10 flex-1 min-h-0 py-4">
        <div
          ref={lyricsContainerRef}
          className="h-full w-full max-w-3xl mx-auto px-6 py-8 md:px-10 md:py-10 overflow-y-auto scrollbar-hide"
          style={{
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)',
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)',
          }}
        >
          {hasLyrics ? (
            <p
              className="text-2xl md:text-3xl font-semibold text-center leading-loose whitespace-pre-wrap"
              style={{
                color: '#FFFFFF',
                textShadow: `0 0 18px ${accentColor}66`,
                backgroundImage: `linear-gradient(to bottom, #FFFFFF 0%, #FFFFFF ${Math.max(18, displayProgress * 100)}%, rgba(255,255,255,0.75) 100%)`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
              }}
            >
              {lyrics}
            </p>
          ) : (
            <div className="h-full min-h-56 flex items-center justify-center">
              <div className="px-6 py-6 text-center">
                <p className="text-xl md:text-2xl font-semibold text-white">Текст пока не добавлен</p>
                <p className="mt-2 text-sm text-white/80">Открой другой трек или добавь слова в редакторе трека.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Player Controls (Vignette) */}
      <div className="relative z-10 flex-shrink-0 pb-2">
        <div className="relative px-4 py-4 md:px-6 md:py-5">
          {children}
        </div>
      </div>
      <div className="fixed left-0 right-0 bottom-0 z-[95] translate-y-[30px]">
        <div
          className="absolute left-0 right-0 -bottom-6 h-20 pointer-events-none"
          style={{
            background: `linear-gradient(to right, ${glowPassedStrong} 0%, ${glowPassedSoft} ${displayProgress * 100}%, ${glowUpcomingSoft} ${displayProgress * 100}%, rgba(255,255,255,0) 100%)`,
            filter: 'blur(16px)',
            mixBlendMode: 'screen',
          }}
        />
        <div className="absolute inset-x-0 top-0 h-8 overflow-hidden">
          <div
            className="h-full w-full"
            style={{ backgroundColor: sliderInactiveColor, borderRadius: 0 }}
          />
          <div
            className="absolute left-0 top-0 h-full"
            style={{ width: `${displayProgress * 100}%`, backgroundColor: sliderActiveColor, borderRadius: 0 }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={displayProgress}
          onChange={(e) => {
            const progress = Number(e.target.value);
            setManualProgress(progress);
            onSeek(progress * (duration || 0));
          }}
          onMouseUp={() => setManualProgress(null)}
          onTouchEnd={() => setManualProgress(null)}
          className="karaoke-slider relative z-10 w-full h-8 cursor-pointer appearance-none rounded-none bg-transparent dynamic-thumb [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-runnable-track]:rounded-none [&::-moz-range-track]:bg-transparent [&::-moz-range-track]:rounded-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-12 [&::-webkit-slider-thumb]:w-12 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:blur-[3px]"
          style={{
            ['--thumb-color' as string]: sliderActiveColor,
            borderRadius: 0,
            boxShadow: '0 0 16px rgba(255,255,255,0.95), 0 0 34px rgba(255,255,255,0.8), 0 0 56px rgba(255,255,255,0.6)',
          }}
        />
      </div>
    </motion.div>
  );
}
