import type { OrganBoard } from '../types';

export type BoardColorKey = OrganBoard | 'Multi-Organ' | 'All';

export interface OrganBoardColorToken {
  key: BoardColorKey;
  label: string;
  lightHex: string;
  darkHex: string;
  swatchClass: string;
  textClass: string;
  softBgClass: string;
  borderClass: string;
  hoverBorderClass: string;
  activeSurfaceClass: string;
  topRuleClass: string;
}

export const ORGAN_BOARD_PALETTE: Record<BoardColorKey, OrganBoardColorToken> = {
  Thoracic: {
    key: 'Thoracic',
    label: 'Thoracic',
    lightHex: '#0284C7',
    darkHex: '#38BDF8',
    swatchClass: 'bg-sky-600 dark:bg-sky-400',
    textClass: 'text-sky-700 dark:text-sky-400',
    softBgClass: 'bg-sky-50/80 dark:bg-sky-500/10',
    borderClass: 'border-sky-300/80 dark:border-sky-500/40',
    hoverBorderClass: 'hover:border-sky-400 dark:hover:border-sky-400/60',
    activeSurfaceClass: 'bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
    topRuleClass: 'bg-sky-600 dark:bg-sky-400',
  },
  Neuro: {
    key: 'Neuro',
    label: 'Neuro',
    lightHex: '#7C3AED',
    darkHex: '#A78BFA',
    swatchClass: 'bg-violet-600 dark:bg-violet-400',
    textClass: 'text-violet-700 dark:text-violet-400',
    softBgClass: 'bg-violet-50/80 dark:bg-violet-500/10',
    borderClass: 'border-violet-300/80 dark:border-violet-500/40',
    hoverBorderClass: 'hover:border-violet-400 dark:hover:border-violet-400/60',
    activeSurfaceClass: 'bg-violet-50 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
    topRuleClass: 'bg-violet-600 dark:bg-violet-400',
  },
  Breast: {
    key: 'Breast',
    label: 'Breast',
    lightHex: '#DB2777',
    darkHex: '#F472B6',
    swatchClass: 'bg-pink-600 dark:bg-pink-400',
    textClass: 'text-pink-700 dark:text-pink-400',
    softBgClass: 'bg-pink-50/80 dark:bg-pink-500/10',
    borderClass: 'border-pink-300/80 dark:border-pink-500/40',
    hoverBorderClass: 'hover:border-pink-400 dark:hover:border-pink-400/60',
    activeSurfaceClass: 'bg-pink-50 text-pink-800 dark:bg-pink-500/15 dark:text-pink-300',
    topRuleClass: 'bg-pink-600 dark:bg-pink-400',
  },
  GI: {
    key: 'GI',
    label: 'GI',
    lightHex: '#D97706',
    darkHex: '#FBBF24',
    swatchClass: 'bg-amber-600 dark:bg-amber-400',
    textClass: 'text-amber-700 dark:text-amber-400',
    softBgClass: 'bg-amber-50/80 dark:bg-amber-500/10',
    borderClass: 'border-amber-300/80 dark:border-amber-500/40',
    hoverBorderClass: 'hover:border-amber-400 dark:hover:border-amber-400/60',
    activeSurfaceClass: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    topRuleClass: 'bg-amber-600 dark:bg-amber-400',
  },
  Heme: {
    key: 'Heme',
    label: 'Heme',
    lightHex: '#059669',
    darkHex: '#34D399',
    swatchClass: 'bg-emerald-600 dark:bg-emerald-400',
    textClass: 'text-emerald-700 dark:text-emerald-400',
    softBgClass: 'bg-emerald-50/80 dark:bg-emerald-500/10',
    borderClass: 'border-emerald-300/80 dark:border-emerald-500/40',
    hoverBorderClass: 'hover:border-emerald-400 dark:hover:border-emerald-400/60',
    activeSurfaceClass: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    topRuleClass: 'bg-emerald-600 dark:bg-emerald-400',
  },
  'Multi-Organ': {
    key: 'Multi-Organ',
    label: 'Multi-Organ',
    lightHex: '#1D4ED8',
    darkHex: '#38BDF8',
    swatchClass: 'bg-blue-700 dark:bg-sky-400',
    textClass: 'text-blue-700 dark:text-sky-400',
    softBgClass: 'bg-blue-50/80 dark:bg-sky-500/10',
    borderClass: 'border-blue-300/80 dark:border-sky-500/40',
    hoverBorderClass: 'hover:border-blue-400 dark:hover:border-sky-400/60',
    activeSurfaceClass: 'bg-blue-50 text-blue-800 dark:bg-sky-500/15 dark:text-sky-300',
    topRuleClass: 'bg-blue-700 dark:bg-sky-400',
  },
  All: {
    key: 'All',
    label: 'All Boards',
    lightHex: '#1D4ED8',
    darkHex: '#38BDF8',
    swatchClass: 'bg-blue-700 dark:bg-sky-400',
    textClass: 'text-blue-700 dark:text-sky-400',
    softBgClass: 'bg-blue-50/80 dark:bg-sky-500/10',
    borderClass: 'border-slate-300 dark:border-slate-700',
    hoverBorderClass: 'hover:border-blue-400 dark:hover:border-sky-400/60',
    activeSurfaceClass: 'bg-blue-50 text-blue-800 dark:bg-sky-500/15 dark:text-sky-300',
    topRuleClass: 'bg-blue-700 dark:bg-sky-400',
  },
};

export function getOrganBoardTheme(board: BoardColorKey): OrganBoardColorToken {
  return ORGAN_BOARD_PALETTE[board] ?? ORGAN_BOARD_PALETTE['Multi-Organ'];
}

export function getOrganBoardHex(board: OrganBoard, isDark: boolean): string {
  const token = ORGAN_BOARD_PALETTE[board];
  return isDark ? token.darkHex : token.lightHex;
}
