export type OrganBoard = 'Thoracic' | 'Neuro' | 'Breast' | 'GI' | 'Heme';

export type SpecialtyRole =
  | 'Medical Oncology'
  | 'Surgical Oncology'
  | 'Radiation Oncology'
  | 'Diagnostic Radiology'
  | 'Molecular Pathology'
  | 'MDT Coordinator';

export type CaseUrgency = 'Routine' | 'Priority' | 'Urgent';

export type CaseStatus = 'Intake' | 'Scheduled' | 'In Review' | 'Consensus Reached';

export type DicomPresetKey =
  | 'thoracic_ct'
  | 'neuro_mri'
  | 'breast_mri'
  | 'gi_liver_ct'
  | 'heme_pet_ct';

export interface Clinician {
  id: string;
  fullName: string;
  email: string;
  specialty: SpecialtyRole;
  title: string;
  institution: string;
  isChair: boolean;
  disabledAt?: string | null;
  createdAt: string;
}

export interface TreatmentEvent {
  date: string;
  modality: string;
  regimen: string;
  outcome: string;
}

export interface LabMarker {
  name: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag: 'Normal' | 'Elevated' | 'Critical' | 'Low';
}

export interface IhcMarker {
  marker: string;
  result: string;
  interpretation: string;
}

export interface NgsMutation {
  gene: string;
  variant: string;
  vafPercent: number;
  tier: 'Tier I-A' | 'Tier I-B' | 'Tier II-C' | 'Tier III';
  actionableTherapy: string;
}

export interface ClinicalTrialMatch {
  nctId: string;
  title: string;
  phase: string;
  eligibilityStatus: 'Eligible' | 'Screen Required' | 'Ineligible';
  biomarkerMatch: string;
}

export interface PathologyData {
  specimenId: string;
  biopsyDate: string;
  biopsySite: string;
  histology: string;
  grade: string;
  margins: string;
  ihcMarkers: IhcMarker[];
  pathologistNote: string;
}

export interface GenomicsData {
  assayName: string;
  tmbMutPerMb: number;
  msiStatus: 'MSS' | 'MSI-H' | 'Indeterminate';
  pdL1Score: string;
  mutations: NgsMutation[];
  trialMatches: ClinicalTrialMatch[];
}

export interface ConsensusActionItem {
  specialty: SpecialtyRole;
  task: string;
  dueWindow: string;
}

export interface ConsensusPlan {
  primaryRecommendation: string;
  stagingConfirmed: string;
  clinicalRationale: string;
  clinicalTrialRecommended: string;
  followUpActions: ConsensusActionItem[];
  signedOffBy: string;
  signedOffSpecialty: SpecialtyRole;
  signedOffAt: string;
}

export interface PatientCase {
  id: string;
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
  status: CaseStatus;
  leadClinicianId: string;
  clinicalSummary: string;
  treatmentHistory: TreatmentEvent[];
  labs: LabMarker[];
  pathology: PathologyData;
  genomics: GenomicsData;
  dicomPreset: DicomPresetKey;
  baselineSumMm: number;
  consensus: ConsensusPlan | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DicomFileMeta {
  id: string;
  caseId: string;
  filename: string;
  sizeBytes: number;
  seriesUid: string | null;
  seriesLabel: string | null;
  uploadedByName: string;
  createdAt: string;
}

export interface ImagingAnnotation {
  id: string;
  caseId: string;
  seriesId: string;
  sliceIndex: number;
  label: string;
  lesionType: 'Target (RECIST)' | 'Non-Target' | 'New Lesion' | 'ROI Note';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lengthMm: number;
  meanHu: number | null;
  authorName: string;
  authorSpecialty: SpecialtyRole;
  createdAt: string;
}

export interface AgendaItem {
  caseId: string;
  presenterName: string;
  presenterSpecialty: SpecialtyRole;
  allocatedMinutes: number;
  completed: boolean;
}

export interface MdtMeeting {
  id: string;
  title: string;
  organBoard: OrganBoard | 'Multi-Organ';
  scheduledStart: string;
  durationMinutes: number;
  chairName: string;
  roomStatus: 'Scheduled' | 'Live' | 'Completed';
  agenda: AgendaItem[];
  activeCaseId: string | null;
  archivedAt?: string | null;
  createdAt: string;
}

export interface ConsensusVote {
  id: string;
  caseId: string;
  meetingId: string | null;
  clinicianId: string;
  clinicianName: string;
  specialty: SpecialtyRole;
  optionLabel: string;
  rationale: string;
  createdAt: string;
}

export type MessageTag =
  | 'General'
  | 'Radiology Finding'
  | 'Pathology Update'
  | 'Action Item'
  | 'Urgent Handoff';

export interface CaseMessage {
  id: string;
  roomId: string;
  caseId: string | null;
  senderId: string;
  senderName: string;
  senderSpecialty: SpecialtyRole;
  tag: MessageTag;
  body: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorSpecialty: SpecialtyRole;
  action: string;
  resourceType: string;
  resourceId: string;
  detail: string;
  createdAt: string;
}

export interface DbSystemInfo {
  engine: 'mysql' | 'sqlite';
  hostingerReady: boolean;
  host: string;
  database: string;
  tableCounts: {
    clinicians: number;
    cases: number;
    meetings: number;
    annotations: number;
    messages: number;
    votes: number;
    auditLogs: number;
  };
}

export interface AiSynthesisResult {
  stagingVerification: string;
  guidelineConcordance: string;
  recommendedPathways: {
    rank: number;
    pathway: string;
    evidenceLevel: string;
    rationale: string;
  }[];
  biomarkerInsights: string[];
  diagnosticGaps: string[];
  clinicalTrialConsiderations: string[];
  disclaimer: string;
}

export interface AiDicomImpressionResult {
  anatomicalRegion: string;
  keyObservations: string[];
  lesionCharacterization: string;
  suggestedFollowUpImaging: string;
  disclaimer: string;
}

export interface AiMinutesResult {
  primaryRecommendation: string;
  stagingConfirmed: string;
  clinicalRationale: string;
  clinicalTrialRecommended: string;
  followUpActions: ConsensusActionItem[];
  executiveSummary: string;
}

export interface PresenceMember {
  clinicianId: string;
  fullName: string;
  specialty: SpecialtyRole;
  joinedAt: string;
}

export interface PresenterSyncState {
  meetingId: string;
  caseId: string;
  sliceIndex: number;
  windowCenter: number;
  windowWidth: number;
  presenterName: string;
  updatedAt: string;
}
