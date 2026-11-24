import type { WorldFlower } from './world';
import blueLevel1 from '../graphics/icons/flower-blue-level-1.png';
import blueLevel2 from '../graphics/icons/flower-blue-level-2.png';
import blueLevel3 from '../graphics/icons/flower-blue-level-3.png';
import blueLevel4 from '../graphics/icons/flower-blue-level-4.png';
import blueLevel5 from '../graphics/icons/flower-blue-level-5.png';
import yellowLevel1 from '../graphics/icons/flower-yellow-level-1.png';
import yellowLevel2 from '../graphics/icons/flower-yellow-level-2.png';
import yellowLevel3 from '../graphics/icons/flower-yellow-level-3.png';
import yellowLevel4 from '../graphics/icons/flower-yellow-level-4.png';
import yellowLevel5 from '../graphics/icons/flower-yellow-level-5.png';
import purpleLevel1 from '../graphics/icons/flower-purple-level-1.png';
import purpleLevel2 from '../graphics/icons/flower-purple-level-2.png';
import purpleLevel3 from '../graphics/icons/flower-purple-level-3.png';
import purpleLevel4 from '../graphics/icons/flower-purple-level-4.png';
import purpleLevel5 from '../graphics/icons/flower-purple-level-5.png';
import redLevel1 from '../graphics/icons/flower-red-level-1.png';
import redLevel2 from '../graphics/icons/flower-red-level-2.png';
import redLevel3 from '../graphics/icons/flower-red-level-3.png';
import redLevel4 from '../graphics/icons/flower-red-level-4.png';
import redLevel5 from '../graphics/icons/flower-red-level-5.png';
import greeneryLevel1 from '../graphics/icons/greenery-level-1.png';
import greeneryLevel2 from '../graphics/icons/greenery-level-2.png';
import greeneryLevel3 from '../graphics/icons/greenery-level-3.png';
import greeneryLevel4 from '../graphics/icons/greenery-level-4.png';
import greeneryLevel5 from '../graphics/icons/greenery-level-5.png';
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
  blue: blueLevel1,
  yellow: yellowLevel1,
  purple: purpleLevel1,
  red: redLevel1,
} as const satisfies Record<WorldFlower, string>;

export const flowerLevel5Icons = {
  blue: blueLevel5,
  yellow: yellowLevel5,
  purple: purpleLevel5,
  red: redLevel5,
} as const satisfies Record<WorldFlower, string>;

export const itemLevelIcons = {
  blue: [blueLevel1, blueLevel2, blueLevel3, blueLevel4, blueLevel5],
  yellow: [yellowLevel1, yellowLevel2, yellowLevel3, yellowLevel4, yellowLevel5],
  purple: [purpleLevel1, purpleLevel2, purpleLevel3, purpleLevel4, purpleLevel5],
  red: [redLevel1, redLevel2, redLevel3, redLevel4, redLevel5],
  greenery: [greeneryLevel1, greeneryLevel2, greeneryLevel3, greeneryLevel4, greeneryLevel5],
} as const;

export const itemIcons = {
  blue: blueLevel1,
  yellow: yellowLevel1,
  purple: purpleLevel1,
  red: redLevel1,
  greenery: greeneryLevel1,
} as const;

export const qualityIcons = {
  normal: normalQuality,
  uncommon: uncommonQuality,
  rare: rareQuality,
  epic: epicQuality,
  legendary: legendaryQuality,
  mythic: mythicQuality,
  exalted: exaltedQuality,
  divine: divineQuality,
  cosmic: cosmicQuality,
  transcendent: transcendentQuality,
} as const;

export const qualityOrder = [
  'normal', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exalted', 'divine', 'cosmic', 'transcendent',
] as const satisfies readonly (keyof typeof qualityIcons)[];
