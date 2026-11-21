import type { PatientCase } from '../types';

interface PathologyPanelProps {
  patientCase: PatientCase;
}

export function PathologyPanel({ patientCase }: PathologyPanelProps) {
  const { pathology, genomics } = patientCase;

  return (
    <div className="space-y-6">
      {/* Histopathology & Specimen Summary */}
      <section className="rounded-lg bg-panel border border-hairline p-5 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline pb-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-ink">
              Surgical & Molecular Histopathology
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Specimen <span className="font-mono">{pathology.specimenId}</span> · Biopsy{' '}
              <span className="font-mono tabular-nums">{pathology.biopsyDate}</span> ·{' '}
              {pathology.biopsySite}
            </p>
          </div>
          <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
            {pathology.grade}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Histologic Classification</p>
            <p className="mt-1 text-ink">{pathology.histology}</p>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Surgical Margin Status</p>
            <p className="mt-1 text-ink">{pathology.margins}</p>
          </div>
        </div>

        {pathology.pathologistNote && (
          <div className="p-3.5 rounded-md bg-slate-50 dark:bg-slate-900/70 border border-hairline text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            <span className="font-semibold text-ink">
              Pathologist Interpretation:{' '}
            </span>
            {pathology.pathologistNote}
          </div>
        )}

        {/* IHC Staining Matrix */}
        <div>
          <h4 className="text-xs font-semibold text-ink mb-2">
            Immunohistochemistry (IHC) Staining Matrix
          </h4>
          {pathology.ihcMarkers.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No IHC markers recorded yet.</p>
          ) : (
            <div className="overflow-x-auto border border-hairline rounded-md">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-hairline text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-3 font-medium">Marker</th>
                    <th className="py-2.5 px-3 font-medium">Result / Score</th>
                    <th className="py-2.5 px-3 font-medium">Clinical Interpretation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {pathology.ihcMarkers.map((m, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-3 font-mono font-semibold text-ink">
                        {m.marker}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-blue-700 dark:text-sky-400">
                        {m.result}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                        {m.interpretation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Next-Generation Sequencing & Precision Biomarkers */}
      <section className="rounded-lg bg-panel border border-hairline p-5 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline pb-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-ink">
              Molecular Genomics & Actionable Alterations
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{genomics.assayName}</p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
            <span>TMB: {genomics.tmbMutPerMb} mut/Mb</span>
            <span aria-hidden="true">·</span>
            <span>MSI: {genomics.msiStatus}</span>
            <span aria-hidden="true">·</span>
            <span>PD-L1: {genomics.pdL1Score}</span>
          </div>
        </div>

        {genomics.mutations.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No somatic alterations reported in NGS panel.
          </p>
        ) : (
          <div className="overflow-x-auto border border-hairline rounded-md">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-hairline text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3 font-medium">Gene</th>
                  <th className="py-2.5 px-3 font-medium">Alteration / Variant</th>
                  <th className="py-2.5 px-3 font-medium text-right">VAF %</th>
                  <th className="py-2.5 px-3 font-medium">AMP/ASCO Tier</th>
                  <th className="py-2.5 px-3 font-medium">Targeted Therapy / Clinical Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {genomics.mutations.map((mut, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 px-3 font-mono font-semibold text-ink">
                      {mut.gene}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">
                      {mut.variant}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-700 dark:text-slate-300">
                      {mut.vafPercent.toFixed(1)}%
                    </td>
                    <td
                      className={`py-2.5 px-3 font-mono font-semibold ${
                        mut.tier === 'Tier I-A'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : mut.tier === 'Tier I-B'
                            ? 'text-blue-700 dark:text-sky-400'
                            : 'text-ink-muted'
                      }`}
                    >
                      {mut.tier}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                      {mut.actionableTherapy}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Matched Clinical Trials */}
        <div className="pt-2">
          <h4 className="text-xs font-semibold text-ink mb-2">
            Biomarker-Matched Clinical Trials
          </h4>
          {genomics.trialMatches.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No active protocol trials matched for this biomarker profile.
            </p>
          ) : (
            <div className="divide-y divide-hairline border border-hairline rounded-md">
              {genomics.trialMatches.map((trial) => (
                <div key={trial.nctId} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="font-semibold text-blue-700 dark:text-sky-400">{trial.nctId}</span>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span className="text-slate-500 dark:text-slate-400">{trial.phase}</span>
                    </div>
                    <p className="text-xs font-medium text-ink mt-1">
                      {trial.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Match criteria: {trial.biomarkerMatch}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium shrink-0 ${
                      trial.eligibilityStatus === 'Eligible'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {trial.eligibilityStatus}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
