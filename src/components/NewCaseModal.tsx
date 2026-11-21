import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { deriveStageGroup } from '../lib/clinicalRules';
import { getOrganBoardTheme } from '../lib/organPalette';
import { api } from '../services/api';
import type { CaseUrgency, OrganBoard, PatientCase } from '../types';
import { SpringModal } from './MotionPrimitives';
import { useToast } from './ToastProvider';

interface NewCaseModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (created: PatientCase) => void;
}

export function NewCaseModal({ open, onClose, onCreated }: NewCaseModalProps) {
  const { pushToast } = useToast();
  const [mrn, setMrn] = useState('');
  const [patientInitials, setPatientInitials] = useState('');
  const [age, setAge] = useState('62');
  const [sex, setSex] = useState<'Female' | 'Male' | 'Other'>('Female');
  const [organBoard, setOrganBoard] = useState<OrganBoard>('Thoracic');
  const [primaryDiagnosis, setPrimaryDiagnosis] = useState('');
  const [histology, setHistology] = useState('');
  const [tnmT, setTnmT] = useState('T2b');
  const [tnmN, setTnmN] = useState('N1');
  const [tnmM, setTnmM] = useState('M0');
  const [ecog, setEcog] = useState('1');
  const [urgency, setUrgency] = useState<CaseUrgency>('Priority');
  const [baselineSumMm, setBaselineSumMm] = useState('34');
  const [clinicalSummary, setClinicalSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const estimatedStage = deriveStageGroup(tnmT, tnmN, tnmM);
  const boardToken = getOrganBoardTheme(organBoard);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!mrn.trim() || !patientInitials.trim() || !primaryDiagnosis.trim() || !clinicalSummary.trim()) {
      setError('Please complete MRN, patient initials, primary diagnosis, and clinical summary.');
      return;
    }

    const parsedAge = Number(age);
    if (!Number.isFinite(parsedAge) || parsedAge < 1 || parsedAge > 120) {
      setError('Patient age must be a valid number between 1 and 120.');
      return;
    }

    setSubmitting(true);
    try {
      const { patientCase } = await api.createCase({
        mrn: mrn.trim(),
        patientInitials: patientInitials.trim(),
        age: parsedAge,
        sex,
        organBoard,
        primaryDiagnosis: primaryDiagnosis.trim(),
        histology: histology.trim() || 'Histology pending final pathology report',
        tnmT: tnmT.trim(),
        tnmN: tnmN.trim(),
        tnmM: tnmM.trim(),
        stageGroup: estimatedStage,
        ecog: Number(ecog),
        urgency,
        clinicalSummary: clinicalSummary.trim(),
        baselineSumMm: Number(baselineSumMm) || 34,
      });
      onCreated(patientCase);
      pushToast({
        title: `Registered ${patientCase.mrn}`,
        description: `${patientCase.primaryDiagnosis} added to ${patientCase.organBoard} Board.`,
        variant: 'success',
        organBoard: patientCase.organBoard,
      });
      setMrn('');
      setPatientInitials('');
      setPrimaryDiagnosis('');
      setHistology('');
      setClinicalSummary('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to register patient case.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SpringModal open={open} onClose={onClose} labelledBy="new-case-title" maxWidthClass="max-w-2xl">
      <div className={`h-1 w-full ${boardToken.topRuleClass} transition-colors`} aria-hidden="true" />
      <div>
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
          <div>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-xs ${boardToken.swatchClass} transition-colors`} aria-hidden="true" />
              <h2
                id="new-case-title"
                className="font-display text-base font-semibold text-ink"
              >
                Register New Tumour Board Case
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              De-identified patient intake record persisted directly to SQL registry ({organBoard} Oncology).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close new case modal"
            className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="intake-mrn" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                De-Identified MRN *
              </label>
              <input
                id="intake-mrn"
                type="text"
                value={mrn}
                onChange={(e) => setMrn(e.target.value)}
                placeholder="e.g. ONC-2026-4290"
                className="w-full px-3 py-2 rounded-md text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
              />
            </div>
            <div>
              <label htmlFor="intake-initials" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Initials *
              </label>
              <input
                id="intake-initials"
                type="text"
                value={patientInitials}
                onChange={(e) => setPatientInitials(e.target.value)}
                placeholder="J.M."
                className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
              />
            </div>
            <div>
              <label htmlFor="intake-age" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Age *
              </label>
              <input
                id="intake-age"
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                min={1}
                max={120}
                className="w-full px-3 py-2 rounded-md text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="intake-sex" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Sex
              </label>
              <select
                id="intake-sex"
                value={sex}
                onChange={(e) => setSex(e.target.value as 'Female' | 'Male' | 'Other')}
                className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
              >
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="intake-board" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Organ Tumour Board
              </label>
              <select
                id="intake-board"
                value={organBoard}
                onChange={(e) => setOrganBoard(e.target.value as OrganBoard)}
                className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
              >
                <option value="Thoracic">Thoracic</option>
                <option value="Neuro">Neuro</option>
                <option value="Breast">Breast</option>
                <option value="GI">GI</option>
                <option value="Heme">Heme</option>
              </select>
            </div>
            <div>
              <label htmlFor="intake-urgency" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Priority Urgency
              </label>
              <select
                id="intake-urgency"
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as CaseUrgency)}
                className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
              >
                <option value="Urgent">Urgent</option>
                <option value="Priority">Priority</option>
                <option value="Routine">Routine</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="intake-diagnosis" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Primary Oncology Diagnosis *
            </label>
            <input
              id="intake-diagnosis"
              type="text"
              value={primaryDiagnosis}
              onChange={(e) => setPrimaryDiagnosis(e.target.value)}
              placeholder="e.g. Left Lower Lobe Squamous Cell Lung Carcinoma"
              className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
            />
          </div>

          <div>
            <label htmlFor="intake-histology" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Histology & Pathologic Subtype
            </label>
            <input
              id="intake-histology"
              type="text"
              value={histology}
              onChange={(e) => setHistology(e.target.value)}
              placeholder="e.g. Moderately differentiated adenocarcinoma, TTF-1+"
              className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
            <div>
              <label htmlFor="intake-t" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                T Stage
              </label>
              <input
                id="intake-t"
                type="text"
                value={tnmT}
                onChange={(e) => setTnmT(e.target.value)}
                className="w-full px-2.5 py-2 rounded-md text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
              />
            </div>
            <div>
              <label htmlFor="intake-n" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                N Stage
              </label>
              <input
                id="intake-n"
                type="text"
                value={tnmN}
                onChange={(e) => setTnmN(e.target.value)}
                className="w-full px-2.5 py-2 rounded-md text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
              />
            </div>
            <div>
              <label htmlFor="intake-m" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                M Stage
              </label>
              <input
                id="intake-m"
                type="text"
                value={tnmM}
                onChange={(e) => setTnmM(e.target.value)}
                className="w-full px-2.5 py-2 rounded-md text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
              />
            </div>
            <div>
              <label htmlFor="intake-ecog" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                ECOG
              </label>
              <select
                id="intake-ecog"
                value={ecog}
                onChange={(e) => setEcog(e.target.value)}
                className="w-full px-2.5 py-2 rounded-md text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
              >
                <option value="0">0</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </div>
            <div>
              <label htmlFor="intake-baseline" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Baseline (mm)
              </label>
              <input
                id="intake-baseline"
                type="number"
                value={baselineSumMm}
                onChange={(e) => setBaselineSumMm(e.target.value)}
                className="w-full px-2.5 py-2 rounded-md text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
              />
            </div>
            <div className="px-2.5 py-2 rounded-md bg-slate-100 dark:bg-slate-800/80 text-center">
              <span className="block text-[10px] text-slate-500 dark:text-slate-400">AJCC Group</span>
              <span className="font-mono text-xs font-semibold text-blue-700 dark:text-sky-400">
                {estimatedStage}
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="intake-summary" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Clinical Presentation & Tumour Board Question *
            </label>
            <textarea
              id="intake-summary"
              rows={4}
              value={clinicalSummary}
              onChange={(e) => setClinicalSummary(e.target.value)}
              placeholder="Summarize clinical presentation, prior workup, imaging findings, and the specific multidisciplinary question for the board..."
              className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-hairline">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold disabled:opacity-50"
            >
              {submitting ? 'Registering...' : 'Register Patient Case'}
            </button>
          </div>
        </form>
      </div>
    </SpringModal>
  );
}
