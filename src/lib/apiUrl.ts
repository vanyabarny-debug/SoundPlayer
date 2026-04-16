const normalizeBaseUrl = (rawBase: string | undefined): string => {
  if (!rawBase) return '';
  return rawBase.trim().replace(/\/+$/, '');
};

type ViteImportMetaEnv = {
  VITE_API_BASE_URL?: string;
};

const viteEnv = (import.meta as ImportMeta & { env?: ViteImportMetaEnv }).env;
const configuredBase = normalizeBaseUrl(viteEnv?.VITE_API_BASE_URL);

export const apiUrl = (pathname: string): string => {
  if (!pathname.startsWith('/')) {
    throw new Error(`API pathname must start with "/": ${pathname}`);
  }
  if (!configuredBase) return pathname;
  return `${configuredBase}${pathname}`;
};
