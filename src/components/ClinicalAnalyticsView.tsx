import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, Download } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ALL_ORGAN_BOARDS,
  buildDiagnosisTrendsByOrgan,
  buildMdtThroughputSeries,
  buildProcessingTimeMetrics,
  computeAnalyticsKpis,
  formatAnalyticsCsv,
  SLA_TARGET_HOURS,
  type AnalyticsTimeframe,
} from '../lib/clinicalAnalytics';
import { getOrganBoardHex, getOrganBoardTheme } from '../lib/organPalette';
import type { MdtMeeting, OrganBoard, PatientCase } from '../types';
import { AnimatedNumber, SlidingHighlight } from './MotionPrimitives';
import { useToast } from './ToastProvider';

interface ClinicalAnalyticsViewProps {
  cases: PatientCase[];
  meetings: MdtMeeting[];
  theme: 'light' | 'dark';
  selectedOrgan: OrganBoard | 'All';
  onSelectOrgan: (board: OrganBoard | 'All') => void;
  onOpenBoardInRegistry: (board: OrganBoard) => void;
  loading: boolean;
}

const TIMEFRAMES: { id: AnalyticsTimeframe; label: string }[] = [
  { id: '30d', label: '30 Days' },
  { id: '90d', label: '90 Days' },
  { id: '6m', label: '6 Months' },
];

const BOARDS_FILTER: (OrganBoard | 'All')[] = ['All', ...ALL_ORGAN_BOARDS];

interface TooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  unitSuffix?: string;
}

function ClinicalChartTooltip({ active, payload, label, unitSuffix = '' }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-md bg-white dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 px-3 py-2.5 shadow-sm text-xs">
      <p className="font-display font-semibold text-ink mb-1.5 pb-1 border-b border-slate-100 dark:border-slate-800">
        {label}
      </p>
      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <div key={`${entry.dataKey ?? entry.name}-${idx}`} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span
                className="inline-block h-2 w-2 rounded-xs shrink-0"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              <span>{entry.name}</span>
            </span>
            <span className="font-mono font-semibold tabular-nums text-ink">
              {entry.value}
              {unitSuffix}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ClinicalAnalyticsView({
  cases,
  meetings,
  theme,
  selectedOrgan,
  onSelectOrgan,
  onOpenBoardInRegistry,
  loading,
}: ClinicalAnalyticsViewProps) {
  const { pushToast } = useToast();
  const [timeframe, setTimeframe] = useState<AnalyticsTimeframe>('6m');
  const [trendMode, setTrendMode] = useState<'stacked' | 'lines'>('stacked');
  const [turnaroundMode, setTurnaroundMode] = useState<'all' | 'urgent'>('all');

  const isDark = theme === 'dark';

  const palette = useMemo(
    () => ({
      grid: isDark ? '#1E293B' : '#E2E8F0',
      axisText: isDark ? '#94A3B8' : '#475569',
      cursorFill: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(29, 78, 216, 0.06)',
      casesBar: isDark ? '#38BDF8' : '#1D4ED8',
      consensusBar: isDark ? '#34D399' : '#059669',
      sessionsLine: isDark ? '#FBBF24' : '#D97706',
      slaLine: isDark ? '#FB7185' : '#DC2626',
      slaNominal: isDark ? '#38BDF8' : '#0284C7',
      slaWarning: isDark ? '#FBBF24' : '#D97706',
      slaBreach: isDark ? '#FB7185' : '#DC2626',
      mutedBar: isDark ? '#334155' : '#CBD5E1',
      boards: {
        Thoracic: getOrganBoardHex('Thoracic', isDark),
        Neuro: getOrganBoardHex('Neuro', isDark),
        Breast: getOrganBoardHex('Breast', isDark),
        GI: getOrganBoardHex('GI', isDark),
        Heme: getOrganBoardHex('Heme', isDark),
      } as Record<OrganBoard, string>,
    }),
    [isDark],
  );

  const throughputSeries = useMemo(
    () => buildMdtThroughputSeries(cases, meetings, selectedOrgan, timeframe),
    [cases, meetings, selectedOrgan, timeframe],
  );

  const diagnosisTrends = useMemo(
    () => buildDiagnosisTrendsByOrgan(cases, meetings, timeframe),
    [cases, meetings, timeframe],
  );

  const processingMetrics = useMemo(
    () => buildProcessingTimeMetrics(cases, meetings, timeframe),
    [cases, meetings, timeframe],
  );

  const kpis = useMemo(
    () => computeAnalyticsKpis(cases, meetings, selectedOrgan, timeframe),
    [cases, meetings, selectedOrgan, timeframe],
  );

  const visibleBoards: OrganBoard[] = useMemo(
    () => (selectedOrgan === 'All' ? ALL_ORGAN_BOARDS : [selectedOrgan]),
    [selectedOrgan],
  );

  const handleExportCsv = () => {
    const csv = formatAnalyticsCsv(throughputSeries, diagnosisTrends, processingMetrics);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `oncoboard-clinical-analytics-${timeframe}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    pushToast({
      title: 'Analytics CSV exported',
      description: `Downloaded ${selectedOrgan === 'All' ? 'multi-organ' : selectedOrgan} board metrics (${timeframe} window).`,
      variant: 'success',
      organBoard: selectedOrgan === 'All' ? 'Multi-Organ' : selectedOrgan,
    });
  };

  const slaLimit = turnaroundMode === 'urgent' ? 36 : SLA_TARGET_HOURS;

  return (
    <div className="p-4 sm:p-6 max-w-[1440px] mx-auto space-y-6">
      {/* Header & Controls Bar */}
      <section className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Multi-Disciplinary Operations</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {cases.length} live cases · {meetings.length} active schedules
            </span>
            <span aria-hidden="true">·</span>
            <span>{selectedOrgan === 'All' ? 'All Organ Boards' : `${selectedOrgan} Board Scope`}</span>
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-ink">
            Clinical Analytics &amp; Tumour Board Performance
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Timeframe Segmented Selector with Gliding Spring Pill */}
          <div
            role="group"
            aria-label="Analytics Timeframe"
            className="inline-flex items-center gap-1 p-1 rounded-md bg-slate-100 dark:bg-slate-900 border border-hairline"
          >
            {TIMEFRAMES.map((tf) => {
              const active = timeframe === tf.id;
              return (
                <button
                  key={tf.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTimeframe(tf.id)}
                  className={`relative px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'text-ink'
                      : 'text-ink-muted hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {active && (
                    <SlidingHighlight
                      layoutId="analytics-timeframe"
                      className="bg-white dark:bg-slate-800 shadow-xs"
                    />
                  )}
                  <span className="relative z-10">{tf.label}</span>
                </button>
              );
            })}
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-panel text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-blue-600 hover:text-blue-700 dark:hover:border-sky-400 dark:hover:text-sky-300 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </motion.button>
        </div>
      </section>

      {/* Organ Board Scope Filter with Unified 5-Color Swatches & Gliding Indicator */}
      <section aria-label="Filter analytics by organ board" className="flex items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Organ Board Scope"
          className="flex items-center gap-1 p-1 rounded-md bg-slate-100 dark:bg-slate-900 border border-hairline overflow-x-auto max-w-full"
        >
          {BOARDS_FILTER.map((board) => {
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
                    layoutId="analytics-organ-scope"
                    className="bg-white dark:bg-slate-800 shadow-xs"
                  />
                )}
                {board !== 'All' && (
                  <span
                    className={`relative z-10 h-2 w-2 rounded-xs shrink-0 ${token.swatchClass}`}
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10">
                  {board === 'All' ? 'All Organ Boards' : `${board} Board`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4-Column Flat KPI Summary Strip with Animated Numbers */}
      <section
        aria-label="Clinical Analytics Key Metrics"
        className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-hairline rounded-lg bg-panel border border-hairline"
      >
        {loading ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="p-4 sm:p-5 animate-pulse space-y-2">
              <div className="h-3 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3 w-36 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          ))
        ) : (
          <>
            <div className="p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                MDT Sessions Conducted
              </p>
              <p className="mt-1.5 text-2xl font-mono font-semibold text-ink">
                <AnimatedNumber value={kpis.totalMeetings} data-testid="kpi-total-meetings" />
              </p>
              <p className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Avg {kpis.avgCasesPerMeeting} cases / session
              </p>
            </div>
            <div className="p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Cases Evaluated
              </p>
              <p className="mt-1.5 text-2xl font-mono font-semibold text-blue-700 dark:text-sky-400">
                <AnimatedNumber value={kpis.totalCasesEvaluated} data-testid="kpi-total-cases" />
              </p>
              <p className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {kpis.livePendingCases} awaiting review in live queue
              </p>
            </div>
            <div className="p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Consensus Ratification
              </p>
              <p className="mt-1.5 text-2xl font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                <AnimatedNumber
                  value={kpis.consensusRatePct}
                  suffix="%"
                  data-testid="kpi-consensus-rate"
                />
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Quorum-verified clinical plans
              </p>
            </div>
            <div className="p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Avg Case Processing Time
              </p>
              <p className="mt-1.5 text-2xl font-mono font-semibold text-ink">
                <AnimatedNumber
                  value={kpis.avgProcessingHours}
                  decimals={1}
                  suffix="h"
                  data-testid="kpi-avg-processing"
                />
              </p>
              <p className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {kpis.slaCompliancePct}% within 72h clinical SLA
              </p>
            </div>
          </>
        )}
      </section>

      {/* Row 1: MDT Meeting Throughput (7 cols) + Average Case Processing Time (5 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Chart 1: MDT Meeting Throughput */}
        <section
          aria-label="MDT Meeting Throughput Chart"
          className="xl:col-span-7 rounded-lg bg-panel border border-hairline p-4 sm:p-5 flex flex-col"
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-4">
            <div>
              <h3 className="font-display text-sm sm:text-base font-semibold text-ink">
                MDT Meeting Throughput
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Monthly cases reviewed &amp; ratified against tumour board sessions conducted
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300 shrink-0">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-xs"
                  style={{ backgroundColor: palette.casesBar }}
                  aria-hidden="true"
                />
                Cases Reviewed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-xs"
                  style={{ backgroundColor: palette.consensusBar }}
                  aria-hidden="true"
                />
                Consensus Reached
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-0.5 w-3.5"
                  style={{ backgroundColor: palette.sessionsLine }}
                  aria-hidden="true"
                />
                MDT Sessions
              </span>
            </div>
          </div>

          <div className="w-full h-[300px]" data-testid="chart-mdt-throughput">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={throughputSeries}
                margin={{ top: 10, right: 12, left: -12, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={{ fill: palette.axisText, fontSize: 11 }}
                  axisLine={{ stroke: palette.grid }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="cases"
                  tick={{ fill: palette.axisText, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="sessions"
                  orientation="right"
                  tick={{ fill: palette.axisText, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: palette.cursorFill }}
                  content={<ClinicalChartTooltip />}
                />
                <Bar
                  yAxisId="cases"
                  dataKey="casesReviewed"
                  name="Cases Reviewed"
                  fill={palette.casesBar}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  yAxisId="cases"
                  dataKey="consensusReached"
                  name="Consensus Reached"
                  fill={palette.consensusBar}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
                <Line
                  yAxisId="sessions"
                  type="monotone"
                  dataKey="meetingsHeld"
                  name="MDT Sessions"
                  stroke={palette.sessionsLine}
                  strokeWidth={2.25}
                  dot={{ r: 3.5, fill: palette.sessionsLine, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Chart 2: Average Case Processing Time */}
        <section
          aria-label="Average Case Processing Time Chart"
          className="xl:col-span-5 rounded-lg bg-panel border border-hairline p-4 sm:p-5 flex flex-col"
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-4">
            <div>
              <h3 className="font-display text-sm sm:text-base font-semibold text-ink">
                Average Case Processing Time
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Mean intake-to-consensus turnaround (hours) vs {slaLimit}h SLA target
              </p>
            </div>
            <div
              role="group"
              aria-label="Turnaround cohort mode"
              className="inline-flex items-center gap-1 p-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-hairline shrink-0 self-start"
            >
              {(
                [
                  ['all', 'All Cases'],
                  ['urgent', 'Urgent Triage'],
                ] as const
              ).map(([id, label]) => {
                const active = turnaroundMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTurnaroundMode(id)}
                    className={`relative px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'text-ink'
                        : 'text-ink-muted hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {active && (
                      <SlidingHighlight
                        layoutId="analytics-turnaround-mode"
                        className="bg-white dark:bg-slate-800 shadow-xs"
                      />
                    )}
                    <span className="relative z-10">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-full h-[300px]" data-testid="chart-processing-time">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={processingMetrics}
                margin={{ top: 18, right: 16, left: -12, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                <XAxis
                  dataKey="board"
                  tick={{ fill: palette.axisText, fontSize: 11 }}
                  axisLine={{ stroke: palette.grid }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, turnaroundMode === 'urgent' ? 48 : 90]}
                  tick={{ fill: palette.axisText, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}h`}
                />
                <Tooltip
                  cursor={{ fill: palette.cursorFill }}
                  content={<ClinicalChartTooltip unitSuffix="h" />}
                />
                <ReferenceLine
                  y={slaLimit}
                  stroke={palette.slaLine}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: `${slaLimit}h SLA`,
                    position: 'top',
                    fill: palette.slaLine,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
                <Bar
                  dataKey={turnaroundMode === 'urgent' ? 'urgentAvgHours' : 'avgHours'}
                  name={turnaroundMode === 'urgent' ? 'Urgent Avg Turnaround' : 'Avg Processing Time'}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={36}
                >
                  {processingMetrics.map((entry) => {
                    const value =
                      turnaroundMode === 'urgent' ? entry.urgentAvgHours : entry.avgHours;
                    const isDimmed = selectedOrgan !== 'All' && selectedOrgan !== entry.board;
                    let fill = palette.boards[entry.board];
                    if (isDimmed) {
                      fill = palette.mutedBar;
                    } else if (value > slaLimit) {
                      fill = palette.slaBreach;
                    }
                    return <Cell key={entry.board} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Row 2: Patient Diagnosis Trends by Organ Board (8 cols) + Board Matrix (4 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Chart 3: Patient Diagnosis Trends by Organ Board */}
        <section
          aria-label="Patient Diagnosis Trends by Organ Board Chart"
          className="xl:col-span-8 rounded-lg bg-panel border border-hairline p-4 sm:p-5 flex flex-col"
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="font-display text-sm sm:text-base font-semibold text-ink">
                Patient Diagnosis Trends by Organ Board
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Oncology case intake trajectory across subspecialty tumour boards
              </p>
            </div>

            <div
              role="group"
              aria-label="Diagnosis trend display style"
              className="inline-flex items-center gap-1 p-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-hairline shrink-0 self-start"
            >
              {(
                [
                  ['stacked', 'Stacked Volume'],
                  ['lines', 'Board Lines'],
                ] as const
              ).map(([id, label]) => {
                const active = trendMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTrendMode(id)}
                    className={`relative px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'text-ink'
                        : 'text-ink-muted hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {active && (
                      <SlidingHighlight
                        layoutId="analytics-trend-mode"
                        className="bg-white dark:bg-slate-800 shadow-xs"
                      />
                    )}
                    <span className="relative z-10">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inline Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 text-[11px] text-slate-600 dark:text-slate-300">
            {visibleBoards.map((board) => (
              <span key={board} className="inline-flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-xs"
                  style={{ backgroundColor: palette.boards[board] }}
                  aria-hidden="true"
                />
                <span>{board} Oncology</span>
              </span>
            ))}
          </div>

          <div className="w-full h-[300px]" data-testid="chart-diagnosis-trends">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={diagnosisTrends}
                margin={{ top: 8, right: 12, left: -12, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={{ fill: palette.axisText, fontSize: 11 }}
                  axisLine={{ stroke: palette.grid }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: palette.axisText, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ClinicalChartTooltip unitSuffix=" cases" />} />
                {visibleBoards.map((board) => (
                  <Area
                    key={board}
                    type="monotone"
                    dataKey={board}
                    name={`${board} Board`}
                    stackId={trendMode === 'stacked' ? 'organStack' : undefined}
                    stroke={palette.boards[board]}
                    fill={palette.boards[board]}
                    fillOpacity={trendMode === 'stacked' ? (isDark ? 0.24 : 0.18) : 0.04}
                    strokeWidth={2}
                    activeDot={{ r: 4.5 }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Subspecialty Performance Matrix Table */}
        <section
          aria-label="Organ Board Performance Summary"
          className="xl:col-span-4 rounded-lg bg-panel border border-hairline flex flex-col overflow-hidden"
        >
          <div className="p-4 sm:p-5 border-b border-hairline">
            <h3 className="font-display text-sm sm:text-base font-semibold text-ink">
              Subspecialty Turnaround Breakdown
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Fastest cohort turnaround: {kpis.fastestBoard} Oncology
            </p>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-hairline bg-slate-50/70 dark:bg-slate-900/50 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">Board</th>
                  <th className="py-2.5 px-2 text-right">Cases</th>
                  <th className="py-2.5 px-2 text-right">Avg Time</th>
                  <th className="py-2.5 px-4 text-right">SLA Met</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline text-xs">
                {processingMetrics.map((row) => {
                  const isFocused = selectedOrgan === row.board;
                  const token = getOrganBoardTheme(row.board);
                  return (
                    <tr
                      key={row.board}
                      className={`group transition-colors ${
                        isFocused
                          ? token.softBgClass
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onOpenBoardInRegistry(row.board)}
                          className="inline-flex items-center gap-1.5 font-medium text-ink hover:text-blue-700 dark:hover:text-sky-400 transition-colors text-left"
                        >
                          <span
                            className={`h-2 w-2 rounded-xs shrink-0 ${token.swatchClass}`}
                            aria-hidden="true"
                          />
                          <span>{row.board}</span>
                          <ArrowUpRight
                            className="h-3 w-3 text-slate-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                            aria-hidden="true"
                          />
                        </button>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 pl-3.5 font-mono tabular-nums">
                          {row.liveCaseCount} live active
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono tabular-nums text-ink">
                        {row.totalCohortCases}
                      </td>
                      <td className="py-3 px-2 text-right font-mono tabular-nums text-ink">
                        {row.avgHours}h
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <span
                          className={
                            row.withinSlaPct >= 90
                              ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                              : row.withinSlaPct >= 82
                                ? 'text-amber-700 dark:text-amber-400 font-medium'
                                : 'text-rose-700 dark:text-rose-400 font-semibold'
                          }
                        >
                          {row.withinSlaPct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-hairline text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
            <span>Target MDT turnaround SLA</span>
            <span className="font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-200">
              &le; {SLA_TARGET_HOURS}h Standard · &le; 36h Urgent
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
