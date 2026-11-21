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
  DicomFileMeta,
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

// Called once when the server stops recognising the session (expired or revoked).
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

// Sign-in style calls answer 401 for bad credentials, which is not an expired session.
const CREDENTIAL_CALLS = /^\/api\/auth\/(login|register|demo-session|password)/;

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && authToken && !CREDENTIAL_CALLS.test(url)) {
    authToken = null;
    onSessionExpired?.();
  }
  return res;
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await authFetch(url, options);
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export const api = {
  getSystemStatus: () => requestJson<DbSystemInfo & { aiConfigured: boolean }>('/api/system/status'),

  getAuthConfig: () => requestJson<{ demoMode: boolean; registrationOpen: boolean }>('/api/auth/config'),

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
    registrationCode?: string;
  }) =>
    requestJson<{ token: string; clinician: Clinician }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () => requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  resetClinicianPassword: (id: string) =>
    requestJson<{ temporaryPassword: string }>(
      `/api/auth/clinicians/${encodeURIComponent(id)}/reset-password`,
      { method: 'POST' },
    ),

  deactivateClinician: (id: string) =>
    requestJson<{ clinician: Clinician }>(`/api/auth/clinicians/${encodeURIComponent(id)}/deactivate`, {
      method: 'POST',
    }),

  reactivateClinician: (id: string) =>
    requestJson<{ clinician: Clinician }>(`/api/auth/clinicians/${encodeURIComponent(id)}/reactivate`, {
      method: 'POST',
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    requestJson<{ ok: boolean }>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  getCases: () => requestJson<{ cases: PatientCase[] }>('/api/cases'),

  getArchivedCases: () => requestJson<{ cases: PatientCase[] }>('/api/cases?archived=1'),

  archiveCase: (id: string) =>
    requestJson<{ patientCase: PatientCase }>(`/api/cases/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
    }),

  restoreCase: (id: string) =>
    requestJson<{ patientCase: PatientCase }>(`/api/cases/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
    }),

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

  getDicomFiles: (caseId: string) =>
    requestJson<{ files: DicomFileMeta[] }>(`/api/cases/${encodeURIComponent(caseId)}/dicom`),

  // One file per call; index/total only let the server write a single audit line per batch.
  uploadDicomFile: async (caseId: string, file: File, index: number, total: number) => {
    const res = await authFetch(
      `/api/cases/${encodeURIComponent(caseId)}/dicom?name=${encodeURIComponent(file.name)}&i=${index}&n=${total}`,
      { method: 'POST', headers: { 'Content-Type': 'application/dicom' }, body: file },
    );
    const data = (await res.json().catch(() => ({}))) as { error?: string; file?: DicomFileMeta };
    if (!res.ok) throw new Error(data.error || `Upload failed with status ${res.status}`);
    return data.file as DicomFileMeta;
  },

  downloadDicomFile: async (fileId: string) => {
    const res = await authFetch(`/api/dicom/${encodeURIComponent(fileId)}`);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || `Download failed with status ${res.status}`);
    }
    return res.arrayBuffer();
  },

  deleteDicomFiles: (caseId: string) =>
    requestJson<{ ok: boolean; deleted: number }>(`/api/cases/${encodeURIComponent(caseId)}/dicom`, {
      method: 'DELETE',
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

  getArchivedMeetings: () => requestJson<{ meetings: MdtMeeting[] }>('/api/meetings?archived=1'),

  archiveMeeting: (id: string) =>
    requestJson<{ meeting: MdtMeeting }>(`/api/meetings/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
    }),

  restoreMeeting: (id: string) =>
    requestJson<{ meeting: MdtMeeting }>(`/api/meetings/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
    }),

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
