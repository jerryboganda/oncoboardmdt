import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArchiveRestore, ArrowRight, Calendar, ChevronRight, Radio, Search } from 'lucide-react';
import { filterPatientCases } from '../lib/clinicalRules';
import { getOrganBoardTheme } from '../lib/organPalette';
import { api } from '../services/api';
import type { CaseStatus, CaseUrgency, MdtMeeting, OrganBoard, PatientCase } from '../types';
import { AnimatedNumber, SlidingHighlight } from './MotionPrimitives';
import { useToast } from './ToastProvider';

interface DashboardViewProps {
  cases: PatientCase[];
  archivedCases: PatientCase[];
  onCaseRestored: (restored: PatientCase) => void;
  meetings: MdtMeeting[];
  selectedOrgan: OrganBoard | 'All';
  onSelectOrgan: (board: OrganBoard | 'All') => void;
  onOpenCase: (caseId: string) => void;
  onEnterLiveMeeting: (meetingId: string) => void;
  onOpenNewCase: () => void;
  loading: boolean;
}

const BOARDS: (OrganBoard | 'All')[] = ['All', 'Thoracic', 'Neuro', 'Breast', 'GI', 'Heme'];

function urgencyColor(urgency: CaseUrgency): string {
  switch (urgency) {
    case 'Urgent':
      return 'text-rose-700 dark:text-rose-400 font-semibold';
    case 'Priority':
      return 'text-amber-700 dark:text-amber-400 font-medium';
    default:
      return 'text-ink-muted';
  }
}

function statusColor(status: CaseStatus): string {
  switch (status) {
    case 'Consensus Reached':
      return 'text-emerald-700 dark:text-emerald-400 font-medium';
    case 'In Review':
      return 'text-sky-700 dark:text-sky-400 font-medium';
    case 'Scheduled':
      return 'text-amber-700 dark:text-amber-400 font-medium';
    default:
      return 'text-ink-muted';
  }
}

export function DashboardView({
  cases,
  archivedCases,
  onCaseRestored,
  meetings,
  selectedOrgan,
  onSelectOrgan,
  onOpenCase,
  onEnterLiveMeeting,
  onOpenNewCase,
  loading,
}: DashboardViewProps) {
  const [search, setSearch] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<CaseUrgency | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<CaseStatus | 'All' | 'Archived'>('All');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const { pushToast } = useToast();
  const showArchived = statusFilter === 'Archived';

  const filteredCases = useMemo(
    () =>
      filterPatientCases(showArchived ? archivedCases : cases, {
        search,
        organBoard: selectedOrgan,
        urgency: urgencyFilter,
        status: showArchived ? 'All' : statusFilter,
      }),
    [cases, archivedCases, showArchived, search, selectedOrgan, urgencyFilter, statusFilter],
  );

  const handleRestore = async (c: PatientCase) => {
    setRestoringId(c.id);
    setRestoreError(null);
    try {
      const { patientCase } = await api.restoreCase(c.id);
      pushToast({
        title: `Restored ${patientCase.mrn}`,
        description: 'The case is back in the Case Registry.',
        variant: 'success',
        organBoard: patientCase.organBoard,
      });
      onCaseRestored(patientCase);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Unable to restore this case.');
    } finally {
      setRestoringId(null);
    }
  };

  const metrics = useMemo(() => {
    const scoped = selectedOrgan === 'All' ? cases : cases.filter((c) => c.organBoard === selectedOrgan);
    const urgentCount = scoped.filter((c) => c.urgency === 'Urgent' && c.status !== 'Consensus Reached').length;
    const consensusCount = scoped.filter((c) => c.status === 'Consensus Reached').length;
    const pendingReview = scoped.filter((c) => c.status !== 'Consensus Reached').length;
    const actionableBiomarkers = scoped.filter((c) =>
      c.genomics.mutations.some((m) => m.tier === 'Tier I-A' || m.tier === 'Tier I-B'),
    ).length;
    return { urgentCount, consensusCount, pendingReview, actionableBiomarkers };
  }, [cases, selectedOrgan]);

  // Completed sessions are history, so only Live and Scheduled ones count as upcoming.
  const upcomingMeetings = meetings.filter((m) => m.roomStatus !== 'Completed');
  const liveMeeting = upcomingMeetings.find((m) => m.roomStatus === 'Live') ?? upcomingMeetings[0] ?? null;
  const liveBoardToken = liveMeeting ? getOrganBoardTheme(liveMeeting.organBoard) : null;

  return (
    <div className="p-4 sm:p-6 max-w-[1440px] mx-auto space-y-6">
      {/* Live Tumour Board Session Strip */}
      {liveMeeting && liveBoardToken && (
        <section
          aria-label="Active Tumour Board Session"
          className="relative overflow-hidden rounded-lg bg-panel border border-hairline transition-colors"
        >
          <div className={`h-0.5 w-full ${liveBoardToken.topRuleClass}`} aria-hidden="true" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-5 py-4">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span
                  className={
                    liveMeeting.roomStatus === 'Live'
                      ? 'inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold'
                      : `${liveBoardToken.textClass} font-medium`
                  }
                >
                  <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                  {liveMeeting.roomStatus === 'Live' ? 'Live Session Active' : 'Next Scheduled Board'}
                </span>
                <span aria-hidden="true">·</span>
                <span className={`inline-flex items-center gap-1.5 font-medium ${liveBoardToken.textClass}`}>
                  <span
                    className={`h-2 w-2 rounded-xs ${liveBoardToken.swatchClass}`}
                    aria-hidden="true"
                  />
                  {liveMeeting.organBoard} Board
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{liveMeeting.agenda.length} cases queued</span>
              </div>
              <h2 className="font-display text-base sm:text-lg font-semibold text-ink truncate">
                {liveMeeting.title}
              </h2>
              <p className="text-xs text-ink-muted">
                Chair: {liveMeeting.chairName} · Real-time DICOM slice sync, specialty consensus voting, and AI minutes enabled
              </p>
            </div>
            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onEnterLiveMeeting(liveMeeting.id)}
              className="group inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <span>Enter Live Board Room</span>
              <ArrowRight
                className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </motion.button>
          </div>
        </section>
      )}

      {/* 4-Column Flat Clinical Metric Strip with Animated Tabular Counters */}
      <section
        aria-label="Clinical Tumour Board Summary Metrics"
        className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-hairline rounded-lg bg-panel border border-hairline"
      >
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-xs bg-slate-500 dark:bg-slate-400 shrink-0" aria-hidden="true" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Board Queue</p>
          </div>
          <p className="mt-1.5 text-2xl font-mono font-semibold text-ink">
            <AnimatedNumber value={metrics.pendingReview} />
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Cases awaiting MDT ratification
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-xs bg-rose-600 dark:bg-rose-400 shrink-0" aria-hidden="true" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Urgent Review Cases</p>
          </div>
          <p className="mt-1.5 text-2xl font-mono font-semibold text-rose-700 dark:text-rose-400">
            <AnimatedNumber value={metrics.urgentCount} />
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Priority staging or surgical window
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-xs bg-blue-700 dark:bg-sky-400 shrink-0" aria-hidden="true" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Tier I Biomarker Matches</p>
          </div>
          <p className="mt-1.5 text-2xl font-mono font-semibold text-blue-700 dark:text-sky-400">
            <AnimatedNumber value={metrics.actionableBiomarkers} />
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Actionable targeted or trial drivers
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-xs bg-emerald-600 dark:bg-emerald-400 shrink-0" aria-hidden="true" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Consensus Signed Off</p>
          </div>
          <p className="mt-1.5 text-2xl font-mono font-semibold text-emerald-700 dark:text-emerald-400">
            <AnimatedNumber value={metrics.consensusCount} />
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Locked multidisciplinary plans
          </p>
        </div>
      </section>

      {/* Multi-Organ Case Registry Table */}
      <section className="rounded-lg bg-panel border border-hairline overflow-hidden">
        {/* Filter Toolbar */}
        <div className="p-4 border-b border-hairline flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Organ Board Segmented Control with Gliding Highlight & 5-Color Swatches */}
          <div
            role="tablist"
            aria-label="Filter by Organ Tumour Board"
            className="flex items-center gap-1 p-1 rounded-md bg-slate-100 dark:bg-slate-900 overflow-x-auto"
          >
            {BOARDS.map((board) => {
              const active = selectedOrgan === board;
              const token = getOrganBoardTheme(board);
              return (
                <button
                  key={board}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelectOrgan(board)}
                  className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'text-ink'
                      : 'text-ink-muted hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {active && (
                    <SlidingHighlight
                      layoutId="dashboard-organ-tab"
                      className="bg-white dark:bg-slate-800 shadow-xs"
                    />
                  )}
                  {board !== 'All' && (
                    <span
                      className={`relative z-10 h-2 w-2 rounded-xs shrink-0 ${token.swatchClass}`}
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10">{board === 'All' ? 'All Boards' : board}</span>
                </button>
              );
            })}
          </div>

          {/* Search & Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 sm:w-64 min-w-[200px]">
              <Search
                className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <label htmlFor="case-search" className="sr-only">
                Search cases by MRN, diagnosis, or mutation
              </label>
              <input
                id="case-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search MRN, diagnosis, gene..."
                className="w-full pl-9 pr-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink placeholder:text-slate-400 transition-colors"
              />
            </div>

            <label htmlFor="urgency-filter" className="sr-only">
              Filter by urgency
            </label>
            <select
              id="urgency-filter"
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value as CaseUrgency | 'All')}
              className="px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
            >
              <option value="All">All Urgencies</option>
              <option value="Urgent">Urgent</option>
              <option value="Priority">Priority</option>
              <option value="Routine">Routine</option>
            </select>

            <label htmlFor="status-filter" className="sr-only">
              Filter by workflow status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as CaseStatus | 'All' | 'Archived');
                setRestoreError(null);
              }}
              className="px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
            >
              <option value="All">All Statuses</option>
              <option value="Intake">Intake</option>
              <option value="Scheduled">Scheduled</option>
              <option value="In Review">In Review</option>
              <option value="Consensus Reached">Consensus Reached</option>
              <option value="Archived">Archived</option>
            </select>
          </div>
        </div>

        {restoreError && (
          <div className="p-4 border-b border-hairline">
            <div role="alert" className="p-3 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {restoreError}
            </div>
          </div>
        )}

        {/* High-Density Clinical Case Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-hairline bg-slate-50/70 dark:bg-slate-900/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 px-3 whitespace-nowrap">Patient / MRN</th>
                <th className="py-3 px-3">Diagnosis &amp; Board</th>
                <th className="py-3 px-3 whitespace-nowrap">AJCC Stage</th>
                <th className="py-3 px-3">Key Biomarkers</th>
                <th className="py-3 px-3 whitespace-nowrap">Urgency</th>
                <th className="py-3 px-3 whitespace-nowrap">Status</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline text-xs">
              {loading ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-4 px-3">
                      <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                    </td>
                    <td className="py-4 px-3">
                      <div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 rounded" />
                    </td>
                    <td className="py-4 px-3">
                      <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
                    </td>
                    <td className="py-4 px-3">
                      <div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
                    </td>
                    <td className="py-4 px-3">
                      <div className="h-4 w-14 bg-slate-200 dark:bg-slate-800 rounded" />
                    </td>
                    <td className="py-4 px-3">
                      <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
                    </td>
                    <td className="py-4 px-3" />
                  </tr>
                ))
              ) : filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-6 text-center">
                    <p className="text-sm font-medium text-ink">
                      {showArchived
                        ? 'No archived cases match your current filter criteria.'
                        : 'No patient cases match your current filter criteria.'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {showArchived
                        ? 'Archived cases appear here and can be restored by their lead clinician or a board chair.'
                        : 'Reset filters or register a new oncology case for multidisciplinary review.'}
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('');
                          onSelectOrgan('All');
                          setUrgencyFilter('All');
                          setStatusFilter('All');
                        }}
                        className="px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        Reset Filters
                      </button>
                      <button
                        type="button"
                        onClick={onOpenNewCase}
                        className="px-3.5 py-2 rounded-md bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 transition-colors"
                      >
                        New Patient Case
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCases.map((c, idx) => {
                  const primaryMut = c.genomics.mutations[0];
                  const boardToken = getOrganBoardTheme(c.organBoard);
                  return (
                    <motion.tr
                      key={c.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.16, delay: Math.min(idx * 0.025, 0.15) }}
                      className="group hover:bg-slate-50/90 dark:hover:bg-slate-800/45 transition-colors"
                    >
                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-xs shrink-0 ${boardToken.swatchClass}`}
                            aria-hidden="true"
                          />
                          <span className="font-mono text-xs font-semibold tabular-nums text-ink">
                            {c.mrn}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 pl-4 tabular-nums">
                          {c.patientInitials} · {c.age}y {c.sex}
                        </div>
                      </td>
                      <td className="py-3 px-3 align-top max-w-[250px]">
                        {showArchived ? (
                          <span className="block text-xs font-medium text-ink line-clamp-1">
                            {c.primaryDiagnosis}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenCase(c.id)}
                            className="text-left text-xs font-medium text-ink hover:text-blue-700 dark:hover:text-sky-400 transition-colors line-clamp-1"
                          >
                            {c.primaryDiagnosis}
                          </button>
                        )}
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          <span className={`font-medium ${boardToken.textClass}`}>
                            {c.organBoard} Board
                          </span>{' '}
                          · {c.histology}
                        </div>
                      </td>
                      <td className="py-3 px-3 align-top max-w-[155px]">
                        <div className="font-mono text-xs font-semibold tabular-nums text-ink whitespace-nowrap">
                          {c.stageGroup}
                        </div>
                        <div
                          title={`${c.tnmT} ${c.tnmN} ${c.tnmM} · ECOG ${c.ecog}`}
                          className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400 mt-0.5 truncate"
                        >
                          {c.tnmT} {c.tnmN} {c.tnmM} · ECOG {c.ecog}
                        </div>
                      </td>
                      <td className="py-3 px-3 align-top max-w-[170px]">
                        <div className="font-mono text-xs text-ink truncate">
                          {primaryMut ? `${primaryMut.gene} ${primaryMut.variant}` : 'NGS Pending'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums truncate">
                          PD-L1 {c.genomics.pdL1Score} · {c.genomics.msiStatus}
                        </div>
                      </td>
                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        <span className={`text-xs ${urgencyColor(c.urgency)}`}>{c.urgency}</span>
                      </td>
                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        <span className={`text-xs ${statusColor(c.status)}`}>{c.status}</span>
                      </td>
                      <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                        {showArchived ? (
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.96 }}
                            disabled={restoringId === c.id}
                            onClick={() => handleRestore(c)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-blue-600 hover:text-blue-700 dark:hover:border-sky-400 dark:hover:text-sky-300 transition-colors whitespace-nowrap disabled:opacity-50"
                          >
                            <ArchiveRestore className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                            <span>{restoringId === c.id ? 'Restoring...' : 'Restore Case'}</span>
                          </motion.button>
                        ) : (
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.96 }}
                            onClick={() => onOpenCase(c.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-blue-600 hover:text-blue-700 dark:hover:border-sky-400 dark:hover:text-sky-300 transition-colors whitespace-nowrap"
                          >
                            <span>Open Dossier</span>
                            <ChevronRight
                              className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform duration-150"
                              aria-hidden="true"
                            />
                          </motion.button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Upcoming Scheduled Boards Footer Strip (Board-Color Coded) */}
      <section className="rounded-lg bg-panel border border-hairline p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-semibold text-ink">
            Upcoming Multidisciplinary Board Sessions
          </h3>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {upcomingMeetings.length} {upcomingMeetings.length === 1 ? 'session' : 'sessions'} scheduled
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {upcomingMeetings.slice(0, 3).map((m) => {
            const token = getOrganBoardTheme(m.organBoard);
            return (
              <motion.div
                key={m.id}
                whileHover={{ y: -2 }}
                transition={{ duration: 0.16 }}
                className={`relative overflow-hidden rounded-md border border-hairline ${token.hoverBorderClass} flex flex-col justify-between transition-colors`}
              >
                <div className={`h-0.5 w-full ${token.topRuleClass}`} aria-hidden="true" />
                <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className={`inline-flex items-center gap-1.5 font-medium ${token.textClass}`}>
                        <span
                          className={`h-2 w-2 rounded-xs ${token.swatchClass}`}
                          aria-hidden="true"
                        />
                        {m.organBoard} Board
                      </span>
                      <span
                        className={
                          m.roomStatus === 'Live'
                            ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                            : 'text-slate-500 dark:text-slate-400'
                        }
                      >
                        {m.roomStatus}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-ink">
                      {m.title}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {new Date(m.scheduledStart).toLocaleString([], {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>
                  </div>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onEnterLiveMeeting(m.id)}
                    className="w-full py-1.5 px-3 rounded text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    {m.roomStatus === 'Live' ? 'Join Live Session' : 'Open Session Room'}
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
