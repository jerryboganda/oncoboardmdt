import { AnimatePresence, motion } from 'motion/react';
import { Menu, Moon, Plus, Sun } from 'lucide-react';
import { getOrganBoardTheme, type BoardColorKey } from '../lib/organPalette';

interface TopBarProps {
  breadcrumbParent: string;
  breadcrumbCurrent: string;
  activeBoardAccent?: BoardColorKey | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenNewCase: () => void;
  onOpenMobileMenu: () => void;
}

export function TopBar({
  breadcrumbParent,
  breadcrumbCurrent,
  activeBoardAccent,
  theme,
  onToggleTheme,
  onOpenNewCase,
  onOpenMobileMenu,
}: TopBarProps) {
  const boardToken =
    activeBoardAccent && activeBoardAccent !== 'All'
      ? getOrganBoardTheme(activeBoardAccent)
      : null;

  return (
    <header className="sticky top-0 z-30 h-16 px-4 sm:px-6 flex items-center justify-between gap-6 bg-panel/95 backdrop-blur border-b border-hairline no-print">
      {/* Left: Mobile drawer trigger + contextual breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 -ml-1 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0">
          {boardToken && (
            <span
              className={`h-2.5 w-2.5 rounded-xs shrink-0 ${boardToken.swatchClass}`}
              aria-hidden="true"
            />
          )}
          <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0 hidden sm:inline">
            {breadcrumbParent}
          </span>
          <span className="text-slate-300 dark:text-slate-600 hidden sm:inline" aria-hidden="true">
            /
          </span>
          <h1 className="font-display font-semibold text-ink truncate">
            {breadcrumbCurrent}
          </h1>
        </div>
      </div>

      {/* Right: Theme switch + Single Primary Action */}
      <div className="flex items-center gap-3 shrink-0">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to Clinical Light Mode' : 'Switch to Dark Radiology Mode'}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <span className="relative h-3.5 w-3.5 inline-flex items-center justify-center">
            <AnimatePresence mode="wait" initial={false}>
              {theme === 'dark' ? (
                <motion.span
                  key="sun"
                  initial={{ rotate: -45, opacity: 0, scale: 0.7 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 45, opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.16 }}
                  className="inline-flex"
                >
                  <Sun className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                </motion.span>
              ) : (
                <motion.span
                  key="moon"
                  initial={{ rotate: 45, opacity: 0, scale: 0.7 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: -45, opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.16 }}
                  className="inline-flex"
                >
                  <Moon className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <span className="hidden sm:inline">
            {theme === 'dark' ? 'Clinical Light' : 'Dark Radiology'}
          </span>
        </motion.button>

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={onOpenNewCase}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>New Patient Case</span>
        </motion.button>
      </div>
    </header>
  );
}
