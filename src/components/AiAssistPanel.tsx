import { useState, type FormEvent } from 'react';
import { FileText, Send, Sparkles } from 'lucide-react';
import { api } from '../services/api';
import type { AiMinutesResult, AiSynthesisResult, PatientCase } from '../types';

interface AiAssistPanelProps {
  patientCase: PatientCase;
  onApplyMinutes?: (minutes: AiMinutesResult) => void;
}

export function AiAssistPanel({ patientCase, onApplyMinutes }: AiAssistPanelProps) {
  const [synthesis, setSynthesis] = useState<AiSynthesisResult | null>(null);
  const [minutes, setMinutes] = useState<AiMinutesResult | null>(null);
  const [loadingSynth, setLoadingSynth] = useState(false);
  const [loadingMinutes, setLoadingMinutes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);

  const handleSynthesize = async () => {
    setLoadingSynth(true);
    setError(null);
    try {
      const res = await api.aiSynthesize(patientCase.id);
      setSynthesis(res.synthesis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate guideline synthesis.');
    } finally {
      setLoadingSynth(false);
    }
  };

  const handleDraftMinutes = async () => {
    setLoadingMinutes(true);
    setError(null);
    try {
      const res = await api.aiDraftMinutes(patientCase.id);
      setMinutes(res.minutes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to draft consensus minutes.');
    } finally {
      setLoadingMinutes(false);
    }
  };

  const handleAsk = async (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    const q = question.trim();
    setQuestion('');
    setAsking(true);
    setError(null);
    const nextHistory = [...chatHistory, { role: 'user' as const, text: q }];
    setChatHistory(nextHistory);
    try {
      const { answer } = await api.aiChat(patientCase.id, q, chatHistory);
      setChatHistory([...nextHistory, { role: 'assistant', text: answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Copilot query failed.');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Action Header */}
      <div className="p-5 rounded-lg bg-panel border border-hairline flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-sm font-semibold text-ink">
            AI Clinical Decision Support & Guideline Synthesis
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Synthesizes TNM staging, NGS biomarkers, RECIST measurements, and board discussions into structured NCCN/ESMO-aligned decision support. Attending clinician verification required.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSynthesize}
            disabled={loadingSynth}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{loadingSynth ? 'Synthesizing...' : 'Run Guideline Synthesis'}</span>
          </button>
          <button
            type="button"
            onClick={handleDraftMinutes}
            disabled={loadingMinutes}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{loadingMinutes ? 'Drafting...' : 'Draft Consensus Minutes'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Structured Guideline Synthesis Output */}
      {synthesis && (
        <section className="rounded-lg bg-panel border border-hairline p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-hairline">
            <div>
              <h4 className="text-xs font-semibold text-ink">
                Staging & Resectability Verification
              </h4>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {synthesis.stagingVerification}
              </p>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-ink">
                Guideline Concordance Summary
              </h4>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {synthesis.guidelineConcordance}
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-ink mb-2.5">
              Ranked Evidence-Based Treatment Pathways
            </h4>
            <div className="divide-y divide-hairline border border-hairline rounded-md">
              {synthesis.recommendedPathways.map((p) => (
                <div key={p.rank} className="p-3.5 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-ink">
                      0{p.rank}. {p.pathway}
                    </span>
                    <span className="font-mono text-blue-700 dark:text-sky-400 shrink-0">
                      {p.evidenceLevel}
                    </span>
                  </div>
                  <p className="text-xs text-ink-muted leading-relaxed">
                    {p.rationale}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <h4 className="font-semibold text-ink mb-1.5">
                Biomarker Insights
              </h4>
              <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                {synthesis.biomarkerInsights.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-ink mb-1.5">
                Diagnostic Gaps to Verify
              </h4>
              <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                {synthesis.diagnosticGaps.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-ink mb-1.5">
                Trial Considerations
              </h4>
              <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                {synthesis.clinicalTrialConsiderations.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-[11px] text-amber-700 dark:text-amber-400 pt-2 border-t border-hairline">
            {synthesis.disclaimer}
          </p>
        </section>
      )}

      {/* AI Drafted Consensus Minutes */}
      {minutes && (
        <section className="rounded-lg bg-panel border border-hairline p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-display text-sm font-semibold text-ink">
              AI-Drafted Tumour Board Consensus Minutes
            </h4>
            {onApplyMinutes && (
              <button
                type="button"
                onClick={() => onApplyMinutes(minutes)}
                className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
              >
                Populate Consensus Sign-Off Form
              </button>
            )}
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            <strong>Primary Recommendation:</strong> {minutes.primaryRecommendation}
          </p>
          <p className="text-xs text-ink-muted leading-relaxed">
            <strong>Rationale:</strong> {minutes.clinicalRationale}
          </p>
          {minutes.followUpActions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-ink">
                Drafted Specialty Action Items:
              </p>
              <ul className="list-disc pl-4 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                {minutes.followUpActions.map((a, idx) => (
                  <li key={idx}>
                    <span className="font-medium">{a.specialty}:</span> {a.task} ({a.dueWindow})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Case-Scoped Clinical Q&A Copilot */}
      <section className="rounded-lg bg-panel border border-hairline p-5 space-y-3">
        <h4 className="font-display text-xs font-semibold text-ink">
          Case-Scoped Oncology Q&amp;A Copilot ({patientCase.mrn})
        </h4>
        <div className="flex flex-wrap gap-2">
          {[
            'Evaluate neoadjuvant vs. upfront surgical resection risk-benefit',
            'Summarize biomarker-driven targeted therapy sequencing',
            'List key radiation planning constraints for this anatomical site',
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setQuestion(preset)}
              className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
            >
              {preset}
            </button>
          ))}
        </div>

        {chatHistory.length > 0 && (
          <div className="space-y-2.5 max-h-64 overflow-y-auto pt-2">
            {chatHistory.map((item, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-md text-xs leading-relaxed whitespace-pre-wrap ${
                  item.role === 'user'
                    ? 'bg-slate-100 dark:bg-slate-800/80 text-ink ml-8'
                    : 'bg-slate-50 dark:bg-slate-900/60 border border-hairline text-slate-800 dark:text-slate-200 mr-8'
                }`}
              >
                <span className="block font-semibold mb-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {item.role === 'user' ? 'Clinician Query' : 'AI Decision Support'}
                </span>
                {item.text}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAsk} className="flex items-center gap-2 pt-1">
          <label htmlFor="ai-copilot-input" className="sr-only">
            Ask clinical question about this case
          </label>
          <input
            id="ai-copilot-input"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about staging nuance, drug interactions, trial criteria, or radiation fields..."
            className="flex-1 px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
          />
          <button
            type="submit"
            disabled={asking || !question.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{asking ? 'Thinking...' : 'Ask'}</span>
          </button>
        </form>
      </section>
    </div>
  );
}
