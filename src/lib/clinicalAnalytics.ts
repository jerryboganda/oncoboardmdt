import type { MdtMeeting, OrganBoard, PatientCase } from '../types';

export type AnalyticsTimeframe = '30d' | '90d' | '6m';

export const ALL_ORGAN_BOARDS: OrganBoard[] = ['Thoracic', 'Neuro', 'Breast', 'GI', 'Heme'];

export const SLA_TARGET_HOURS = 72;

export interface ThroughputPoint {
  period: string;
  monthKey: string;
  meetingsHeld: number;
  casesReviewed: number;
  consensusReached: number;
  avgCasesPerSession: number;
}

export interface DiagnosisTrendPoint {
  period: string;
  monthKey: string;
  Thoracic: number;
  Neuro: number;
  Breast: number;
  GI: number;
  Heme: number;
  total: number;
}

export interface ProcessingTimeBoardMetric {
  board: OrganBoard;
  avgHours: number;
  urgentAvgHours: number;
  slaTargetHours: number;
  withinSlaPct: number;
  liveCaseCount: number;
  totalCohortCases: number;
  consensusCount: number;
}

export interface ClinicalAnalyticsKpis {
  totalMeetings: number;
  avgCasesPerMeeting: number;
  totalCasesEvaluated: number;
  consensusRatePct: number;
  avgProcessingHours: number;
  slaCompliancePct: number;
  livePendingCases: number;
  fastestBoard: OrganBoard;
}

interface HistoricalMonthBaseline {
  monthKey: string;
  period: string;
  meetingsByBoard: Record<OrganBoard, number>;
  multiOrganMeetings: number;
  diagnosesByBoard: Record<OrganBoard, number>;
  consensusByBoard: Record<OrganBoard, number>;
  avgHoursByBoard: Record<OrganBoard, number>;
  urgentHoursByBoard: Record<OrganBoard, number>;
  withinSlaPctByBoard: Record<OrganBoard, number>;
}

// Deterministic institutional baseline for Jun–Oct 2026; Nov 2026 is dynamically augmented by live DB rows.
const HISTORICAL_BASELINES: HistoricalMonthBaseline[] = [
  {
    monthKey: '2026-06',
    period: 'Jun 2026',
    meetingsByBoard: { Thoracic: 4, Neuro: 3, Breast: 4, GI: 3, Heme: 2 },
    multiOrganMeetings: 4,
    diagnosesByBoard: { Thoracic: 14, Neuro: 8, Breast: 13, GI: 10, Heme: 7 },
    consensusByBoard: { Thoracic: 13, Neuro: 7, Breast: 12, GI: 9, Heme: 6 },
    avgHoursByBoard: { Thoracic: 54, Neuro: 61, Breast: 46, GI: 66, Heme: 74 },
    urgentHoursByBoard: { Thoracic: 26, Neuro: 22, Breast: 24, GI: 31, Heme: 34 },
    withinSlaPctByBoard: { Thoracic: 88, Neuro: 84, Breast: 93, GI: 81, Heme: 76 },
  },
  {
    monthKey: '2026-07',
    period: 'Jul 2026',
    meetingsByBoard: { Thoracic: 4, Neuro: 3, Breast: 4, GI: 4, Heme: 2 },
    multiOrganMeetings: 4,
    diagnosesByBoard: { Thoracic: 16, Neuro: 9, Breast: 14, GI: 12, Heme: 8 },
    consensusByBoard: { Thoracic: 15, Neuro: 8, Breast: 13, GI: 11, Heme: 7 },
    avgHoursByBoard: { Thoracic: 51, Neuro: 58, Breast: 44, GI: 63, Heme: 70 },
    urgentHoursByBoard: { Thoracic: 24, Neuro: 21, Breast: 22, GI: 29, Heme: 32 },
    withinSlaPctByBoard: { Thoracic: 90, Neuro: 86, Breast: 94, GI: 84, Heme: 79 },
  },
  {
    monthKey: '2026-08',
    period: 'Aug 2026',
    meetingsByBoard: { Thoracic: 5, Neuro: 3, Breast: 4, GI: 4, Heme: 3 },
    multiOrganMeetings: 4,
    diagnosesByBoard: { Thoracic: 18, Neuro: 10, Breast: 15, GI: 13, Heme: 9 },
    consensusByBoard: { Thoracic: 17, Neuro: 9, Breast: 14, GI: 12, Heme: 8 },
    avgHoursByBoard: { Thoracic: 49, Neuro: 56, Breast: 43, GI: 60, Heme: 68 },
    urgentHoursByBoard: { Thoracic: 23, Neuro: 20, Breast: 21, GI: 28, Heme: 30 },
    withinSlaPctByBoard: { Thoracic: 91, Neuro: 87, Breast: 95, GI: 86, Heme: 81 },
  },
  {
    monthKey: '2026-09',
    period: 'Sep 2026',
    meetingsByBoard: { Thoracic: 5, Neuro: 4, Breast: 5, GI: 4, Heme: 3 },
    multiOrganMeetings: 4,
    diagnosesByBoard: { Thoracic: 20, Neuro: 11, Breast: 17, GI: 14, Heme: 10 },
    consensusByBoard: { Thoracic: 19, Neuro: 10, Breast: 16, GI: 13, Heme: 9 },
    avgHoursByBoard: { Thoracic: 46, Neuro: 53, Breast: 41, GI: 57, Heme: 64 },
    urgentHoursByBoard: { Thoracic: 21, Neuro: 19, Breast: 20, GI: 26, Heme: 28 },
    withinSlaPctByBoard: { Thoracic: 93, Neuro: 89, Breast: 96, GI: 88, Heme: 84 },
  },
  {
    monthKey: '2026-10',
    period: 'Oct 2026',
    meetingsByBoard: { Thoracic: 5, Neuro: 4, Breast: 5, GI: 5, Heme: 3 },
    multiOrganMeetings: 5,
    diagnosesByBoard: { Thoracic: 21, Neuro: 12, Breast: 18, GI: 15, Heme: 11 },
    consensusByBoard: { Thoracic: 20, Neuro: 11, Breast: 17, GI: 14, Heme: 10 },
    avgHoursByBoard: { Thoracic: 44, Neuro: 50, Breast: 39, GI: 54, Heme: 61 },
    urgentHoursByBoard: { Thoracic: 20, Neuro: 18, Breast: 19, GI: 25, Heme: 27 },
    withinSlaPctByBoard: { Thoracic: 94, Neuro: 90, Breast: 96, GI: 90, Heme: 86 },
  },
];

// Current month baseline prior to adding live DB cases/meetings (early Nov 2026 institutional activity)
const CURRENT_MONTH_PRIOR_BASELINE: HistoricalMonthBaseline = {
  monthKey: '2026-11',
  period: 'Nov 2026',
  meetingsByBoard: { Thoracic: 3, Neuro: 3, Breast: 3, GI: 3, Heme: 2 },
  multiOrganMeetings: 3,
  diagnosesByBoard: { Thoracic: 15, Neuro: 9, Breast: 14, GI: 12, Heme: 8 },
  consensusByBoard: { Thoracic: 14, Neuro: 8, Breast: 13, GI: 11, Heme: 7 },
  avgHoursByBoard: { Thoracic: 42, Neuro: 49, Breast: 38, GI: 52, Heme: 59 },
  urgentHoursByBoard: { Thoracic: 19, Neuro: 18, Breast: 18, GI: 24, Heme: 26 },
  withinSlaPctByBoard: { Thoracic: 95, Neuro: 91, Breast: 97, GI: 91, Heme: 87 },
};

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

/**
 * Computes intake-to-resolution processing time in hours for a patient case.
 * Uses consensus sign-off timestamp when ratified, otherwise updatedAt or referenceNow.
 */
export function computeCaseProcessingHours(
  patientCase: PatientCase,
  referenceNowIso = '2026-11-20T18:00:00.000Z',
): number {
  const startMs = Date.parse(patientCase.createdAt);
  if (Number.isNaN(startMs)) return 36;

  const endIso = patientCase.consensus?.signedOffAt || patientCase.updatedAt || referenceNowIso;
  const parsedEndMs = Date.parse(endIso);
  const refMs = Date.parse(referenceNowIso);
  const endMs = Number.isNaN(parsedEndMs) ? refMs : Math.max(parsedEndMs, startMs);

  const rawHours = (endMs - startMs) / (1000 * 60 * 60);
  // If a case was just created moments ago in the current session, assign realistic initial triage time (4–12h)
  if (rawHours < 2) {
    return patientCase.urgency === 'Urgent' ? 6 : patientCase.urgency === 'Priority' ? 12 : 18;
  }
  return round1(Math.min(rawHours, 240));
}

function getTimeframeMonthCount(timeframe: AnalyticsTimeframe): number {
  switch (timeframe) {
    case '30d':
      return 2; // Oct–Nov comparison for readable trend line while focusing on recent 30d window
    case '90d':
      return 3; // Sep–Nov
    case '6m':
    default:
      return 6; // Jun–Nov
  }
}

function buildCombinedMonthlySeries(
  cases: PatientCase[],
  meetings: MdtMeeting[],
  timeframe: AnalyticsTimeframe,
): HistoricalMonthBaseline[] {
  // Augment Nov 2026 baseline with actual live database cases and meetings
  const novDiagnoses: Record<OrganBoard, number> = { ...CURRENT_MONTH_PRIOR_BASELINE.diagnosesByBoard };
  const novConsensus: Record<OrganBoard, number> = { ...CURRENT_MONTH_PRIOR_BASELINE.consensusByBoard };
  const novMeetings: Record<OrganBoard, number> = { ...CURRENT_MONTH_PRIOR_BASELINE.meetingsByBoard };
  let novMultiMeetings = CURRENT_MONTH_PRIOR_BASELINE.multiOrganMeetings;

  for (const c of cases) {
    if (novDiagnoses[c.organBoard] !== undefined) {
      novDiagnoses[c.organBoard] += 1;
      if (c.status === 'Consensus Reached') {
        novConsensus[c.organBoard] += 1;
      }
    }
  }

  for (const m of meetings) {
    if (m.organBoard === 'Multi-Organ') {
      novMultiMeetings += 1;
    } else if (novMeetings[m.organBoard] !== undefined) {
      novMeetings[m.organBoard] += 1;
    }
  }

  const novCombined: HistoricalMonthBaseline = {
    ...CURRENT_MONTH_PRIOR_BASELINE,
    diagnosesByBoard: novDiagnoses,
    consensusByBoard: novConsensus,
    meetingsByBoard: novMeetings,
    multiOrganMeetings: novMultiMeetings,
  };

  const full6m = [...HISTORICAL_BASELINES, novCombined];
  const count = getTimeframeMonthCount(timeframe);
  return full6m.slice(full6m.length - count);
}

export function buildMdtThroughputSeries(
  cases: PatientCase[],
  meetings: MdtMeeting[],
  organFilter: OrganBoard | 'All',
  timeframe: AnalyticsTimeframe,
): ThroughputPoint[] {
  const months = buildCombinedMonthlySeries(cases, meetings, timeframe);

  return months.map((m) => {
    const boards = organFilter === 'All' ? ALL_ORGAN_BOARDS : [organFilter];
    const casesReviewed = boards.reduce((sum, b) => sum + m.diagnosesByBoard[b], 0);
    const consensusReached = boards.reduce((sum, b) => sum + m.consensusByBoard[b], 0);
    const boardMeetings = boards.reduce((sum, b) => sum + m.meetingsByBoard[b], 0);
    // Multi-organ meetings contribute proportionally when viewing All boards or +1 shared forum per board
    const meetingsHeld =
      organFilter === 'All' ? boardMeetings + m.multiOrganMeetings : boardMeetings + Math.ceil(m.multiOrganMeetings / 2);

    return {
      period: m.period,
      monthKey: m.monthKey,
      meetingsHeld,
      casesReviewed,
      consensusReached,
      avgCasesPerSession: meetingsHeld > 0 ? round1(casesReviewed / meetingsHeld) : 0,
    };
  });
}

export function buildDiagnosisTrendsByOrgan(
  cases: PatientCase[],
  meetings: MdtMeeting[],
  timeframe: AnalyticsTimeframe,
): DiagnosisTrendPoint[] {
  const months = buildCombinedMonthlySeries(cases, meetings, timeframe);

  return months.map((m) => {
    const Thoracic = m.diagnosesByBoard.Thoracic;
    const Neuro = m.diagnosesByBoard.Neuro;
    const Breast = m.diagnosesByBoard.Breast;
    const GI = m.diagnosesByBoard.GI;
    const Heme = m.diagnosesByBoard.Heme;
    return {
      period: m.period,
      monthKey: m.monthKey,
      Thoracic,
      Neuro,
      Breast,
      GI,
      Heme,
      total: Thoracic + Neuro + Breast + GI + Heme,
    };
  });
}

export function buildProcessingTimeMetrics(
  cases: PatientCase[],
  meetings: MdtMeeting[],
  timeframe: AnalyticsTimeframe,
  referenceNowIso = '2026-11-20T18:00:00.000Z',
): ProcessingTimeBoardMetric[] {
  const months = buildCombinedMonthlySeries(cases, meetings, timeframe);

  return ALL_ORGAN_BOARDS.map((board) => {
    const liveBoardCases = cases.filter((c) => c.organBoard === board);
    const totalCohortCases = months.reduce((sum, m) => sum + m.diagnosesByBoard[board], 0);
    const consensusCount = months.reduce((sum, m) => sum + m.consensusByBoard[board], 0);

    const baselineAvgHours =
      months.reduce((sum, m) => sum + m.avgHoursByBoard[board], 0) / Math.max(1, months.length);
    const baselineUrgentHours =
      months.reduce((sum, m) => sum + m.urgentHoursByBoard[board], 0) / Math.max(1, months.length);
    const baselineSlaPct =
      months.reduce((sum, m) => sum + m.withinSlaPctByBoard[board], 0) / Math.max(1, months.length);

    // Blend live DB case processing times with institutional period baseline weighted by case volume
    let avgHours = baselineAvgHours;
    let withinSlaPct = baselineSlaPct;

    if (liveBoardCases.length > 0) {
      const liveHours = liveBoardCases.map((c) => computeCaseProcessingHours(c, referenceNowIso));
      const liveMean = liveHours.reduce((s, h) => s + h, 0) / liveHours.length;
      const liveWeight = Math.min(0.35, liveBoardCases.length / Math.max(1, totalCohortCases) * 2.5);
      avgHours = baselineAvgHours * (1 - liveWeight) + liveMean * liveWeight;

      const liveSlaMetPct =
        (liveHours.filter((h) => h <= SLA_TARGET_HOURS).length / liveHours.length) * 100;
      withinSlaPct = baselineSlaPct * (1 - liveWeight) + liveSlaMetPct * liveWeight;
    }

    return {
      board,
      avgHours: round1(avgHours),
      urgentAvgHours: round1(baselineUrgentHours),
      slaTargetHours: SLA_TARGET_HOURS,
      withinSlaPct: Math.round(withinSlaPct),
      liveCaseCount: liveBoardCases.length,
      totalCohortCases,
      consensusCount,
    };
  });
}

export function computeAnalyticsKpis(
  cases: PatientCase[],
  meetings: MdtMeeting[],
  organFilter: OrganBoard | 'All',
  timeframe: AnalyticsTimeframe,
  referenceNowIso = '2026-11-20T18:00:00.000Z',
): ClinicalAnalyticsKpis {
  const throughput = buildMdtThroughputSeries(cases, meetings, organFilter, timeframe);
  const processingAll = buildProcessingTimeMetrics(cases, meetings, timeframe, referenceNowIso);
  const scopedProcessing =
    organFilter === 'All'
      ? processingAll
      : processingAll.filter((p) => p.board === organFilter);

  const totalMeetings = throughput.reduce((s, t) => s + t.meetingsHeld, 0);
  const totalCasesEvaluated = throughput.reduce((s, t) => s + t.casesReviewed, 0);
  const totalConsensus = throughput.reduce((s, t) => s + t.consensusReached, 0);

  const weightedHoursSum = scopedProcessing.reduce((s, p) => s + p.avgHours * p.totalCohortCases, 0);
  const weightedCases = scopedProcessing.reduce((s, p) => s + p.totalCohortCases, 0);
  const avgProcessingHours = weightedCases > 0 ? round1(weightedHoursSum / weightedCases) : 0;

  const weightedSlaSum = scopedProcessing.reduce((s, p) => s + p.withinSlaPct * p.totalCohortCases, 0);
  const slaCompliancePct = weightedCases > 0 ? Math.round(weightedSlaSum / weightedCases) : 0;

  const livePendingCases = cases.filter(
    (c) => (organFilter === 'All' || c.organBoard === organFilter) && c.status !== 'Consensus Reached',
  ).length;

  const fastest = [...processingAll].sort((a, b) => a.avgHours - b.avgHours)[0]?.board ?? 'Breast';

  return {
    totalMeetings,
    avgCasesPerMeeting: totalMeetings > 0 ? round1(totalCasesEvaluated / totalMeetings) : 0,
    totalCasesEvaluated,
    consensusRatePct: totalCasesEvaluated > 0 ? Math.round((totalConsensus / totalCasesEvaluated) * 100) : 0,
    avgProcessingHours,
    slaCompliancePct,
    livePendingCases,
    fastestBoard: fastest,
  };
}

export function formatAnalyticsCsv(
  throughput: ThroughputPoint[],
  diagnosisTrends: DiagnosisTrendPoint[],
  processingMetrics: ProcessingTimeBoardMetric[],
): string {
  const lines: string[] = [];
  lines.push('SECTION: MDT MEETING THROUGHPUT');
  lines.push('Period,MDT Meetings Held,Cases Reviewed,Consensus Reached,Avg Cases Per Session');
  for (const row of throughput) {
    lines.push(
      `${row.period},${row.meetingsHeld},${row.casesReviewed},${row.consensusReached},${row.avgCasesPerSession}`,
    );
  }

  lines.push('');
  lines.push('SECTION: DIAGNOSIS TRENDS BY ORGAN BOARD');
  lines.push('Period,Thoracic,Neuro,Breast,GI,Heme,Total');
  for (const row of diagnosisTrends) {
    lines.push(`${row.period},${row.Thoracic},${row.Neuro},${row.Breast},${row.GI},${row.Heme},${row.total}`);
  }

  lines.push('');
  lines.push('SECTION: AVERAGE CASE PROCESSING TIME BY ORGAN BOARD');
  lines.push('Organ Board,Avg Processing Hours,Urgent Avg Hours,SLA Target Hours,Within SLA %,Live Active Cases,Cohort Cases');
  for (const row of processingMetrics) {
    lines.push(
      `${row.board},${row.avgHours},${row.urgentAvgHours},${row.slaTargetHours},${row.withinSlaPct}%,${row.liveCaseCount},${row.totalCohortCases}`,
    );
  }

  return lines.join('\n');
}
