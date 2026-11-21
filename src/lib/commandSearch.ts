import type { MdtMeeting, OrganBoard, PatientCase } from '../types';
import type { BoardColorKey } from './organPalette';

export type CommandCategory = 'Patient Cases' | 'Tumour Board Sessions' | 'Workspaces & Boards' | 'Quick Actions';

export type CommandActionPayload =
  | { type: 'open-case'; caseId: string }
  | { type: 'open-meeting'; meetingId: string }
  | { type: 'navigate-section'; section: 'registry' | 'analytics' | 'meetings' | 'live-board' | 'audit' }
  | { type: 'filter-board'; board: OrganBoard | 'All' }
  | { type: 'new-case' }
  | { type: 'toggle-theme' }
  | { type: 'open-auth' };

export interface CommandPaletteItem {
  id: string;
  category: CommandCategory;
  title: string;
  subtitle: string;
  meta?: string;
  boardColor?: BoardColorKey;
  keywords: string;
  action: CommandActionPayload;
}

const ORGAN_BOARDS: OrganBoard[] = ['Thoracic', 'Neuro', 'Breast', 'GI', 'Heme'];

export function buildCommandItems(
  cases: PatientCase[],
  meetings: MdtMeeting[],
  theme: 'light' | 'dark',
): CommandPaletteItem[] {
  const items: CommandPaletteItem[] = [];

  for (const c of cases) {
    const mutations = c.genomics.mutations.map((m) => `${m.gene} ${m.variant}`).join(' ');
    items.push({
      id: `case-${c.id}`,
      category: 'Patient Cases',
      title: `${c.mrn} — ${c.primaryDiagnosis}`,
      subtitle: `${c.organBoard} Board · ${c.stageGroup} · ${c.patientInitials} (${c.age}y ${c.sex})`,
      meta: c.urgency,
      boardColor: c.organBoard,
      keywords: `${c.mrn} ${c.patientInitials} ${c.primaryDiagnosis} ${c.histology} ${c.organBoard} ${c.stageGroup} ${c.status} ${c.urgency} ${mutations}`.toLowerCase(),
      action: { type: 'open-case', caseId: c.id },
    });
  }

  for (const m of meetings) {
    items.push({
      id: `meeting-${m.id}`,
      category: 'Tumour Board Sessions',
      title: m.title,
      subtitle: `${m.organBoard} Board · Chair: ${m.chairName} · ${m.agenda.length} cases`,
      meta: m.roomStatus,
      boardColor: m.organBoard,
      keywords: `${m.title} ${m.organBoard} ${m.chairName} ${m.roomStatus} meeting live board`.toLowerCase(),
      action: { type: 'open-meeting', meetingId: m.id },
    });
  }

  const workspaces: { id: 'registry' | 'analytics' | 'meetings' | 'live-board' | 'audit'; title: string; subtitle: string; keywords: string }[] = [
    { id: 'registry', title: 'Case Registry', subtitle: 'Multi-organ oncology patient queue & filters', keywords: 'registry cases dashboard patients home' },
    { id: 'analytics', title: 'Clinical Analytics', subtitle: 'MDT throughput, organ board diagnosis trends & turnaround SLA', keywords: 'analytics charts recharts metrics throughput sla trends' },
    { id: 'meetings', title: 'Board Schedule', subtitle: 'Schedule & manage multidisciplinary tumour board sessions', keywords: 'schedule calendar meetings agenda' },
    { id: 'live-board', title: 'Live Board Room', subtitle: 'Real-time synchronized DICOM, voting & consensus sign-off', keywords: 'live room conference voting dicom sync' },
    { id: 'audit', title: 'Audit & Database', subtitle: 'Append-only clinical audit trail & Hostinger MySQL readiness', keywords: 'audit database mysql sqlite logs governance' },
  ];

  for (const ws of workspaces) {
    items.push({
      id: `ws-${ws.id}`,
      category: 'Workspaces & Boards',
      title: ws.title,
      subtitle: ws.subtitle,
      boardColor: 'Multi-Organ',
      keywords: `${ws.title} ${ws.subtitle} ${ws.keywords}`.toLowerCase(),
      action: { type: 'navigate-section', section: ws.id },
    });
  }

  for (const board of ORGAN_BOARDS) {
    items.push({
      id: `board-${board}`,
      category: 'Workspaces & Boards',
      title: `Filter ${board} Oncology Board`,
      subtitle: `Scope registry & analytics to ${board} tumour board cases`,
      boardColor: board,
      keywords: `${board} oncology board filter subspecialty`.toLowerCase(),
      action: { type: 'filter-board', board },
    });
  }

  items.push(
    {
      id: 'action-new-case',
      category: 'Quick Actions',
      title: 'Register New Patient Case',
      subtitle: 'Open de-identified oncology intake form with AJCC staging',
      boardColor: 'Multi-Organ',
      keywords: 'new patient case create intake add register'.toLowerCase(),
      action: { type: 'new-case' },
    },
    {
      id: 'action-theme',
      category: 'Quick Actions',
      title: theme === 'dark' ? 'Switch to Clinical Light Mode' : 'Switch to Dark Radiology Mode',
      subtitle: 'Toggle reading-room dark theme and daylight consultation theme',
      boardColor: 'Multi-Organ',
      keywords: 'theme light dark radiology mode appearance toggle'.toLowerCase(),
      action: { type: 'toggle-theme' },
    },
    {
      id: 'action-auth',
      category: 'Quick Actions',
      title: 'Switch Clinician / Specialty Identity',
      subtitle: 'Assume another MDT specialty role or sign in with credentials',
      boardColor: 'Multi-Organ',
      keywords: 'clinician user switch profile specialty login auth role'.toLowerCase(),
      action: { type: 'open-auth' },
    },
  );

  return items;
}

export function filterCommandItems(items: CommandPaletteItem[], rawQuery: string): CommandPaletteItem[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return items;

  const terms = query.split(/\s+/).filter(Boolean);

  const scored: { item: CommandPaletteItem; score: number }[] = [];
  for (const item of items) {
    const matchesAll = terms.every((t) => item.keywords.includes(t));
    if (!matchesAll) continue;

    let score = 0;
    const titleLower = item.title.toLowerCase();
    if (titleLower.startsWith(query)) score += 100;
    else if (titleLower.includes(query)) score += 60;
    else score += 20;

    if (item.category === 'Patient Cases') score += 10;
    scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
