/** Жанровые «ядра» для визуального поиска (Pexels, фото). */

export type GenreCoreEntry = {
  core: string;
  /**
   * Совпадение по нормализованной строке: жанр + название + артист (+ альбом),
   * чтобы «phonk»/«lofi» в треке работали при общем primaryGenreName вроде Dance/Music.
   */
  match: (blob: string) => boolean;
  queries: string[];
};

const norm = (g: string) => g.trim().toLowerCase();
const withPhotoReal = (query: string): string =>
  /\bphoto\s*real\b/i.test(query) ? query : `${query} photo real`;

/** Единая строка для жанровых эстетик и Pexels/фото. */
export const buildAestheticBlob = (
  itunesGenre: string | undefined,
  title?: string,
  artist?: string,
  collectionName?: string,
): string =>
  [norm(itunesGenre || ''), norm(title || ''), norm(artist || ''), norm(collectionName || '')]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

export const hashStringSeed = (value: string): number => {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = ((h << 5) - h + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

export const GENRE_CORES: GenreCoreEntry[] = [
  {
    core: 'Drift / JDM / VHS',
    match: (g) => /\bphonk\b/.test(g) || g.includes('drift'),
    queries: [
      'car drift night',
      'JDM night highway',
      'phonk street lights',
      'grainy street',
      'neon underground',
      'vhs urban texture',
    ],
  },
  {
    core: 'Ethereal / Liminal',
    match: (g) =>
      /\bambient\b/.test(g)
      || /\bnew\s*age\b/.test(g)
      || /\bdrone\b/.test(g)
      || g.includes('ethereal'),
    queries: [
      'ethereal landscape',
      'liminal space',
      'foggy mountains',
      'minimalist abstract',
      'dreamscape',
      'soft cloudy sky',
    ],
  },
  {
    core: 'Y2K / Street',
    match: (g) =>
      /\bhip[\s-]*hop\b/.test(g)
      || /\brap\b/.test(g)
      || /\btrap\b/.test(g)
      || g.includes('hip hop'),
    queries: [
      'street style photography',
      'night city neon',
      'street portrait',
      'Y2K street style',
      '90s hip hop fashion',
      'concrete urban',
    ],
  },
  {
    core: 'Cybercore / Rave',
    match: (g) =>
      /\belectronic\b/.test(g)
      || /\btechno\b/.test(g)
      || /\bedm\b/.test(g)
      || g.includes('electro'),
    queries: [
      'cyberpunk city night',
      'rave lights',
      'laser beams',
      'futuristic club',
      'futuristic street',
      'dark techno club',
    ],
  },
  {
    core: 'Poolcore / Tropical',
    match: (g) =>
      /\bhouse\b/.test(g)
      || g.includes('deep house')
      || g.includes('tropical house'),
    queries: [
      'pool at night',
      'palm trees neon',
      'luxury hotel pool',
      'turquoise water',
      'sunset balcony',
      'night resort lights',
    ],
  },
  {
    core: 'Dreamcore / Glossy',
    match: (g) =>
      /\bpop\b/.test(g)
      || /\bdance\b/.test(g)
      || g.includes('dance-pop'),
    queries: [
      'bright pop portrait',
      'high fashion editorial',
      'glossy textures',
      'soft neon tones',
      '2000s studio look',
      'hyperpop portrait',
    ],
  },
  {
    core: 'Grunge / Indie',
    match: (g) =>
      /\brock\b/.test(g)
      || /\balt[\s-]*rock\b/.test(g)
      || /\bgrunge\b/.test(g)
      || /\bindie\b/.test(g),
    queries: [
      '90s grunge aesthetic',
      'film grain portrait',
      'rock concert flash',
      'messy room aesthetic',
      'vintage vinyl',
      'electric guitar art',
    ],
  },
  {
    core: 'Darkcore / Brutalism',
    match: (g) =>
      /\bmetal\b/.test(g)
      || /\bhardcore\b/.test(g)
      || g.includes('death metal')
      || g.includes('black metal'),
    queries: [
      'dark occult aesthetic',
      'heavy metal texture',
      'brutalist architecture dark',
      'monochrome dark',
      'fire smoke dramatic',
      'forest mist dark',
    ],
  },
  {
    core: 'Lovecore / Velvet',
    match: (g) =>
      /\br&b\b/.test(g)
      || /\bsoul\b/.test(g)
      || g.includes('contemporary r&b'),
    queries: [
      'warm sunset lighting',
      'red velvet aesthetic',
      'vintage luxury',
      'grainy soul photography',
      'cinematic night drive',
      'roses aesthetic',
    ],
  },
  {
    core: 'Cozy / Anime',
    match: (g) =>
      /\blo[\s-]*fi\b/.test(g)
      || /\blofi\b/.test(g)
      || g.includes('chillhop')
      || g.includes('chill-out'),
    queries: [
      'lofi hip hop aesthetic',
      'anime scenery',
      'study room night',
      'cozy rainy window',
      'retro workstation',
      'cat cozy room',
    ],
  },
  {
    core: 'Noir / Vintage',
    match: (g) =>
      /\bjazz\b/.test(g)
      || /\bblues\b/.test(g),
    queries: [
      'film noir aesthetic',
      'smoke jazz club',
      'vintage monochrome',
      'sepia cafe',
      'classy midnight city',
      'saxophone mood',
    ],
  },
  {
    core: 'Dark Academia',
    match: (g) => /\bclassical\b/.test(g) || g.includes('orchestr'),
    queries: [
      'dark academia aesthetic',
      'old library candles',
      'marble statues',
      'sheet music closeup',
      'candle light study',
      'museum hall',
    ],
  },
  {
    core: 'Naturecore / Forest',
    match: (g) =>
      /\bfolk\b/.test(g)
      || /\bacoustic\b/.test(g)
      || g.includes('singer/songwriter'),
    queries: [
      'forest aesthetic mist',
      'misty woods',
      'campfire night',
      'mossy rocks',
      'earthy tones nature',
      'folk photography wood',
    ],
  },
  {
    core: 'Oddly Satisfying',
    match: (blob) => {
      const t = blob.trim();
      if (!t) return false;
      const tokens = t.split(/\s+/).filter(Boolean);
      return tokens.length === 1 && (tokens[0] === 'music' || tokens[0] === 'other');
    },
    queries: [
      'minimal geometric texture',
      'cinematic macro texture',
      'abstract light reflections',
      'smooth liquid texture',
      'glass reflection closeup',
      'soft monochrome gradient',
    ],
  },
];

const DEFAULT_QUERIES = ['cinematic portrait'];

export const getAestheticQuery = (
  itunesGenre: string | undefined,
  title?: string,
  artist?: string,
  collectionName?: string
): { core: string; queries: string[] } => {
  const blob = buildAestheticBlob(itunesGenre, title, artist, collectionName);
  if (!blob) {
    return { core: 'Cinematic', queries: [...DEFAULT_QUERIES] };
  }
  for (const entry of GENRE_CORES) {
    if (entry.match(blob)) {
      return { core: entry.core, queries: entry.queries.map(withPhotoReal) };
    }
  }
  return { core: 'Cinematic', queries: DEFAULT_QUERIES.map(withPhotoReal) };
};

/** Стабильный выбор тега по seed (например candidate.id). */
export const pickRandomAestheticTag = (
  itunesGenre: string | undefined,
  seed: string,
  title?: string,
  artist?: string,
  collectionName?: string
): string => {
  const { queries } = getAestheticQuery(itunesGenre, title, artist, collectionName);
  if (queries.length === 0) return DEFAULT_QUERIES[0];
  const idx = hashStringSeed(seed) % queries.length;
  return queries[idx];
};

/** Краткий ключ для кеша фото (стабильно для жанра). */
export const getAestheticCacheBucket = (
  itunesGenre: string | undefined,
  title?: string,
  artist?: string,
  collectionName?: string
): string => {
  const { core } = getAestheticQuery(itunesGenre, title, artist, collectionName);
  return core
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9а-яё-]/gi, '')
    .slice(0, 40) || 'default';
};
