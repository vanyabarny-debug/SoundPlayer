type WikiLang = 'ru' | 'en';
const PLACEHOLDER_DESCRIPTION_PATTERNS: RegExp[] = [
  /артист из рекомендаций radooga/i,
  /артист в твоей коллекции rainboow/i,
  /imported from mini player preview/i,
];

type WikiSummaryPayload = {
  title?: string;
  description?: string;
  extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
};

export type ArtistDescriptionResult = {
  description: string;
  imageUrl?: string;
  source: 'ru' | 'en-translated' | 'none';
};

export type AlbumDescriptionResult = {
  description: string;
  source: 'ru' | 'en-translated' | 'none';
};

const wikiBaseForLang = (lang: WikiLang): string => `https://${lang}.wikipedia.org`;

const trimBySentence = (text: string, maxLength: number): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  let result = '';
  for (const sentence of sentences) {
    const candidate = result ? `${result} ${sentence}` : sentence;
    if (candidate.length > maxLength) break;
    result = candidate;
  }
  if (!result) {
    const fallback = normalized.slice(0, Math.max(maxLength - 3, 1)).trimEnd();
    return `${fallback}...`;
  }
  return `${result}...`;
};

const isLikelyDisambiguation = (value: string): boolean => {
  const text = value.toLowerCase();
  return text.includes('disambiguation') || text.includes('may refer to');
};

const wikiSearch = async (query: string, lang: WikiLang): Promise<string[]> => {
  try {
    const response = await fetch(
      `${wikiBaseForLang(lang)}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=6&format=json&origin=*`
    );
    if (!response.ok) return [];
    const payload = await response.json() as { query?: { search?: Array<{ title?: string }> } };
    return (payload.query?.search || [])
      .map((item) => item.title || '')
      .filter(Boolean);
  } catch {
    return [];
  }
};

const wikiSummary = async (title: string, lang: WikiLang): Promise<WikiSummaryPayload | null> => {
  try {
    const response = await fetch(`${wikiBaseForLang(lang)}/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    if (!response.ok) return null;
    return await response.json() as WikiSummaryPayload;
  } catch {
    return null;
  }
};

const translateToRussian = async (text: string): Promise<string> => {
  const normalized = text.trim();
  if (!normalized) return normalized;
  try {
    const response = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ru&dt=t&q=${encodeURIComponent(normalized)}`
    );
    if (!response.ok) return normalized;
    const payload = await response.json() as Array<Array<[string, string]>>;
    const translated = (payload?.[0] || [])
      .map((entry) => entry?.[0] || '')
      .join('')
      .trim();
    return translated || normalized;
  } catch {
    return normalized;
  }
};

export const isPlaceholderArtistDescription = (value?: string | null): boolean => {
  const normalized = (value || '').trim();
  if (!normalized) return true;
  return PLACEHOLDER_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const resolveArtistDescriptionRu = async (
  artistName: string,
  options?: { fallbackDescription?: string; maxLength?: number }
): Promise<ArtistDescriptionResult> => {
  const normalizedName = artistName.trim();
  const maxLength = options?.maxLength ?? 280;
  const queriesByLang: Record<WikiLang, string[]> = {
    ru: [`"${normalizedName}" музыкант`, `"${normalizedName}" певец`, `${normalizedName} музыкант`, normalizedName],
    en: [`"${normalizedName}" musician`, `"${normalizedName}" singer`, `${normalizedName} musician`, normalizedName],
  };

  let enBest: { description: string; imageUrl?: string } | null = null;

  for (const lang of ['ru', 'en'] as const) {
    const candidateTitles: string[] = [];
    for (const query of queriesByLang[lang]) {
      const found = await wikiSearch(query, lang);
      for (const title of found) {
        if (!candidateTitles.includes(title)) candidateTitles.push(title);
      }
    }

    let bestScore = -1;
    let best: { description: string; imageUrl?: string } | null = null;
    const normalizedNameLower = normalizedName.toLowerCase();

    for (const title of candidateTitles.slice(0, 12)) {
      const summary = await wikiSummary(title, lang);
      if (!summary) continue;
      const combined = `${summary.title || ''} ${summary.description || ''} ${summary.extract || ''}`;
      if (isLikelyDisambiguation(combined)) continue;
      const firstParagraph = (summary.extract || '').split('\n').map((part) => part.trim()).find(Boolean);
      if (!firstParagraph) continue;

      const combinedLower = combined.toLowerCase();
      const score =
        (combinedLower.includes(normalizedNameLower) ? 3 : 0) +
        (combinedLower.includes(lang === 'ru' ? 'музыкант' : 'musician') ? 2 : 0) +
        (combinedLower.includes(lang === 'ru' ? 'пев' : 'singer') ? 1 : 0);

      if (score > bestScore) {
        bestScore = score;
        best = {
          description: trimBySentence(firstParagraph, maxLength),
          imageUrl: summary.originalimage?.source || summary.thumbnail?.source,
        };
      }
    }

    if (lang === 'ru' && best) {
      return { ...best, source: 'ru' };
    }
    if (lang === 'en' && best) {
      enBest = best;
    }
  }

  if (enBest?.description) {
    return {
      description: trimBySentence(await translateToRussian(enBest.description), maxLength),
      imageUrl: enBest.imageUrl,
      source: 'en-translated',
    };
  }

  return {
    description: options?.fallbackDescription || '',
    source: 'none',
  };
};

export const resolveAlbumDescriptionRu = async (
  albumTitle: string,
  albumArtist: string,
  options?: { fallbackDescription?: string; maxLength?: number }
): Promise<AlbumDescriptionResult> => {
  const normalizedTitle = albumTitle.trim();
  const normalizedArtist = albumArtist.trim();
  const maxLength = options?.maxLength ?? 320;

  const queriesByLang: Record<WikiLang, string[]> = {
    ru: [
      `"${normalizedTitle}" "${normalizedArtist}" альбом`,
      `${normalizedTitle} ${normalizedArtist} альбом`,
      `${normalizedTitle} альбом`,
    ],
    en: [
      `"${normalizedTitle}" "${normalizedArtist}" album`,
      `${normalizedTitle} ${normalizedArtist} album`,
      `${normalizedTitle} album`,
    ],
  };

  let enBestDescription = '';

  for (const lang of ['ru', 'en'] as const) {
    const candidateTitles: string[] = [];
    for (const query of queriesByLang[lang]) {
      const found = await wikiSearch(query, lang);
      for (const title of found) {
        if (!candidateTitles.includes(title)) candidateTitles.push(title);
      }
    }

    let bestScore = -1;
    let bestDescription = '';
    const normalizedTitleLower = normalizedTitle.toLowerCase();
    const normalizedArtistLower = normalizedArtist.toLowerCase();

    for (const candidateTitle of candidateTitles.slice(0, 10)) {
      const summary = await wikiSummary(candidateTitle, lang);
      if (!summary) continue;
      const combined = `${summary.title || ''} ${summary.description || ''} ${summary.extract || ''}`;
      if (isLikelyDisambiguation(combined)) continue;
      const firstParagraph = (summary.extract || '').split('\n').map((part) => part.trim()).find(Boolean);
      if (!firstParagraph) continue;
      const combinedLower = combined.toLowerCase();
      const score =
        (combinedLower.includes(normalizedTitleLower) ? 4 : 0) +
        (combinedLower.includes(normalizedArtistLower) ? 3 : 0) +
        (combinedLower.includes(lang === 'ru' ? 'альбом' : 'album') || combinedLower.includes('ep') ? 2 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestDescription = trimBySentence(firstParagraph, maxLength);
      }
    }

    if (lang === 'ru' && bestDescription) {
      return { description: bestDescription, source: 'ru' };
    }
    if (lang === 'en' && bestDescription) {
      enBestDescription = bestDescription;
    }
  }

  if (enBestDescription) {
    return {
      description: trimBySentence(await translateToRussian(enBestDescription), maxLength),
      source: 'en-translated',
    };
  }

  return {
    description: options?.fallbackDescription || '',
    source: 'none',
  };
};
