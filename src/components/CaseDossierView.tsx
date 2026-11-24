import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  FlaskConical,
  MessageSquare,
  Scan,
  Sparkles,
  X,
} from 'lucide-react';
import { formatConsensusReportText } from '../lib/clinicalRules';
import { getOrganBoardTheme } from '../lib/organPalette';
import { api } from '../services/api';
import type { CaseStatus, ConsensusVote, ImagingAnnotation, PatientCase } from '../types';
import { AiAssistPanel } from './AiAssistPanel';
import { CaseChatPanel } from './CaseChatPanel';
import { DicomViewer } from './DicomViewer';
import { SlidingHighlight, SpringModal, VIEW_TRANSITION } from './MotionPrimitives';
import { PathologyPanel } from './PathologyPanel';
import { useToast } from './ToastProvider';

type DossierTab = 'overview' | 'dicom' | 'pathology' | 'discussion' | 'ai';

interface CaseDossierViewProps {
  caseId: string;
  tokenVersion: string | null;
  onBack: () => void;
  onCaseUpdated: (updated: PatientCase) => void;
  onCaseArchived: (archived: PatientCase) => void;
}

export function CaseDossierView({
  caseId,
  tokenVersion,
  onBack,
  onCaseUpdated,
  onCaseArchived,
}: CaseDossierViewProps) {
  const { pushToast } = useToast();
  const [activeTab, setActiveTab] = useState<DossierTab>('overview');
  const [patientCase, setPatientCase] = useState<PatientCase | null>(null);
  const [annotations, setAnnotations] = useState<ImagingAnnotation[]>([]);
  const [votes, setVotes] = useState<ConsensusVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getCaseDetail(caseId)
      .then((res) => {
        if (!active) return;
        setPatientCase(res.patientCase);
        setAnnotations(res.annotations);
        setVotes(res.votes);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load case dossier.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [caseId]);

  const handleStatusChange = async (newStatus: CaseStatus) => {
    if (!patientCase) return;
    setUpdatingStatus(true);
    try {
      const { patientCase: updated } = await api.updateCase(patientCase.id, { status: newStatus });
      setPatientCase(updated);
      onCaseUpdated(updated);
      pushToast({
        title: `Case status updated to ${newStatus}`,
        description: `${updated.mrn} (${updated.organBoard} Board) saved to SQL registry.`,
        variant: 'info',
        organBoard: updated.organBoard,
      });
    } catch (err) {
      pushToast({
        title: 'Status not updated',
        description: err instanceof Error ? err.message : 'Unable to update this case.',
        variant: 'warning',
        organBoard: patientCase.organBoard,
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleArchive = async () => {
    if (!patientCase) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      const { patientCase: archived } = await api.archiveCase(patientCase.id);
      pushToast({
        title: `Archived ${archived.mrn}`,
        description: 'Hidden from the registry. Restore it with the Archived status filter.',
        variant: 'info',
        organBoard: archived.organBoard,
      });
      onCaseArchived(archived);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Unable to archive this case.');
      setArchiving(false);
    }
  };

  const handleDownloadReport = () => {
    if (!patientCase) return;
    const text = formatConsensusReportText(patientCase, votes, annotations);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${patientCase.mrn}_MDT_Consensus_Report.txt`;
    link.click();
    URL.revokeObjectURL(url);
    pushToast({
      title: 'EHR Consensus Report exported',
      description: `Downloaded structured MDT summary for ${patientCase.mrn}.`,
      variant: 'success',
      organBoard: patientCase.organBoard,
    });
  };

  if (loading) {
    return (
      <div className="p-6 max-w-[1440px] mx-auto">
        <div className="h-40 rounded-lg bg-slate-200/60 dark:bg-slate-800/50 animate-pulse" />
      </div>
    );
  }

  if (error || !patientCase) {
    return (
      <div className="p-6 max-w-[1440px] mx-auto space-y-3">
        <p className="text-sm text-rose-700 dark:text-rose-400">{error || 'Case not found.'}</p>
        <button
          type="button"
          onClick={onBack}
          className="px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium"
        >
          Back to Case Registry
        </button>
      </div>
    );
  }

  const tabs: { id: DossierTab; label: string; icon: typeof FileText }[] = [
    { id: 'overview', label: 'Clinical Overview', icon: FileText },
    { id: 'dicom', label: 'DICOM Imaging Studio', icon: Scan },
    { id: 'pathology', label: 'Pathology & Genomics', icon: FlaskConical },
    { id: 'discussion', label: 'MDT Discussion', icon: MessageSquare },
    { id: 'ai', label: 'AI Diagnostic Assist', icon: Sparkles },
  ];

  const boardToken = getOrganBoardTheme(patientCase.organBoard);

  return (
    <div className="p-4 sm:p-6 max-w-[1440px] mx-auto space-y-5">
      {/* Patient Clinical Banner with Unified Organ-Board Color Rule */}
      <div className="relative overflow-hidden rounded-lg bg-panel border border-hairline">
        <div className={`h-0.5 w-full ${boardToken.topRuleClass}`} aria-hidden="true" />
        <div className="p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-sky-400 font-medium transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Registry</span>
                </button>
                <span aria-hidden="true">/</span>
                <span className="font-mono font-semibold text-ink">
                  {patientCase.mrn}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {patientCase.patientInitials} ({patientCase.age}y {patientCase.sex})
                </span>
                <span aria-hidden="true">·</span>
                <span className={`inline-flex items-center gap-1.5 font-medium ${boardToken.textClass}`}>
                  <span
                    className={`h-2 w-2 rounded-xs ${boardToken.swatchClass}`}
                    aria-hidden="true"
                  />
                  {patientCase.organBoard} Oncology Board
                </span>
              </div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-ink">
                {patientCase.primaryDiagnosis}
              </h2>
              <p className="text-xs font-mono tabular-nums text-ink-muted">
                AJCC {patientCase.tnmT} {patientCase.tnmN} {patientCase.tnmM} ({patientCase.stageGroup}) · ECOG {patientCase.ecog} · Urgency: {patientCase.urgency}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <label htmlFor="dossier-status-select" className="sr-only">
                Workflow Status
              </label>
              <select
                id="dossier-status-select"
                value={patientCase.status}
                disabled={updatingStatus}
                onChange={(e) => handleStatusChange(e.target.value as CaseStatus)}
                className="px-3 py-2 rounded-md text-xs font-medium bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 transition-colors"
              >
                <option value="Intake">Status: Intake</option>
                <option value="Scheduled">Status: Scheduled</option>
                <option value="In Review">Status: In Review</option>
                <option value="Consensus Reached">Status: Consensus Reached</option>
              </select>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={handleDownloadReport}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap transition-colors"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Export EHR Report</span>
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setArchiveError(null);
                  setArchiveOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap transition-colors"
              >
                <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Archive Case</span>
              </motion.button>
            </div>
          </div>

          {/* Sub-Navigation Tabs with Gliding Organ-Board Highlight */}
          <div
            role="tablist"
            aria-label="Patient Dossier Sections"
            className="flex items-center gap-1 border-t border-hairline pt-3 overflow-x-auto"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? boardToken.textClass
                      : 'text-ink-muted hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {active && (
                    <SlidingHighlight
                      layoutId="dossier-subtab"
                      className={`${boardToken.softBgClass} border ${boardToken.borderClass} rounded-md`}
                    />
                  )}
                  <Icon className="relative z-10 h-3.5 w-3.5" aria-hidden="true" />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Content with Smooth View Transition */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={VIEW_TRANSITION}
        >
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 space-y-5">
            {/* Clinical Narrative */}
            <section className="rounded-lg bg-panel border border-hairline p-5 space-y-2.5">
              <h3 className="font-display text-sm font-semibold text-ink">
                Clinical Presentation & Tumour Board Question
              </h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {patientCase.clinicalSummary}
              </p>
            </section>

            {/* Signed Consensus Banner (if signed) */}
            {patientCase.consensus && (
              <section className="rounded-lg bg-panel border border-emerald-500/50 dark:border-emerald-500/40 p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    <h3 className="font-display text-sm font-semibold">
                      Ratified MDT Consensus Recommendation
                    </h3>
                  </div>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {patientCase.consensus.stagingConfirmed}
                  </span>
                </div>
                <p className="text-sm font-medium text-ink">
                  {patientCase.consensus.primaryRecommendation}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {patientCase.consensus.clinicalRationale}
                </p>
                {patientCase.consensus.followUpActions.length > 0 && (
                  <div className="pt-2 border-t border-hairline">
                    <p className="text-xs font-semibold text-ink mb-1.5">
                      Assigned Specialty Follow-Up Plan
                    </p>
                    <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                      {patientCase.consensus.followUpActions.map((act, idx) => (
                        <li key={idx}>
                          <span className="font-semibold">{act.specialty}:</span> {act.task} ·{' '}
                          <span className="font-mono text-slate-500 dark:text-slate-400">
                            {act.dueWindow}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 pt-2 border-t border-hairline">
                  Signed by {patientCase.consensus.signedOffBy} ({patientCase.consensus.signedOffSpecialty}) on{' '}
                  {new Date(patientCase.consensus.signedOffAt).toLocaleString()}
                </p>
              </section>
            )}

            {/* Longitudinal Treatment & Workup Timeline */}
            <section className="rounded-lg bg-panel border border-hairline p-5 space-y-3">
              <h3 className="font-display text-sm font-semibold text-ink">
                Longitudinal Treatment & Diagnostic Timeline
              </h3>
              {patientCase.treatmentHistory.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No prior systemic or surgical treatment episodes logged yet.
                </p>
              ) : (
                <div className="divide-y divide-hairline">
                  {patientCase.treatmentHistory.map((ev, idx) => (
                    <div key={idx} className="py-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-5">
                      <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 w-24 shrink-0">
                        {ev.date}
                      </span>
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-ink">
                          {ev.modality} · {ev.regimen}
                        </p>
                        <p className="text-xs text-ink-muted">{ev.outcome}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Key Labs & Quick Launchers */}
          <div className="lg:col-span-4 space-y-5">
            <section className="rounded-lg bg-panel border border-hairline p-5 space-y-3">
              <h3 className="font-display text-sm font-semibold text-ink">
                Baseline Laboratory & Organ Function
              </h3>
              {patientCase.labs.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No laboratory panel entered.</p>
              ) : (
                <div className="divide-y divide-hairline text-xs">
                  {patientCase.labs.map((lab, idx) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-ink">{lab.name}</p>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          Ref: {lab.referenceRange}
                        </p>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <p
                          className={`font-semibold ${
                            lab.flag === 'Elevated' || lab.flag === 'Critical'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-ink'
                          }`}
                        >
                          {lab.value} {lab.unit}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{lab.flag}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-lg bg-panel border border-hairline p-5 space-y-3">
              <h3 className="font-display text-sm font-semibold text-ink">
                Diagnostic Quick Jump
              </h3>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('dicom')}
                  className="w-full px-3.5 py-2.5 rounded-md border border-slate-200 dark:border-slate-700 text-left text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
                >
                  <span>Open DICOM CT/MRI Viewer</span>
                  <span className="font-mono text-slate-500">{annotations.length} ROIs</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('pathology')}
                  className="w-full px-3.5 py-2.5 rounded-md border border-slate-200 dark:border-slate-700 text-left text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
                >
                  <span>Inspect NGS &amp; IHC Biomarkers</span>
                  <span className="font-mono text-slate-500">
                    {patientCase.genomics.mutations.length} variants
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ai')}
                  className="w-full px-3.5 py-2.5 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-left text-xs font-semibold flex items-center justify-between"
                >
                  <span>Run AI Guideline Concordance</span>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === 'dicom' && (
        <DicomViewer
          patientCase={patientCase}
          annotations={annotations}
          onAnnotationAdded={(annot) => setAnnotations((prev) => [annot, ...prev])}
          onAnnotationDeleted={(id) => setAnnotations((prev) => prev.filter((a) => a.id !== id))}
        />
      )}

      {activeTab === 'pathology' && <PathologyPanel patientCase={patientCase} />}

      {activeTab === 'discussion' && (
        <CaseChatPanel
          roomId={`case:${patientCase.id}`}
          caseId={patientCase.id}
          tokenVersion={tokenVersion}
          title={`Case Channel — ${patientCase.mrn}`}
        />
      )}

      {activeTab === 'ai' && <AiAssistPanel patientCase={patientCase} />}
        </motion.div>
      </AnimatePresence>

      <SpringModal
        open={archiveOpen}
        onClose={() => !archiving && setArchiveOpen(false)}
        labelledBy="archive-case-title"
        maxWidthClass="max-w-md"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
          <div>
            <h2 id="archive-case-title" className="font-display text-base font-semibold text-ink">
              Archive {patientCase.mrn}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Reversible. Nothing is deleted.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setArchiveOpen(false)}
            disabled={archiving}
            aria-label="Close archive dialog"
            className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {archiveError && (
            <div role="alert" className="p-3 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {archiveError}
            </div>
          )}
          <p className="text-xs leading-relaxed text-ink-muted">
            The case leaves the Case Registry and can no longer receive votes, annotations or edits.
            Its record and audit trail stay in the database, and the lead clinician or a board chair can
            restore it from the Archived status filter.
          </p>
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setArchiveOpen(false)}
              disabled={archiving}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleArchive}
              disabled={archiving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {archiving ? 'Archiving...' : 'Archive Case'}
            </button>
          </div>
        </div>
      </SpringModal>
    </div>
  );
}
