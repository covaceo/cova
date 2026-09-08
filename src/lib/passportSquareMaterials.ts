import { materialRanks, type MaterialRank } from './passportMaterials';

// Share-only decorative plates. Website materials and optics are not modified.
const loaders: Record<MaterialRank, () => Promise<{ default: string }>> = {
  Unranked: () => import('../assets/passport-square-neutral-material.webp?inline'),
  Bronze: () => import('../assets/passport-square-bronze-material.webp?inline'),
  Silver: () => import('../assets/passport-square-silver-material.webp?inline'),
  Gold: () => import('../assets/passport-square-gold-material.webp?inline'),
  Platinum: () => import('../assets/passport-square-platinum-material.webp?inline'),
  Diamond: () => import('../assets/passport-square-diamond-material.webp?inline'),
  'Market Maker': () => import('../assets/passport-square-market-maker-material.webp?inline'),
};
export async function loadSquareMaterial(rank: string): Promise<{ rank: string; materialUrl: string }> {
  if (!materialRanks.includes(rank as MaterialRank)) throw new Error('Unknown square material.');
  const { default: materialUrl } = await loaders[rank as MaterialRank]();
  if (!/^data:image\/(?:webp|png);base64,[A-Za-z0-9+/=]+$/.test(materialUrl)) throw new Error('Invalid square material.');
  return { rank, materialUrl };
}
