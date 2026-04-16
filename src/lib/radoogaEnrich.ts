import { RadoogaCandidate } from './radoogaRecommendations';

export type EnrichKind = 'lyrics' | 'fact' | 'visual' | 'related';

const weightedKinds: Array<{ kind: EnrichKind; weight: number }> = [
  { kind: 'visual', weight: 40 },
  { kind: 'fact', weight: 24 },
  { kind: 'lyrics', weight: 22 },
  { kind: 'related', weight: 14 },
];

const pickWeightedKind = (): EnrichKind => {
  const totalWeight = weightedKinds.reduce((sum, item) => sum + item.weight, 0);
  const target = Math.random() * totalWeight;
  let cursor = 0;
  for (const item of weightedKinds) {
    cursor += item.weight;
    if (target <= cursor) return item.kind;
  }
  return 'visual';
};

const splitArtistNames = (artistField: string): string[] =>
  artistField
    .split(/\s*(?:,|&| x | X | and |;|feat\.?|ft\.?)\s*/gi)
    .map((value) => value.trim())
    .filter(Boolean);

export const getEnrichCopy = (candidate: RadoogaCandidate): { kind: EnrichKind; text: string } => {
  const artistNames = splitArtistNames(candidate.artist);
  const primaryArtist = artistNames[0] || candidate.artist;
  const relatedArtist = artistNames[1] || 'новый артист';
  const options: Record<EnrichKind, string> = {
    visual: `Атмосфера: ${candidate.genre || 'discover'} · плавный режим`,
    fact: `Факт: ${primaryArtist} часто попадает в рекомендации рядом с похожим настроением`,
    lyrics: `Текстовый вайб: у ${candidate.title} хорошо работает припев для короткого loop`,
    related: `Похожее: после этого трека попробуем ${relatedArtist}`,
  };
  const firstKind = pickWeightedKind();
  const fallbackOrder: EnrichKind[] = [firstKind, 'visual', 'fact', 'lyrics', 'related'];
  const selectedKind = fallbackOrder.find((kind, index) => index === 0 || options[kind]) || 'visual';
  return { kind: selectedKind, text: options[selectedKind] };
};

export const getEnrichRotation = (): EnrichKind[] => {
  const first = pickWeightedKind();
  const rest: EnrichKind[] = ['lyrics', 'fact', 'visual', 'related'].filter((kind) => kind !== first) as EnrichKind[];
  return [first, ...rest];
};
