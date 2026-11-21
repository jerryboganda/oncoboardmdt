import { useEffect, useState } from 'react';
import { Database, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import type { AuditLogEntry, DbSystemInfo } from '../types';
import { AnimatedNumber } from './MotionPrimitives';

export function AuditAndInfraView() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [status, setStatus] = useState<(DbSystemInfo & { aiConfigured: boolean }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([api.getAuditLogs(), api.getSystemStatus()])
      .then(([auditRes, statusRes]) => {
        if (!active) return;
        setLogs(auditRes.logs);
        setStatus(statusRes);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="p-4 sm:p-6 max-w-[1440px] mx-auto space-y-6">
      {/* Hostinger Business Plan MySQL & Relational Storage Status */}
      <section className="rounded-lg bg-panel border border-hairline p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-hairline pb-3">
          <div className="flex items-center gap-2.5">
            <Database className="h-4 w-4 text-blue-700 dark:text-sky-400" aria-hidden="true" />
            <div>
              <h2 className="font-display text-sm font-semibold text-ink">
                Relational Database &amp; Hostinger Business Plan Readiness
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Parameterized MySQL 8 / MariaDB driver (`mysql2`) with automatic local preview SQLite fallback.
              </p>
            </div>
          </div>
          {status && (
            <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Active Engine: {status.engine.toUpperCase()}
            </span>
          )}
        </div>

        {status && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-6 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-900/60 border border-hairline">
                  <p className="text-slate-500 dark:text-slate-400">Connection Target</p>
                  <p className="mt-1 font-mono font-semibold text-ink break-all">
                    {status.host}
                  </p>
                </div>
                <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-900/60 border border-hairline">
                  <p className="text-slate-500 dark:text-slate-400">Database Schema</p>
                  <p className="mt-1 font-mono font-semibold text-ink break-all">
                    {status.database}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center pt-1">
                {(
                  [
                    ['Cases', status.tableCounts.cases],
                    ['Clinicians', status.tableCounts.clinicians],
                    ['Meetings', status.tableCounts.meetings],
                    ['RECIST ROIs', status.tableCounts.annotations],
                    ['Votes', status.tableCounts.votes],
                    ['Audit Rows', status.tableCounts.auditLogs],
                  ] as const
                ).map(([label, val]) => (
                  <div
                    key={label}
                    className="p-2.5 rounded-md border border-hairline hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                  >
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-ink">
                      <AnimatedNumber value={val} />
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6 p-4 rounded-md bg-slate-50 dark:bg-slate-900/60 border border-hairline space-y-2 text-xs">
              <p className="font-semibold text-ink">
                Hostinger Business Plan (Node.js + MySQL) Deployment Checklist
              </p>
              <ol className="list-decimal pl-4 space-y-1.5 text-slate-600 dark:text-slate-300 leading-relaxed">
                <li>
                  Create a MySQL database in Hostinger hPanel and optionally import the bundled{' '}
                  <code className="font-mono text-ink">schema.mysql.sql</code>{' '}
                  via phpMyAdmin (the server also auto-creates tables on boot).
                </li>
                <li>
                  In Hostinger Node.js Web App settings, configure environment variables:{' '}
                  <code className="font-mono text-ink">
                    DB_HOST=127.0.0.1
                  </code>
                  , <code className="font-mono">DB_PORT=3306</code>,{' '}
                  <code className="font-mono">DB_USER</code>,{' '}
                  <code className="font-mono">DB_PASSWORD</code>,{' '}
                  <code className="font-mono">DB_NAME</code>, and{' '}
                  <code className="font-mono">GEMINI_API_KEY</code>.
                </li>
                <li>
                  Set Build Command to <code className="font-mono">npm run build</code> and Start Command
                  to <code className="font-mono">npm start</code> with{' '}
                  <code className="font-mono">NODE_ENV=production</code>.
                </li>
              </ol>
            </div>
          </div>
        )}
      </section>

      {/* Immutable Clinical Audit Trail */}
      <section className="rounded-lg bg-panel border border-hairline overflow-hidden">
        <div className="px-5 py-4 border-b border-hairline flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            <h2 className="font-display text-sm font-semibold text-ink">
              Clinical Audit Trail (Append-Only Event Log)
            </h2>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {logs.length} recent events
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-hairline text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-medium">Timestamp</th>
                <th className="py-3 px-4 font-medium">Clinician &amp; Specialty</th>
                <th className="py-3 px-4 font-medium">Action</th>
                <th className="py-3 px-4 font-medium">Clinical Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-8 px-4 text-center text-slate-500">
                    Loading clinical audit log...
                  </td>
                </tr>
              ) : (
                logs.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString([], {
                        dateStyle: 'short',
                        timeStyle: 'medium',
                      })}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-medium text-ink">
                        {entry.actorName}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {' '}
                        · {entry.actorSpecialty}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-blue-700 dark:text-sky-400 whitespace-nowrap">
                      {entry.action}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{entry.detail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
