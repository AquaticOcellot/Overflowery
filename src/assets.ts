import cyanIcon from '../graphics/icons/flower-cyan.png';
import goldIcon from '../graphics/icons/flower-gold.png';
import neonIcon from '../graphics/icons/flower-neon.png';
import purpleIcon from '../graphics/icons/flower-purple.png';
import normalQuality from '../graphics/icons/quality-normal.png';
import uncommonQuality from '../graphics/icons/quality-uncommon.png';
import rareQuality from '../graphics/icons/quality-rare.png';
import epicQuality from '../graphics/icons/quality-epic.png';
import legendaryQuality from '../graphics/icons/quality-legendary.png';
import mythicQuality from '../graphics/icons/quality-mythic.png';
import divineQuality from '../graphics/icons/quality-divine.png';
import exaltedQuality from '../graphics/icons/quality-exalted.png';
import cosmicQuality from '../graphics/icons/quality-cosmic.png';
import transcendentQuality from '../graphics/icons/quality-transcendent.png';

export const flowerIcons = {
  cyan: cyanIcon,
  gold: goldIcon,
  neon: neonIcon,
  purple: purpleIcon,
} as const;

export const qualityIcons = {
  normal: normalQuality,
  uncommon: uncommonQuality,
  rare: rareQuality,
  epic: epicQuality,
  legendary: legendaryQuality,
  mythic: mythicQuality,
  divine: divineQuality,
  exalted: exaltedQuality,
  cosmic: cosmicQuality,
  transcendent: transcendentQuality,
} as const;
