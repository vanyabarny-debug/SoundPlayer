import React, { useState, useEffect } from 'react';
import { getImageFile } from '../lib/db';

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
}

export function CachedImage({ src, fallback, ...props }: CachedImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setObjectUrl(null);
      return;
    }

    if (src.startsWith('http') || src.startsWith('data:')) {
      setObjectUrl(src);
      return;
    }

    let active = true;
    let newUrl: string | null = null;

    getImageFile(src).then(blob => {
      if (active && blob) {
        newUrl = URL.createObjectURL(blob);
        setObjectUrl(newUrl);
      }
    });

    return () => {
      active = false;
      if (newUrl) {
        URL.revokeObjectURL(newUrl);
      }
    };
  }, [src]);

  if (!src || !objectUrl) {
    return <>{fallback}</>;
  }

  return <img src={objectUrl} {...props} />;
}
