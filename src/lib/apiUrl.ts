const normalizeBaseUrl = (rawBase: string | undefined): string => {
  if (!rawBase) return '';
  return rawBase.trim().replace(/\/+$/, '');
};

type ViteImportMetaEnv = {
  VITE_API_BASE_URL?: string;
  DEV?: boolean;
  PROD?: boolean;
};

const viteEnv = (import.meta as ImportMeta & { env?: ViteImportMetaEnv }).env;
const configuredBase = normalizeBaseUrl(viteEnv?.VITE_API_BASE_URL);
const productionFallbackBase = 'https://soundplayer-api.onrender.com';

const resolvedBase = configuredBase || (viteEnv?.PROD ? productionFallbackBase : '');

export const apiUrl = (pathname: string): string => {
  if (!pathname.startsWith('/')) {
    throw new Error(`API pathname must start with "/": ${pathname}`);
  }
  if (!resolvedBase) return pathname;
  return `${resolvedBase}${pathname}`;
};
