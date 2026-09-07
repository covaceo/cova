/** Visual-study catalog only. Never grants a rank, billing entitlement or account verification. */
export const materialRanks = ['Unranked', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Market Maker'] as const;
export const materialFinishes = ['standard', '90', '180', '365'] as const;
export type MaterialRank = typeof materialRanks[number];
export type MaterialFinish = typeof materialFinishes[number];
export type PassportAppearance = {
  id: string; rank: string; finish: string; materialUrl: string;
  ink: string; mutedInk: string; tone: [number, number, number, number]; finishInk: string; light: [number, number, number, number]; film: number; refraction: number; gloss: number; finishIndex: number;
};
const rankSettings: Record<MaterialRank, { film: number; refraction: number; gloss: number }> = {
  Unranked: { film: 0.08, refraction: 0.03, gloss: 12 },
  Bronze: { film: 0.28, refraction: 0.3, gloss: 28 },
  Silver: { film: 0.16, refraction: 0.12, gloss: 32 },
  Gold: { film: 0.55, refraction: 0.8, gloss: 64 },
  Platinum: { film: 0.3, refraction: 0.55, gloss: 128 },
  Diamond: { film: 1.12, refraction: 1.7, gloss: 80 },
  "Market Maker": { film: 0.72, refraction: 1.35, gloss: 92 },
};
export function getMaterialSpec(rank: string, finish: string): Omit<PassportAppearance, 'materialUrl'> {
  const safeRank = materialRanks.includes(rank as MaterialRank) ? rank as MaterialRank : 'Gold';
  const safeFinish = materialFinishes.includes(finish as MaterialFinish) ? finish as MaterialFinish : 'standard';
  return {
    id: `${safeRank}-${safeFinish}`, rank: safeRank, finish: safeFinish,
    ink: safeRank === 'Unranked' || safeRank === 'Bronze' || safeRank === 'Market Maker' ? '#f8fbff' : safeRank === 'Gold' ? '#1b160c' : safeRank === 'Silver' || safeRank === 'Platinum' ? '#171d23' : '#27313c',
    mutedInk: safeRank === 'Unranked' || safeRank === 'Bronze' || safeRank === 'Market Maker' ? '#e8eeff' : safeRank === 'Gold' ? '#21190c' : safeRank === 'Silver' || safeRank === 'Platinum' ? '#202932' : '#414b5b',
    tone: safeRank === 'Unranked' ? [0.68,0.8,1,1] : safeRank === 'Silver' ? [1,1,1,1] : safeRank === 'Platinum' ? [0.68,0.86,1,1] : safeRank === 'Gold' ? [1,0.76,0.34,1] : safeRank === 'Bronze' ? [0.84,0.54,0.28,1] : safeRank === 'Market Maker' ? [1,0.16,0.22,1] : [1,1,1,0],
    // Sweep inverse width, sweep strength, specular strength, edge strength.
    light: safeRank === 'Unranked' ? [4,0.018,0.006,0.015] : safeRank === 'Silver' ? [5.5,0.1,0.065,0.12] : safeRank === 'Platinum' ? [18,0.18,0.2,0.22] : [10,0.14,0.14,0.22],
    finishInk: safeRank === 'Unranked' ? '#bed0e3' : safeRank === 'Silver' ? '#59636c' : safeRank === 'Platinum' ? '#42739b' : safeRank === 'Gold' ? '#6f4715' : safeRank === 'Bronze' ? '#c69259' : safeRank === 'Market Maker' ? '#fa6575' : '#7a93c5',
    ...rankSettings[safeRank], finishIndex: materialFinishes.indexOf(safeFinish),
  };
}
// Decorative plates load on selection. The protected pearl remains the no-appearance fallback.
const loaders: Record<MaterialRank, () => Promise<{ default: string }>> = {
  Unranked: () => import('../assets/passport-neutral-material.webp?inline'),
  Bronze: () => import('../assets/passport-bronze-material.webp?inline'),
  Silver: () => import('../assets/passport-silver-material.webp?inline'),
  Gold: () => import('../assets/passport-gold-material.webp?inline'),
  Platinum: () => import('../assets/passport-platinum-material.webp?inline'),
  Diamond: () => import('../assets/passport-diamond-material.webp?inline'),
  'Market Maker': () => import('../assets/passport-market-maker-material.webp?inline'),
};
export async function loadPassportAppearance(rank: string, finish: string): Promise<PassportAppearance> {
  const spec = getMaterialSpec(rank, finish);
  const { default: materialUrl } = await loaders[spec.rank as MaterialRank]();
  return { ...spec, materialUrl };
}
