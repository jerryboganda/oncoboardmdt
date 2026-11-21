import type {
  AiDicomImpressionResult,
  AiMinutesResult,
  AiSynthesisResult,
  AuditLogEntry,
  CaseMessage,
  CaseStatus,
  CaseUrgency,
  Clinician,
  ConsensusActionItem,
  ConsensusVote,
  DbSystemInfo,
  ImagingAnnotation,
  MdtMeeting,
  MessageTag,
  OrganBoard,
  PatientCase,
  SpecialtyRole,
} from '../types';

// Keep auth token strictly in JS memory (never persisted to localStorage/sessionStorage)
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const res = await fetch(url, { ...options, headers });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export const api = {
  getSystemStatus: () => requestJson<DbSystemInfo & { aiConfigured: boolean }>('/api/system/status'),

  getClinicians: () => requestJson<{ clinicians: Clinician[] }>('/api/auth/clinicians'),

  startDemoSession: (clinicianId: string) =>
    requestJson<{ token: string; clinician: Clinician }>('/api/auth/demo-session', {
      method: 'POST',
      body: JSON.stringify({ clinicianId }),
    }),

  login: (email: string, password: string) =>
    requestJson<{ token: string; clinician: Clinician }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (payload: {
    fullName: string;
    email: string;
    password: string;
    specialty: SpecialtyRole;
    title: string;
  }) =>
    requestJson<{ token: string; clinician: Clinician }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () => requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  getCases: () => requestJson<{ cases: PatientCase[] }>('/api/cases'),

  getCaseDetail: (id: string) =>
    requestJson<{
      patientCase: PatientCase;
      annotations: ImagingAnnotation[];
      votes: ConsensusVote[];
    }>(`/api/cases/${encodeURIComponent(id)}`),

  createCase: (payload: {
    mrn: string;
    patientInitials: string;
    age: number;
    sex: 'Female' | 'Male' | 'Other';
    organBoard: OrganBoard;
    primaryDiagnosis: string;
    histology: string;
    tnmT: string;
    tnmN: string;
    tnmM: string;
    stageGroup: string;
    ecog: number;
    urgency: CaseUrgency;
    clinicalSummary: string;
    baselineSumMm: number;
  }) =>
    requestJson<{ patientCase: PatientCase }>('/api/cases', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateCase: (
    id: string,
    payload: Partial<{
      tnmT: string;
      tnmN: string;
      tnmM: string;
      stageGroup: string;
      status: CaseStatus;
      urgency: CaseUrgency;
      ecog: number;
      clinicalSummary: string;
      pathology: PatientCase['pathology'];
      genomics: PatientCase['genomics'];
    }>,
  ) =>
    requestJson<{ patientCase: PatientCase }>(`/api/cases/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  saveAnnotation: (
    caseId: string,
    payload: {
      seriesId: string;
      sliceIndex: number;
      label: string;
      lesionType: ImagingAnnotation['lesionType'];
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      lengthMm: number;
      meanHu: number | null;
    },
  ) =>
    requestJson<{ annotation: ImagingAnnotation }>(
      `/api/cases/${encodeURIComponent(caseId)}/annotations`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  deleteAnnotation: (annotationId: string) =>
    requestJson<{ ok: boolean }>(`/api/annotations/${encodeURIComponent(annotationId)}`, {
      method: 'DELETE',
    }),

  getMeetings: () => requestJson<{ meetings: MdtMeeting[] }>('/api/meetings'),

  createMeeting: (payload: {
    title: string;
    organBoard: OrganBoard | 'Multi-Organ';
    scheduledStart: string;
    durationMinutes: number;
    caseIds: string[];
  }) =>
    requestJson<{ meeting: MdtMeeting }>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateMeeting: (
    meetingId: string,
    payload: Partial<{
      roomStatus: MdtMeeting['roomStatus'];
      activeCaseId: string | null;
      agenda: MdtMeeting['agenda'];
    }>,
  ) =>
    requestJson<{ meeting: MdtMeeting }>(`/api/meetings/${encodeURIComponent(meetingId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  castVote: (
    caseId: string,
    payload: { optionLabel: string; rationale: string; meetingId?: string | null },
  ) =>
    requestJson<{ votes: ConsensusVote[] }>(`/api/cases/${encodeURIComponent(caseId)}/votes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  signConsensus: (
    caseId: string,
    payload: {
      primaryRecommendation: string;
      stagingConfirmed: string;
      clinicalRationale: string;
      clinicalTrialRecommended: string;
      followUpActions: ConsensusActionItem[];
      meetingId?: string | null;
    },
  ) =>
    requestJson<{ patientCase: PatientCase }>(
      `/api/cases/${encodeURIComponent(caseId)}/consensus`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  getMessages: (roomId: string) =>
    requestJson<{ messages: CaseMessage[] }>(`/api/messages?roomId=${encodeURIComponent(roomId)}`),

  sendMessage: (payload: {
    roomId: string;
    caseId?: string | null;
    tag: MessageTag;
    body: string;
  }) =>
    requestJson<{ message: CaseMessage }>('/api/messages', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getAuditLogs: () => requestJson<{ logs: AuditLogEntry[] }>('/api/audit'),

  aiSynthesize: (caseId: string) =>
    requestJson<{ synthesis: AiSynthesisResult }>('/api/ai/synthesize', {
      method: 'POST',
      body: JSON.stringify({ caseId }),
    }),

  aiDicomAssist: (payload: {
    caseId: string;
    snapshotBase64: string;
    sliceMeta: {
      modality: string;
      sliceIndex: number;
      totalSlices: number;
      windowCenter: number;
      windowWidth: number;
      seriesDescription: string;
    };
  }) =>
    requestJson<{ impression: AiDicomImpressionResult }>('/api/ai/dicom-assist', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  aiDraftMinutes: (caseId: string, roomId?: string) =>
    requestJson<{ minutes: AiMinutesResult }>('/api/ai/minutes', {
      method: 'POST',
      body: JSON.stringify({ caseId, roomId }),
    }),

  aiChat: (
    caseId: string,
    question: string,
    history: { role: 'user' | 'assistant'; text: string }[],
  ) =>
    requestJson<{ answer: string }>('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ caseId, question, history }),
    }),
};
