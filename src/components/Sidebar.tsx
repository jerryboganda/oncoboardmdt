import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  BarChart3,
  CalendarClock,
  ClipboardList,
  Database,
  Radio,
  Search,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { getOrganBoardTheme } from '../lib/organPalette';
import type { Clinician, OrganBoard, PatientCase } from '../types';
import { CLINICAL_SPRING, SlidingHighlight } from './MotionPrimitives';

export type ActiveNavSection = 'registry' | 'analytics' | 'meetings' | 'live-board' | 'audit';

interface SidebarProps {
  activeSection: ActiveNavSection;
  onSelectSection: (section: ActiveNavSection) => void;
  cases: PatientCase[];
  selectedOrganFilter: OrganBoard | 'All';
  onSelectOrganFilter: (board: OrganBoard | 'All') => void;
  clinician: Clinician | null;
  onOpenAuthModal: () => void;
  onOpenCommandPalette: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  hasLiveMeeting: boolean;
}

const ORGAN_BOARDS: OrganBoard[] = ['Thoracic', 'Neuro', 'Breast', 'GI', 'Heme'];

export function Sidebar({
  activeSection,
  onSelectSection,
  cases,
  selectedOrganFilter,
  onSelectOrganFilter,
  clinician,
  onOpenAuthModal,
  onOpenCommandPalette,
  mobileOpen,
  onCloseMobile,
  hasLiveMeeting,
}: SidebarProps) {
  const navItems: {
    id: ActiveNavSection;
    label: string;
    icon: typeof ClipboardList;
    meta?: string;
  }[] = [
    { id: 'registry', label: 'Case Registry', icon: ClipboardList, meta: String(cases.length) },
    { id: 'analytics', label: 'Clinical Analytics', icon: BarChart3 },
    { id: 'meetings', label: 'Board Schedule', icon: CalendarClock },
    {
      id: 'live-board',
      label: 'Live Board Room',
      icon: Radio,
      meta: hasLiveMeeting ? 'Live' : undefined,
    },
    { id: 'audit', label: 'Audit & Database', icon: Database },
  ];

  const renderSidebarContent = (layoutPrefix: string) => (
    <div className="flex h-full flex-col bg-panel border-r border-hairline">
      {/* Brand header */}
      <div className="flex items-center justify-between px-5 h-16 border-b border-hairline shrink-0">
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            onSelectSection('registry');
            onSelectOrganFilter('All');
            onCloseMobile();
          }}
          className="flex items-center gap-2.5 text-left rounded"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-700 dark:bg-sky-500/15 text-white dark:text-sky-400">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="font-display text-base font-bold tracking-tight text-ink whitespace-nowrap">
            OncoBoard MDT
          </span>
        </motion.button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Quick Command Palette Trigger */}
      <div className="px-3 pt-3 pb-1">
        <motion.button
          type="button"
          whileTap={{ scale: 0.985 }}
          onClick={() => {
            onCloseMobile();
            onOpenCommandPalette();
          }}
          aria-label="Open clinical quick jump command palette"
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-slate-50 dark:bg-slate-900/80 border border-hairline hover:border-slate-300 dark:hover:border-slate-700 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          <span className="inline-flex items-center gap-2 truncate">
            <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Quick Jump...</span>
          </span>
          <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 shrink-0">
            ⌘K
          </kbd>
        </motion.button>
      </div>

      {/* Primary Workspace Navigation */}
      <nav aria-label="Primary Clinical Workspaces" className="px-3 py-3 space-y-1">
        <p className="px-2.5 pb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Clinical Workspaces
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <motion.button
              key={item.id}
              type="button"
              whileTap={{ scale: 0.985 }}
              onClick={() => {
                onSelectSection(item.id);
                onCloseMobile();
              }}
              className={`relative w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'text-blue-800 dark:text-sky-300'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
              }`}
            >
              {isActive && (
                <SlidingHighlight
                  layoutId={`${layoutPrefix}-workspace-active`}
                  className="bg-blue-50 dark:bg-sky-500/12 border border-blue-200/70 dark:border-sky-500/25 rounded-md"
                />
              )}
              <span className="relative z-10 flex items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </span>
              {item.meta && (
                <span
                  className={`relative z-10 font-mono text-xs tabular-nums ${
                    item.meta === 'Live'
                      ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {item.meta}
                </span>
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Organ Subspecialty Boards (Unified 5-Color Palette) */}
      <div className="px-3 py-3.5 border-t border-hairline flex-1 overflow-y-auto">
        <p className="px-2.5 pb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          Organ Tumour Boards
        </p>
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => {
              onSelectOrganFilter('All');
              if (activeSection !== 'analytics') onSelectSection('registry');
              onCloseMobile();
            }}
            className={`relative w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
              (activeSection === 'registry' || activeSection === 'analytics') &&
              selectedOrganFilter === 'All'
                ? 'text-ink font-medium'
                : 'text-ink-muted hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            {(activeSection === 'registry' || activeSection === 'analytics') &&
              selectedOrganFilter === 'All' && (
                <SlidingHighlight
                  layoutId={`${layoutPrefix}-organ-active`}
                  className="bg-slate-100 dark:bg-slate-800/90 rounded-md"
                />
              )}
            <span className="relative z-10 flex items-center gap-2.5">
              <span
                className="h-2 w-2 rounded-xs bg-blue-700 dark:bg-sky-400 shrink-0"
                aria-hidden="true"
              />
              <span>All Multi-Organ Boards</span>
            </span>
            <span className="relative z-10 font-mono text-xs tabular-nums">{cases.length}</span>
          </button>

          {ORGAN_BOARDS.map((board) => {
            const count = cases.filter((c) => c.organBoard === board).length;
            const active =
              (activeSection === 'registry' || activeSection === 'analytics') &&
              selectedOrganFilter === board;
            const token = getOrganBoardTheme(board);

            return (
              <button
                key={board}
                type="button"
                onClick={() => {
                  onSelectOrganFilter(board);
                  if (activeSection !== 'analytics') onSelectSection('registry');
                  onCloseMobile();
                }}
                className={`relative w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? `${token.textClass} font-medium`
                    : 'text-ink-muted hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                {active && (
                  <SlidingHighlight
                    layoutId={`${layoutPrefix}-organ-active`}
                    className={`${token.softBgClass} border ${token.borderClass} rounded-md`}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2.5">
                  <span
                    className={`h-2 w-2 rounded-xs shrink-0 ${token.swatchClass}`}
                    aria-hidden="true"
                  />
                  <span>{board} Oncology</span>
                </span>
                <span className="relative z-10 font-mono text-xs tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Clinician Account Footer */}
      <div className="p-3 border-t border-hairline shrink-0">
        <motion.button
          type="button"
          whileTap={{ scale: 0.985 }}
          onClick={onOpenAuthModal}
          className="w-full flex items-center gap-3 p-2.5 rounded-md border border-hairline hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
            <UserRoundCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ink truncate">
              {clinician ? clinician.fullName : 'Sign In Required'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {clinician ? clinician.specialty : 'Switch or authenticate'}
            </p>
          </div>
        </motion.button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-[248px] shrink-0 h-screen sticky top-0 no-print">
        {renderSidebarContent('desktop')}
      </aside>
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex no-print">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
              onClick={onCloseMobile}
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: -272 }}
              animate={{ x: 0 }}
              exit={{ x: -272 }}
              transition={CLINICAL_SPRING}
              className="relative z-10 w-[264px] max-w-[85vw] h-full shadow-2xl"
            >
              {renderSidebarContent('mobile')}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
