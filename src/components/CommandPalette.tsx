import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Command, Search, X } from 'lucide-react';
import {
  buildCommandItems,
  filterCommandItems,
  type CommandActionPayload,
  type CommandCategory,
} from '../lib/commandSearch';
import { getOrganBoardTheme } from '../lib/organPalette';
import type { MdtMeeting, PatientCase } from '../types';
import { CLINICAL_SPRING } from './MotionPrimitives';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  cases: PatientCase[];
  meetings: MdtMeeting[];
  theme: 'light' | 'dark';
  onExecute: (action: CommandActionPayload) => void;
}

const CATEGORY_ORDER: CommandCategory[] = [
  'Patient Cases',
  'Tumour Board Sessions',
  'Workspaces & Boards',
  'Quick Actions',
];

export function CommandPalette({
  open,
  onClose,
  cases,
  meetings,
  theme,
  onExecute,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const allItems = useMemo(
    () => buildCommandItems(cases, meetings, theme),
    [cases, meetings, theme],
  );

  const filtered = useMemo(
    () => filterCommandItems(allItems, query),
    [allItems, query],
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (filtered.length === 0 ? 0 : (prev + 1) % filtered.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filtered.length === 0 ? 0 : (prev - 1 + filtered.length) % filtered.length,
        );
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        onExecute(filtered[selectedIndex].action);
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, filtered, selectedIndex, onExecute, onClose]);

  const grouped = useMemo(() => {
    const map = new Map<CommandCategory, typeof filtered>();
    for (const cat of CATEGORY_ORDER) {
      const subset = filtered.filter((item) => item.category === cat);
      if (subset.length > 0) map.set(cat, subset);
    }
    return map;
  }, [filtered]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Clinical Command Palette"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-slate-950/60 backdrop-blur-[2px]"
        >
          <motion.div
            data-testid="command-palette-dialog"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={CLINICAL_SPRING}
            className="w-full max-w-2xl rounded-lg bg-panel border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden"
          >
            {/* Search Input Header */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-hairline">
              <Search className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
              <label htmlFor="command-palette-input" className="sr-only">
                Jump to patient case, organ board, meeting, or clinical action
              </label>
              <input
                ref={inputRef}
                id="command-palette-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Jump to MRN, diagnosis, mutation (e.g. EGFR, IDH1), organ board, or action..."
                className="flex-1 bg-transparent text-sm text-ink placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close command palette"
                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Results List */}
            <div className="max-h-[56vh] overflow-y-auto py-2">
              {filtered.length === 0 ? (
                <div className="px-6 py-10 text-center space-y-1">
                  <p className="text-sm font-medium text-ink">
                    No matching clinical cases or commands found.
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Try searching by MRN (e.g. ONC-2026-4102), gene (EGFR, HER2), or board name (Thoracic, Neuro).
                  </p>
                </div>
              ) : (
                Array.from(grouped.entries()).map(([category, items]) => (
                  <div key={category} className="mb-2 last:mb-0">
                    <p className="px-4 py-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {category}
                    </p>
                    <div>
                      {items.map((item) => {
                        const globalIdx = filtered.findIndex((f) => f.id === item.id);
                        const isSelected = globalIdx === selectedIndex;
                        const boardTheme = item.boardColor
                          ? getOrganBoardTheme(item.boardColor)
                          : null;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onMouseEnter={() => setSelectedIndex(globalIdx)}
                            onClick={() => {
                              onExecute(item.action);
                              onClose();
                            }}
                            className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${
                              isSelected
                                ? 'bg-slate-100 dark:bg-slate-800/80'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              {boardTheme && (
                                <span
                                  className={`mt-1.5 h-2 w-2 rounded-xs shrink-0 ${boardTheme.swatchClass}`}
                                  aria-hidden="true"
                                />
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-ink truncate">
                                  {item.title}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                  {item.subtitle}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {item.meta && (
                                <span
                                  className={`font-mono text-[11px] ${
                                    item.meta === 'Urgent'
                                      ? 'text-rose-700 dark:text-rose-400 font-semibold'
                                      : item.meta === 'Live'
                                        ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                        : 'text-slate-500 dark:text-slate-400'
                                  }`}
                                >
                                  {item.meta}
                                </span>
                              )}
                              <ArrowRight
                                className={`h-3.5 w-3.5 transition-transform duration-150 ${
                                  isSelected
                                    ? 'text-ink translate-x-0.5'
                                    : 'text-slate-300 dark:text-slate-600'
                                }`}
                                aria-hidden="true"
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Keyboard Hint Footer */}
            <div className="px-4 py-2.5 border-t border-hairline bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-3 font-mono">
                <span>↑↓ Navigate</span>
                <span>↵ Open</span>
                <span>Esc Close</span>
              </div>
              <span className="inline-flex items-center gap-1 font-mono">
                <Command className="h-3 w-3" aria-hidden="true" />K Quick Jump
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
