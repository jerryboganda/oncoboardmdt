import type {
  CaseStatus,
  CaseUrgency,
  ConsensusVote,
  ImagingAnnotation,
  OrganBoard,
  PatientCase,
} from '../types';

export interface RecistSummary {
  baselineSumMm: number;
  currentSumMm: number;
  deltaMm: number;
  percentChange: number;
  responseCode: 'CR' | 'PR' | 'SD' | 'PD' | 'NE';
  responseLabel: string;
}

/**
 * Evaluates RECIST 1.1 target lesion response against baseline sum of diameters.
 * CR: 0 mm | PR: <= -30% | PD: >= +20% AND >= +5 mm absolute increase | SD: otherwise.
 */
export function evaluateRecistResponse(
  baselineSumMm: number,
  annotations: ImagingAnnotation[],
): RecistSummary {
  const targetLesions = annotations.filter((a) => a.lesionType === 'Target (RECIST)');
  if (baselineSumMm <= 0 || targetLesions.length === 0) {
    return {
      baselineSumMm,
      currentSumMm: Number(
        targetLesions.reduce((sum, item) => sum + item.lengthMm, 0).toFixed(1),
      ),
      deltaMm: 0,
      percentChange: 0,
      responseCode: 'NE',
      responseLabel: 'Not Evaluable (Add Target Lesion)',
    };
  }

  const currentSumMm = Number(
    targetLesions.reduce((sum, item) => sum + item.lengthMm, 0).toFixed(1),
  );
  const deltaMm = Number((currentSumMm - baselineSumMm).toFixed(1));
  const percentChange = Number((((currentSumMm - baselineSumMm) / baselineSumMm) * 100).toFixed(1));

  if (currentSumMm === 0) {
    return {
      baselineSumMm,
      currentSumMm,
      deltaMm,
      percentChange: -100,
      responseCode: 'CR',
      responseLabel: 'Complete Response (CR)',
    };
  }

  if (percentChange <= -30) {
    return {
      baselineSumMm,
      currentSumMm,
      deltaMm,
      percentChange,
      responseCode: 'PR',
      responseLabel: 'Partial Response (PR)',
    };
  }

  if (percentChange >= 20 && deltaMm >= 5) {
    return {
      baselineSumMm,
      currentSumMm,
      deltaMm,
      percentChange,
      responseCode: 'PD',
      responseLabel: 'Progressive Disease (PD)',
    };
  }

  return {
    baselineSumMm,
    currentSumMm,
    deltaMm,
    percentChange,
    responseCode: 'SD',
    responseLabel: 'Stable Disease (SD)',
  };
}

/**
 * Derives a concise AJCC stage group estimate from T, N, M codes when creating a case.
 */
export function deriveStageGroup(tnmT: string, tnmN: string, tnmM: string): string {
  const t = tnmT.trim().toUpperCase();
  const n = tnmN.trim().toUpperCase();
  const m = tnmM.trim().toUpperCase();

  if (m.startsWith('M1')) {
    return m === 'M1C' ? 'Stage IVB' : 'Stage IVA';
  }
  if (n.startsWith('N3') || (t.startsWith('T4') && n !== 'N0')) {
    return 'Stage IIIC';
  }
  if (n.startsWith('N2') || t.startsWith('T4')) {
    return 'Stage IIIA';
  }
  if (n.startsWith('N1') || t.startsWith('T3')) {
    return 'Stage IIB';
  }
  if (t.startsWith('T2B')) {
    return 'Stage IIA';
  }
  if (t.startsWith('T2')) {
    return 'Stage IB';
  }
  return 'Stage IA';
}

export interface VoteTally {
  optionLabel: string;
  count: number;
  percentage: number;
  specialties: string[];
}

export interface QuorumStatus {
  totalVotes: number;
  uniqueSpecialties: number;
  quorumMet: boolean;
  leadingOption: string | null;
  leadingPercentage: number;
  tallies: VoteTally[];
}

/**
 * Aggregates multidisciplinary votes and checks MDT quorum (>= 3 distinct specialties).
 */
export function calculateConsensusQuorum(votes: ConsensusVote[]): QuorumStatus {
  const totalVotes = votes.length;
  const specialtySet = new Set(votes.map((v) => v.specialty));
  const map = new Map<string, { count: number; specialties: Set<string> }>();

  for (const vote of votes) {
    const existing = map.get(vote.optionLabel) ?? { count: 0, specialties: new Set<string>() };
    existing.count += 1;
    existing.specialties.add(vote.specialty);
    map.set(vote.optionLabel, existing);
  }

  const tallies: VoteTally[] = Array.from(map.entries())
    .map(([optionLabel, info]) => ({
      optionLabel,
      count: info.count,
      percentage: totalVotes > 0 ? Math.round((info.count / totalVotes) * 100) : 0,
      specialties: Array.from(info.specialties),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalVotes,
    uniqueSpecialties: specialtySet.size,
    quorumMet: specialtySet.size >= 3,
    leadingOption: tallies[0]?.optionLabel ?? null,
    leadingPercentage: tallies[0]?.percentage ?? 0,
    tallies,
  };
}

export interface CaseFilterCriteria {
  search: string;
  organBoard: OrganBoard | 'All';
  urgency: CaseUrgency | 'All';
  status: CaseStatus | 'All';
}

export function filterPatientCases(
  cases: PatientCase[],
  criteria: CaseFilterCriteria,
): PatientCase[] {
  const q = criteria.search.trim().toLowerCase();
  return cases.filter((c) => {
    if (criteria.organBoard !== 'All' && c.organBoard !== criteria.organBoard) {
      return false;
    }
    if (criteria.urgency !== 'All' && c.urgency !== criteria.urgency) {
      return false;
    }
    if (criteria.status !== 'All' && c.status !== criteria.status) {
      return false;
    }
    if (q) {
      const haystack = [
        c.mrn,
        c.patientInitials,
        c.primaryDiagnosis,
        c.histology,
        c.organBoard,
        c.stageGroup,
        ...c.genomics.mutations.map((m) => m.gene),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    }
    return true;
  });
}

/**
 * Formats a structured, plain-text / Markdown MDT Consensus Report suitable for EHR copy/export.
 */
export function formatConsensusReportText(
  patientCase: PatientCase,
  votes: ConsensusVote[],
  annotations: ImagingAnnotation[],
): string {
  const quorum = calculateConsensusQuorum(votes);
  const recist = evaluateRecistResponse(patientCase.baselineSumMm, annotations);
  const lines: string[] = [
    '========================================================================',
    'ONCOBOARD MDT — MULTIDISCIPLINARY TUMOUR BOARD CONSENSUS REPORT',
    '========================================================================',
    `Patient MRN: ${patientCase.mrn} | Initials: ${patientCase.patientInitials} | Age/Sex: ${patientCase.age}y ${patientCase.sex}`,
    `Organ Board: ${patientCase.organBoard} Oncology | Urgency: ${patientCase.urgency}`,
    `Primary Diagnosis: ${patientCase.primaryDiagnosis}`,
    `Histology: ${patientCase.histology}`,
    `AJCC Staging: ${patientCase.tnmT} ${patientCase.tnmN} ${patientCase.tnmM} (${patientCase.stageGroup}) | ECOG: ${patientCase.ecog}`,
    `Molecular Biomarkers: PD-L1 ${patientCase.genomics.pdL1Score} | TMB ${patientCase.genomics.tmbMutPerMb} mut/Mb | ${patientCase.genomics.msiStatus}`,
    `Actionable Variants: ${
      patientCase.genomics.mutations.length > 0
        ? patientCase.genomics.mutations.map((m) => `${m.gene} ${m.variant} (${m.tier})`).join('; ')
        : 'None documented'
    }`,
    `RECIST 1.1 Imaging Summary: Baseline ${recist.baselineSumMm} mm -> Current ${recist.currentSumMm} mm (${recist.responseLabel})`,
    '',
    '--- MDT CONSENSUS VOTING TALLY ---',
    `Participating Specialties: ${quorum.uniqueSpecialties} (${quorum.quorumMet ? 'Quorum Met' : 'Quorum Pending'})`,
    ...quorum.tallies.map(
      (t) => `• ${t.optionLabel}: ${t.count} vote(s) (${t.percentage}%) — ${t.specialties.join(', ')}`,
    ),
    '',
    '--- FINAL MULTIDISCIPLINARY RECOMMENDATION ---',
  ];

  if (patientCase.consensus) {
    lines.push(`Primary Plan: ${patientCase.consensus.primaryRecommendation}`);
    lines.push(`Confirmed Stage: ${patientCase.consensus.stagingConfirmed}`);
    lines.push(`Clinical Rationale: ${patientCase.consensus.clinicalRationale}`);
    lines.push(`Clinical Trial Referral: ${patientCase.consensus.clinicalTrialRecommended}`);
    lines.push('Follow-Up Specialty Action Items:');
    for (const action of patientCase.consensus.followUpActions) {
      lines.push(`  - [${action.specialty}] ${action.task} (Target: ${action.dueWindow})`);
    }
    lines.push('');
    lines.push(
      `Electronically Signed By: ${patientCase.consensus.signedOffBy} (${patientCase.consensus.signedOffSpecialty}) on ${patientCase.consensus.signedOffAt}`,
    );
  } else {
    lines.push('Consensus sign-off pending formal tumour board ratification.');
  }

  return lines.join('\n');
}
