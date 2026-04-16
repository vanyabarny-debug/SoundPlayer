import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, animate } from 'motion/react';
import { CachedImage } from './CachedImage';

type BaseItem = {
  title?: string;
  summary?: string;
  subtitle?: string;
  url?: string;
  imageUrl?: string;
  kind?: 'photo' | 'fact' | 'news' | 'concert';
  placeholder?: boolean;
};

interface RadoogaCarouselProps {
  items: BaseItem[];
  mode: 'news' | 'photos' | 'artist-media';
  onOpenSource?: (url: string, title?: string) => void;
  externalIndex?: number;
  onIndexChange?: (nextIndex: number) => void;
}

const photoSpring = { type: 'spring', stiffness: 420, damping: 38, mass: 0.85 } as const;

export function RadoogaCarousel({ items, mode, onOpenSource, externalIndex, onIndexChange }: RadoogaCarouselProps) {
  const [internalIndex, setInternalIndex] = useState(0);
  const visibleItems = useMemo(() => items.slice(0, 10), [items]);
  const isControlled = typeof externalIndex === 'number' && typeof onIndexChange === 'function';
  const currentIndex = Math.max(0, Math.min(isControlled ? externalIndex : internalIndex, Math.max(visibleItems.length - 1, 0)));
  const current = visibleItems[currentIndex];
  const stripRef = useRef<HTMLDivElement>(null);
  const [stripW, setStripW] = useState(0);
  const x = useMotionValue(0);

  if (!current) return null;

  const setIndex = (updater: number | ((prev: number) => number)) => {
    const prev = currentIndex;
    const raw = typeof updater === 'function' ? updater(prev) : updater;
    const next = Math.max(0, Math.min(raw, Math.max(visibleItems.length - 1, 0)));
    if (isControlled) {
      onIndexChange?.(next);
      return;
    }
    setInternalIndex(next);
  };

  const isStoryLike = mode === 'news' || mode === 'photos' || mode === 'artist-media';
  const isPhotoMode = mode === 'photos';

  useEffect(() => {
    if (!isPhotoMode || visibleItems.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % visibleItems.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [isPhotoMode, visibleItems.length, currentIndex]);

  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el || !isPhotoMode) return;
    const measure = () => setStripW(el.offsetWidth || 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isPhotoMode, visibleItems.length]);

  useEffect(() => {
    if (!isPhotoMode || visibleItems.length === 0) return;
    const w = stripW || stripRef.current?.offsetWidth || 1;
    const target = -currentIndex * w;
    void animate(x, target, photoSpring);
  }, [isPhotoMode, currentIndex, visibleItems.length, stripW, x]);

  const subtitleParts = (current.subtitle || '')
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean);
  const source = subtitleParts[0] || '';
  const published = subtitleParts[1] || '';

  const storyMainClass =
    isStoryLike
      ? `relative overflow-hidden flex-1 rounded-none border-0 ${mode === 'news' ? 'bg-transparent' : 'bg-black'}`
      : 'rounded-xl border border-white/15';

  const dragLimit = stripW > 0 && visibleItems.length > 1 ? -(visibleItems.length - 1) * stripW : 0;

  const onPhotoDragEnd = () => {
    if (!isPhotoMode || visibleItems.length < 2) return;
    const w = stripW || stripRef.current?.offsetWidth || 1;
    const raw = x.get();
    let next = Math.round(-raw / w);
    next = Math.max(0, Math.min(next, visibleItems.length - 1));
    setIndex(next);
    void animate(x, -next * w, photoSpring);
  };

  return (
    <div className={`${isStoryLike ? 'h-full flex flex-col' : 'rounded-2xl bg-black/45 backdrop-blur-md border border-white/20 p-2 shadow-xl shadow-black/35'}`}>
      <div className={storyMainClass}>
        {mode === 'news' ? (
          <div className="relative h-full w-full flex flex-col items-center justify-center overflow-y-auto px-5 pb-2 pt-2">
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[44%] -translate-y-1/2 bg-gradient-to-b from-transparent via-black/60 to-transparent" />
            <AnimatePresence mode="wait">
              <motion.div
                key={`${currentIndex}-${current.title}-${current.url}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.32, ease: 'easeOut' }}
                className="relative z-10 flex w-full max-w-[min(100%,26rem)] flex-col items-center text-center"
              >
                {current.imageUrl ? (
                  <CachedImage
                    src={current.imageUrl}
                    alt=""
                    className="mb-3 max-h-24 w-auto max-w-[85%] rounded-xl object-cover shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
                  />
                ) : null}
                <div className="text-[1.35rem] font-extrabold leading-snug text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.85)]">
                  {current.title}
                </div>
                {current.summary ? (
                  <div
                    className="mt-3 max-h-[min(48vh,22rem)] overflow-y-auto overscroll-y-contain text-[0.95rem] leading-relaxed text-white/92 drop-shadow-[0_1px_10px_rgba(0,0,0,0.75)]"
                    onWheel={(e) => e.stopPropagation()}
                  >
                    {current.summary}
                  </div>
                ) : null}
                {(source || published) ? (
                  <div className="mt-2 text-[11px] text-white/78 drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)]">
                    {[source, published].filter(Boolean).join(' · ')}
                  </div>
                ) : null}
                {current.url ? (
                  <button
                    type="button"
                    onClick={() => (onOpenSource ? onOpenSource(current.url || '', current.title) : window.open(current.url, '_blank', 'noopener,noreferrer'))}
                    className="mt-1.5 text-[13px] text-white/95 underline underline-offset-4 drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]"
                  >
                    Открыть источник
                  </button>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        ) : current.imageUrl ? (
          <div className="relative w-full">
            {isPhotoMode ? (
              <div ref={stripRef} className="relative h-full w-full overflow-hidden bg-black px-0 py-4 touch-pan-y">
                <motion.div
                  className="flex h-[min(72vh,32rem)] flex-row will-change-transform"
                  style={{ x, width: stripW > 0 ? stripW * visibleItems.length : '100%' }}
                  drag={visibleItems.length > 1 && stripW > 0 ? 'x' : false}
                  dragConstraints={{ left: dragLimit, right: 0 }}
                  dragElastic={0.12}
                  onDragEnd={onPhotoDragEnd}
                >
                  {visibleItems.map((item, idx) => (
                    <div
                      key={`${idx}-${item.imageUrl || 'ph'}`}
                      className="flex h-full shrink-0 grow-0 items-center justify-center px-3"
                      style={{ width: stripW > 0 ? stripW : '100%', minWidth: stripW > 0 ? stripW : '100%' }}
                    >
                      <CachedImage
                        src={item.imageUrl || ''}
                        alt={item.title || 'photo'}
                        className="max-h-full max-w-full rounded-xl object-contain shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
                      />
                    </div>
                  ))}
                </motion.div>
              </div>
            ) : (
              <div className="h-[68vh] w-full">
                <CachedImage src={current.imageUrl} alt={current.title || 'media'} className="w-full h-full object-cover" />
              </div>
            )}
            {mode === 'artist-media' && (
              <>
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/5" />
                <div className="absolute inset-x-0 bottom-0 px-6 pb-12 flex justify-center">
                  <div className="max-w-[88%] text-center">
                    <div className="text-[18px] font-semibold leading-snug line-clamp-3 text-white">
                      {current.title}
                    </div>
                    {(source || published) && (
                      <div className="mt-2 text-[12px] text-white/80">
                        {[source, published].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="p-3 bg-black/35">
            <div className="text-[13px] text-white font-medium line-clamp-3 leading-snug">{current.title}</div>
            {current.subtitle && <div className="text-[11px] text-white/70 mt-2">{current.subtitle}</div>}
          </div>
        )}
      </div>
      {(mode === 'photos' || mode === 'news' || mode === 'artist-media') && (
        <div className="mt-3 flex justify-center gap-1.5">
          {visibleItems.map((_, dotIndex) => (
            <span
              key={`dot-${dotIndex}`}
              className={`rounded-full transition-all ${dotIndex === currentIndex ? 'w-2.5 h-2.5 bg-white' : 'w-1.5 h-1.5 bg-white/45'}`}
            />
          ))}
        </div>
      )}
      {mode === 'artist-media' && current.url && (
        <button
          type="button"
          onClick={() => (onOpenSource ? onOpenSource(current.url || '', current.title) : window.open(current.url, '_blank', 'noopener,noreferrer'))}
          className="mt-2 text-[13px] text-white/90 underline underline-offset-2 inline-block px-1 text-left"
        >
          Открыть источник
        </button>
      )}
    </div>
  );
}
