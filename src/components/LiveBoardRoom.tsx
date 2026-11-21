import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  Download,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Sparkles,
  Users,
  Vote,
} from 'lucide-react';
import { useBoardSocket } from '../hooks/useBoardSocket';
import {
  calculateConsensusQuorum,
  formatConsensusReportText,
} from '../lib/clinicalRules';
import { getOrganBoardTheme } from '../lib/organPalette';
import { api } from '../services/api';
import type {
  Clinician,
  ConsensusActionItem,
  ConsensusVote,
  ImagingAnnotation,
  MdtMeeting,
  PatientCase,
  SpecialtyRole,
} from '../types';
import { CaseChatPanel } from './CaseChatPanel';
import { DicomViewer } from './DicomViewer';
import { CLINICAL_SPRING, SlidingHighlight } from './MotionPrimitives';
import { useToast } from './ToastProvider';

interface LiveBoardRoomProps {
  meeting: MdtMeeting;
  cases: PatientCase[];
  clinician: Clinician | null;
  tokenVersion: string | null;
  onCaseUpdated: (updated: PatientCase) => void;
  onMeetingUpdated: (updated: MdtMeeting) => void;
  onOpenFullDossier: (caseId: string) => void;
}

const DEFAULT_PATHWAY_OPTIONS: Record<string, string[]> = {
  Thoracic: [
    'Neoadjuvant Osimertinib + Lobectomy (NeoADAURA)',
    'Definitive Chemoradiation + Consolidation Osimertinib (LAURA)',
    'Neoadjuvant Chemo-Immunotherapy + Surgical Resection',
    'Clinical Trial Enrollment / Molecularly Guided Protocol',
  ],
  Neuro: [
    'Standard Stupp Chemoradiation (60 Gy + TMZ) + Adjuvant TTFields',
    'Hypofractionated Radiotherapy + Temozolomide',
    'Clinical Trial Enrollment (Immunotherapy / ADC)',
  ],
  Breast: [
    'Neoadjuvant TCHP (6 Cycles) -> Surgery & Pathologic Response-Adapted Adjuvant',
    'De-escalated Neoadjuvant THP (CompassHER2-pCR Protocol)',
    'Upfront Breast-Conserving Surgery + Axillary Staging',
  ],
  GI: [
    'Simultaneous Rectosigmoid + Segment VII Hepatic Resection',
    'Liver-First Staged Hepatectomy Followed by Primary Resection',
    'Continue Conversion FOLFOX + Panitumumab (2 Additional Cycles)',
  ],
  Heme: [
    'Omit Consolidative Mediastinal RT — Observation + Surveillance (IELSG37)',
    'Consolidative Involved-Site Radiotherapy (30 Gy)',
    'Repeat PET-CT in 8 Weeks Before Local Therapy Decision',
  ],
};

export function LiveBoardRoom({
  meeting,
  cases,
  clinician,
  tokenVersion,
  onCaseUpdated,
  onMeetingUpdated,
  onOpenFullDossier,
}: LiveBoardRoomProps) {
  const { pushToast } = useToast();
  const initialCaseId = meeting.activeCaseId ?? meeting.agenda[0]?.caseId ?? cases[0]?.id ?? null;
  const [activeCaseId, setActiveCaseId] = useState<string | null>(initialCaseId);
  const [activeStageTab, setActiveStageTab] = useState<'dicom' | 'summary'>('dicom');

  const [annotations, setAnnotations] = useState<ImagingAnnotation[]>([]);
  const [votes, setVotes] = useState<ConsensusVote[]>([]);
  const [followPresenter, setFollowPresenter] = useState(true);

  // Case presentation timer (seconds)
  const [timerSeconds, setTimerSeconds] = useState(15 * 60);
  const [timerRunning, setTimerRunning] = useState(false);

  // Vote composer state
  const [selectedVoteOption, setSelectedVoteOption] = useState('');
  const [voteRationale, setVoteRationale] = useState('');
  const [submittingVote, setSubmittingVote] = useState(false);

  // Formal Consensus Sign-Off Editor state
  const [primaryRec, setPrimaryRec] = useState('');
  const [stagingConfirmed, setStagingConfirmed] = useState('');
  const [clinicalRationale, setClinicalRationale] = useState('');
  const [trialRec, setTrialRec] = useState('Standard of care / evaluate matched biomarker trial');
  const [actionsText, setActionsText] = useState(
    'Medical Oncology | Initiate systemic therapy workup & consent | Within 7 days\nSurgical Oncology | Schedule pre-operative multidisciplinary clinic | Within 10 days',
  );
  const [signing, setSigning] = useState(false);
  const [draftingAi, setDraftingAi] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  const activeCase = useMemo(
    () => cases.find((c) => c.id === activeCaseId) ?? cases[0] ?? null,
    [cases, activeCaseId],
  );

  // Load annotations & votes whenever active case changes
  useEffect(() => {
    if (!activeCase) return;
    let mounted = true;
    api.getCaseDetail(activeCase.id).then((res) => {
      if (!mounted) return;
      setAnnotations(res.annotations);
      setVotes(res.votes);
      setStagingConfirmed(
        `${res.patientCase.tnmT} ${res.patientCase.tnmN} ${res.patientCase.tnmM} (${res.patientCase.stageGroup})`,
      );
      if (res.patientCase.consensus) {
        setPrimaryRec(res.patientCase.consensus.primaryRecommendation);
        setClinicalRationale(res.patientCase.consensus.clinicalRationale);
        setTrialRec(res.patientCase.consensus.clinicalTrialRecommended);
      } else {
        setPrimaryRec('');
        setClinicalRationale('');
      }
      const opts = DEFAULT_PATHWAY_OPTIONS[res.patientCase.organBoard] ?? DEFAULT_PATHWAY_OPTIONS.Thoracic;
      setSelectedVoteOption(opts[0]);
    });
    return () => {
      mounted = false;
    };
  }, [activeCase?.id]);

  // Countdown timer loop
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  const { connected, presence, presenterSync, emitPresenterSync } = useBoardSocket(
    `meeting:${meeting.id}`,
    tokenVersion,
    {
      onVotesUpdated: (payload) => {
        if (payload.caseId === activeCase?.id) {
          setVotes(payload.votes);
        }
      },
      onPresenterSync: (sync) => {
        if (followPresenter && sync.caseId && sync.caseId !== activeCaseId) {
          setActiveCaseId(sync.caseId);
        }
      },
      onConsensusSigned: (payload) => {
        onCaseUpdated(payload.patientCase);
      },
      onMeetingUpdated: (updated) => {
        onMeetingUpdated(updated);
      },
    },
  );

  const quorum = useMemo(() => calculateConsensusQuorum(votes), [votes]);
  // Mirrors the server rule; the server still enforces it.
  const canSignOff = Boolean(clinician && (clinician.isChair || activeCase?.leadClinicianId === clinician.id));

  const handleSelectAgendaCase = async (caseId: string) => {
    setActiveCaseId(caseId);
    setTimerSeconds(15 * 60);
    setTimerRunning(false);
    setFeedbackSuccess(null);
    setFeedbackError(null);
    try {
      const { meeting: updated } = await api.updateMeeting(meeting.id, { activeCaseId: caseId });
      onMeetingUpdated(updated);
      emitPresenterSync({
        meetingId: meeting.id,
        caseId,
        sliceIndex: 11,
        windowCenter: 40,
        windowWidth: 400,
      });
    } catch {
      // Allow local switch even if network blips
    }
  };

  const handleCastVote = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeCase || !selectedVoteOption) return;
    setSubmittingVote(true);
    setFeedbackError(null);
    try {
      const { votes: updatedVotes } = await api.castVote(activeCase.id, {
        optionLabel: selectedVoteOption,
        rationale: voteRationale.trim() || 'Concurs with multidisciplinary guideline pathway.',
        meetingId: meeting.id,
      });
      setVotes(updatedVotes);
      setVoteRationale('');
      setFeedbackSuccess('Your specialty consensus vote was recorded and broadcast live.');
      pushToast({
        title: 'Specialty vote recorded',
        description: `${activeCase.mrn} · ${selectedVoteOption}`,
        variant: 'success',
        organBoard: activeCase.organBoard,
      });
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Unable to submit vote.');
    } finally {
      setSubmittingVote(false);
    }
  };

  const handleDraftMinutesWithAi = async () => {
    if (!activeCase) return;
    setDraftingAi(true);
    setFeedbackError(null);
    try {
      const { minutes } = await api.aiDraftMinutes(activeCase.id, `meeting:${meeting.id}`);
      setPrimaryRec(minutes.primaryRecommendation);
      setStagingConfirmed(minutes.stagingConfirmed);
      setClinicalRationale(minutes.clinicalRationale);
      setTrialRec(minutes.clinicalTrialRecommended);
      if (minutes.followUpActions.length > 0) {
        setActionsText(
          minutes.followUpActions
            .map((a) => `${a.specialty} | ${a.task} | ${a.dueWindow}`)
            .join('\n'),
        );
      }
      setFeedbackSuccess('AI drafted structured MDT consensus minutes. Review and click Sign Off to lock.');
      pushToast({
        title: 'AI consensus minutes drafted',
        description: `Review fields and click Sign Off to ratify ${activeCase.mrn}.`,
        variant: 'info',
        organBoard: activeCase.organBoard,
      });
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'AI minutes drafting failed.');
    } finally {
      setDraftingAi(false);
    }
  };

  const handleSignConsensus = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeCase) return;
    setFeedbackError(null);
    setFeedbackSuccess(null);

    if (!primaryRec.trim() || !clinicalRationale.trim()) {
      setFeedbackError('Primary recommendation and clinical rationale are required to lock consensus.');
      return;
    }

    const followUpActions: ConsensusActionItem[] = actionsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [specialtyRaw, taskRaw, dueRaw] = line.split('|').map((s) => s.trim());
        return {
          specialty: (specialtyRaw || 'Medical Oncology') as SpecialtyRole,
          task: taskRaw || line,
          dueWindow: dueRaw || 'Within 14 days',
        };
      });

    setSigning(true);
    try {
      const { patientCase: signedCase } = await api.signConsensus(activeCase.id, {
        primaryRecommendation: primaryRec.trim(),
        stagingConfirmed: stagingConfirmed.trim(),
        clinicalRationale: clinicalRationale.trim(),
        clinicalTrialRecommended: trialRec.trim(),
        followUpActions,
        meetingId: meeting.id,
      });
      onCaseUpdated(signedCase);
      setFeedbackSuccess(`Consensus electronically signed for ${signedCase.mrn}. Status updated to Consensus Reached.`);
      pushToast({
        title: `Consensus ratified for ${signedCase.mrn}`,
        description: 'Plan locked and logged to clinical audit trail.',
        variant: 'success',
        organBoard: signedCase.organBoard,
      });
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Unable to sign consensus.');
    } finally {
      setSigning(false);
    }
  };

  const handleExportReport = () => {
    if (!activeCase) return;
    const text = formatConsensusReportText(activeCase, votes, annotations);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeCase.mrn}_MDT_Consensus_Report.txt`;
    link.click();
    URL.revokeObjectURL(url);
    pushToast({
      title: 'EHR report exported',
      description: `Downloaded consensus summary for ${activeCase.mrn}.`,
      variant: 'success',
      organBoard: activeCase.organBoard,
    });
  };

  const mins = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
  const secs = String(timerSeconds % 60).padStart(2, '0');

  if (!activeCase) {
    return (
      <div className="p-6 text-sm text-ink-muted">
        No patient cases are queued for this meeting yet.
      </div>
    );
  }

  const voteOptions =
    DEFAULT_PATHWAY_OPTIONS[activeCase.organBoard] ?? DEFAULT_PATHWAY_OPTIONS.Thoracic;

  return (
    <div className="p-4 sm:p-6 max-w-[1440px] mx-auto space-y-5">
      {/* Live Room Status & Presenter Telemetry Bar */}
      <section className="p-4 rounded-lg bg-panel border border-hairline flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
              <span
                className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`}
                aria-hidden="true"
              />
              {connected ? 'Live Room Connected' : 'Connecting...'}
            </span>
            <span aria-hidden="true" className="text-slate-400">·</span>
            <span className="text-ink-muted">{meeting.organBoard} Board</span>
            <span aria-hidden="true" className="text-slate-400">·</span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-600 dark:text-slate-300">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {presence.length || 1} connected
            </span>
          </div>
          <h2 className="font-display text-base sm:text-lg font-bold text-ink">
            {meeting.title}
          </h2>
        </div>

        {/* Case Timer & Sync Toggle */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={followPresenter}
              onChange={(e) => setFollowPresenter(e.target.checked)}
              className="accent-blue-700"
            />
            <span>Follow Presenter Slice Sync</span>
          </label>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            <span className="font-mono text-sm font-semibold tabular-nums text-ink">
              {mins}:{secs}
            </span>
            <button
              type="button"
              onClick={() => setTimerRunning((r) => !r)}
              aria-label={timerRunning ? 'Pause case timer' : 'Start case timer'}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              {timerRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setTimerRunning(false);
                setTimerSeconds(15 * 60);
              }}
              aria-label="Reset case timer"
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportReport}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export Report</span>
          </button>
        </div>
      </section>

      {feedbackError && (
        <div role="alert" className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
          {feedbackError}
        </div>
      )}
      {feedbackSuccess && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300">
          {feedbackSuccess}
        </div>
      )}

      {/* Main Live Board Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left: Agenda Queue + Connected Clinicians */}
        <div className="xl:col-span-3 space-y-4">
          <section className="rounded-lg bg-panel border border-hairline p-4 space-y-3">
            <h3 className="font-display text-xs font-semibold text-ink">
              Board Agenda Queue ({meeting.agenda.length})
            </h3>
            <div className="space-y-1.5">
              {meeting.agenda.map((item, idx) => {
                const c = cases.find((x) => x.id === item.caseId);
                if (!c) return null;
                const isSelected = c.id === activeCase.id;
                const token = getOrganBoardTheme(c.organBoard);
                return (
                  <motion.button
                    key={c.id}
                    type="button"
                    whileTap={{ scale: 0.985 }}
                    onClick={() => handleSelectAgendaCase(c.id)}
                    className={`w-full p-2.5 rounded-md border text-left transition-colors ${
                      isSelected
                        ? `${token.borderClass} ${token.softBgClass}`
                        : 'border-hairline hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                        <span
                          className={`h-2 w-2 rounded-xs shrink-0 ${token.swatchClass}`}
                          aria-hidden="true"
                        />
                        0{idx + 1}. {c.mrn}
                      </span>
                      <span
                        className={
                          c.status === 'Consensus Reached'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }
                      >
                        {c.status === 'Consensus Reached' ? 'Signed' : `${item.allocatedMinutes}m`}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-2">
                      {c.primaryDiagnosis}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className={`font-medium ${token.textClass}`}>{c.organBoard}</span> · {c.stageGroup}
                    </p>
                  </motion.button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg bg-panel border border-hairline p-4 space-y-2.5">
            <h3 className="font-display text-xs font-semibold text-ink">
              Live Connected Specialists
            </h3>
            {presence.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Connecting live presence roster...
              </p>
            ) : (
              <ul className="divide-y divide-hairline text-xs">
                {presence.map((p) => (
                  <li key={p.clinicianId} className="py-2">
                    <p className="font-medium text-ink">{p.fullName}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{p.specialty}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Center/Right: Presenting Case Stage + Live Voting + Sign-Off */}
        <div className="xl:col-span-9 space-y-5">
          {/* Active Case Presentation Header with Organ-Board Accent */}
          <div className="relative overflow-hidden rounded-lg bg-panel border border-hairline">
            <div className={`h-0.5 w-full ${getOrganBoardTheme(activeCase.organBoard).topRuleClass}`} aria-hidden="true" />
            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className={`inline-flex items-center gap-1.5 font-mono font-semibold ${getOrganBoardTheme(activeCase.organBoard).textClass}`}>
                    <span className={`h-2 w-2 rounded-xs ${getOrganBoardTheme(activeCase.organBoard).swatchClass}`} aria-hidden="true" />
                    Presenting: {activeCase.mrn}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {activeCase.patientInitials} ({activeCase.age}y {activeCase.sex})
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {activeCase.tnmT} {activeCase.tnmN} {activeCase.tnmM} ({activeCase.stageGroup})
                  </span>
                </div>
                <h3 className="font-display text-base font-semibold text-ink mt-0.5">
                  {activeCase.primaryDiagnosis}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1 p-0.5 rounded-md bg-slate-100 dark:bg-slate-900">
                  {(
                    [
                      ['dicom', 'Synced DICOM'],
                      ['summary', 'Summary & NGS'],
                    ] as const
                  ).map(([id, label]) => {
                    const active = activeStageTab === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setActiveStageTab(id)}
                        className={`relative px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                          active
                            ? 'text-ink'
                            : 'text-ink-muted hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        {active && (
                          <SlidingHighlight
                            layoutId="live-stage-tab"
                            className="bg-white dark:bg-slate-800 shadow-xs"
                          />
                        )}
                        <span className="relative z-10">{label}</span>
                      </button>
                    );
                  })}
                </div>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onOpenFullDossier(activeCase.id)}
                  className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap transition-colors"
                >
                  Full Dossier
                </motion.button>
              </div>
            </div>
          </div>

          {presenterSync && presenterSync.caseId === activeCase.id && (
            <div className="px-3.5 py-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2 font-mono">
              <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Presenter Sync ({presenterSync.presenterName}): Slice {presenterSync.sliceIndex + 1} · WW{' '}
                {presenterSync.windowWidth} / WL {presenterSync.windowCenter}
              </span>
            </div>
          )}

          {/* Presenting Stage: DICOM Viewer OR Clinical Summary */}
          {activeStageTab === 'dicom' ? (
            <DicomViewer
              patientCase={activeCase}
              annotations={annotations}
              onAnnotationAdded={(a) => setAnnotations((prev) => [a, ...prev])}
              onAnnotationDeleted={(id) => setAnnotations((prev) => prev.filter((a) => a.id !== id))}
              externalSync={presenterSync}
              followPresenter={followPresenter}
              compact
              onBroadcastSync={(state) =>
                emitPresenterSync({
                  meetingId: meeting.id,
                  caseId: activeCase.id,
                  ...state,
                })
              }
            />
          ) : (
            <div className="p-5 rounded-lg bg-panel border border-hairline space-y-4">
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {activeCase.clinicalSummary}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-hairline text-xs">
                <div>
                  <h4 className="font-semibold text-ink mb-1.5">
                    Actionable Molecular Variants
                  </h4>
                  {activeCase.genomics.mutations.length === 0 ? (
                    <p className="text-slate-500">None reported</p>
                  ) : (
                    <ul className="space-y-1 font-mono">
                      {activeCase.genomics.mutations.map((m, i) => (
                        <li key={i} className="text-slate-700 dark:text-slate-300">
                          {m.gene} {m.variant} · {m.tier} ({m.actionableTherapy})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-ink mb-1.5">
                    Pathology &amp; Biomarkers
                  </h4>
                  <p className="text-slate-600 dark:text-slate-300">
                    {activeCase.pathology.pathologistNote}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Split: Live Multidisciplinary Voting + Formal Consensus Sign-Off */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Live Consensus Voting */}
            <section className="lg:col-span-6 rounded-lg bg-panel border border-hairline p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-hairline pb-3">
                <div className="flex items-center gap-2">
                  <Vote className="h-4 w-4 text-blue-700 dark:text-sky-400" aria-hidden="true" />
                  <h3 className="font-display text-sm font-semibold text-ink">
                    Multidisciplinary Consensus Voting
                  </h3>
                </div>
                <span
                  className={`font-mono text-xs font-semibold ${
                    quorum.quorumMet
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {quorum.uniqueSpecialties}/3 Specialties · {quorum.quorumMet ? 'Quorum Met' : 'Pending'}
                </span>
              </div>

              {/* Tally Bars */}
              <div className="space-y-2.5">
                {quorum.tallies.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No specialty votes recorded for this case yet.
                  </p>
                ) : (
                  quorum.tallies.map((t) => (
                    <div key={t.optionLabel} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="font-medium text-ink">
                          {t.optionLabel}
                        </span>
                        <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                          {t.count} ({t.percentage}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <motion.div
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: Math.max(0.02, t.percentage / 100) }}
                          transition={CLINICAL_SPRING}
                          style={{ transformOrigin: 'left center' }}
                          className={`h-full w-full ${getOrganBoardTheme(activeCase.organBoard).swatchClass}`}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t.specialties.join(' · ')}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Cast Vote Form */}
              <form onSubmit={handleCastVote} className="pt-3 border-t border-hairline space-y-2.5">
                <div>
                  <label htmlFor="vote-option" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Select Treatment Pathway Vote
                  </label>
                  <select
                    id="vote-option"
                    value={selectedVoteOption}
                    onChange={(e) => setSelectedVoteOption(e.target.value)}
                    className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
                  >
                    {voteOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="vote-rationale" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Specialty Rationale
                  </label>
                  <input
                    id="vote-rationale"
                    type="text"
                    value={voteRationale}
                    onChange={(e) => setVoteRationale(e.target.value)}
                    placeholder="Brief clinical justification for your specialty..."
                    className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingVote}
                  className="w-full py-2 px-4 rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold disabled:opacity-50"
                >
                  {submittingVote ? 'Submitting Vote...' : 'Cast Specialty Vote'}
                </button>
              </form>
            </section>

            {/* Formal Consensus Sign-Off Form */}
            <section className="lg:col-span-6 rounded-lg bg-panel border border-hairline p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2 border-b border-hairline pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                  <h3 className="font-display text-sm font-semibold text-ink">
                    Final Consensus Sign-Off
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleDraftMinutesWithAi}
                  disabled={draftingAi}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium text-blue-700 dark:text-sky-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{draftingAi ? 'Drafting...' : 'AI Draft Minutes'}</span>
                </button>
              </div>

              <form onSubmit={handleSignConsensus} className="space-y-3">
                <div>
                  <label htmlFor="consensus-rec" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Primary Multidisciplinary Recommendation *
                  </label>
                  <input
                    id="consensus-rec"
                    type="text"
                    value={primaryRec}
                    onChange={(e) => setPrimaryRec(e.target.value)}
                    placeholder="e.g. Initiate neoadjuvant Osimertinib followed by RUL lobectomy"
                    className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
                  />
                </div>
                <div>
                  <label htmlFor="consensus-stage" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Confirmed Staging
                  </label>
                  <input
                    id="consensus-stage"
                    type="text"
                    value={stagingConfirmed}
                    onChange={(e) => setStagingConfirmed(e.target.value)}
                    className="w-full px-3 py-2 rounded-md text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
                  />
                </div>
                <div>
                  <label htmlFor="consensus-rationale" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Board Rationale &amp; Guideline Justification *
                  </label>
                  <textarea
                    id="consensus-rationale"
                    rows={2}
                    value={clinicalRationale}
                    onChange={(e) => setClinicalRationale(e.target.value)}
                    placeholder="Summarize board reasoning, biomarker impact, and surgical/RT consensus..."
                    className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
                  />
                </div>
                <div>
                  <label htmlFor="consensus-actions" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Follow-Up Actions (Specialty | Task | Due Window)
                  </label>
                  <textarea
                    id="consensus-actions"
                    rows={2}
                    value={actionsText}
                    onChange={(e) => setActionsText(e.target.value)}
                    className="w-full px-3 py-2 rounded-md text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
                  />
                </div>
                <button
                  type="submit"
                  disabled={signing || !canSignOff}
                  className="w-full py-2.5 px-4 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {signing ? 'Locking Consensus...' : 'Sign Off & Ratify MDT Consensus'}
                </button>
                {!canSignOff && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Only the board chair or the case&apos;s lead clinician can sign off the consensus.
                  </p>
                )}
              </form>
            </section>
          </div>

          {/* Live Room Secure Messaging */}
          <CaseChatPanel
            roomId={`meeting:${meeting.id}`}
            caseId={activeCase.id}
            tokenVersion={tokenVersion}
            title={`Live Board Discussion — ${meeting.title}`}
          />
        </div>
      </div>
    </div>
  );
}
