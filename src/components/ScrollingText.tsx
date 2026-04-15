import { useRef, useEffect, useState } from 'react';
import { cn } from '../lib/utils';

interface ScrollingTextProps {
  text: string;
  className?: string;
}

export function ScrollingText({ text, className }: ScrollingTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => {
    const checkScroll = () => {
      if (containerRef.current && textRef.current) {
        setIsScrolling(textRef.current.scrollWidth > containerRef.current.clientWidth);
      }
    };

    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [text]);

  return (
    <div ref={containerRef} className={cn("overflow-hidden whitespace-nowrap relative w-full", className)}>
      <div className={cn("inline-block", isScrolling && "animate-marquee")}>
        <span ref={textRef} className="inline-block">{text}</span>
        {isScrolling && <span className="inline-block ml-8">{text}</span>}
      </div>
    </div>
  );
}
