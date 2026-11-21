import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Archive, ArchiveRestore, CalendarPlus, Clock, Radio, Users, X } from 'lucide-react';
import { getOrganBoardTheme } from '../lib/organPalette';
import { api } from '../services/api';
import type { MdtMeeting, OrganBoard, PatientCase } from '../types';
import { SpringModal } from './MotionPrimitives';
import { useToast } from './ToastProvider';

interface MeetingsViewProps {
  meetings: MdtMeeting[];
  cases: PatientCase[];
  onMeetingCreated: (meeting: MdtMeeting) => void;
  onMeetingUpdated: (meeting: MdtMeeting) => void;
  archivedMeetings: MdtMeeting[];
  onMeetingArchived: (meeting: MdtMeeting) => void;
  onMeetingRestored: (meeting: MdtMeeting) => void;
  onEnterLiveRoom: (meetingId: string) => void;
}

export function MeetingsView({
  meetings,
  cases,
  onMeetingCreated,
  onMeetingUpdated,
  archivedMeetings,
  onMeetingArchived,
  onMeetingRestored,
  onEnterLiveRoom,
}: MeetingsViewProps) {
  const { pushToast } = useToast();
  const [archiveTarget, setArchiveTarget] = useState<MdtMeeting | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [organBoard, setOrganBoard] = useState<OrganBoard | 'Multi-Organ'>('Multi-Organ');
  const [scheduledStart, setScheduledStart] = useState('2026-11-27T14:00');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>(() =>
    cases.slice(0, 2).map((c) => c.id),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleCaseSelection = (id: string) => {
    setSelectedCaseIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSchedule = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !scheduledStart) {
      setError('Meeting title and scheduled start date/time are required.');
      return;
    }
    setSubmitting(true);
    try {
      const { meeting } = await api.createMeeting({
        title: title.trim(),
        organBoard,
        scheduledStart: new Date(scheduledStart).toISOString(),
        durationMinutes: Number(durationMinutes) || 60,
        caseIds: selectedCaseIds,
      });
      onMeetingCreated(meeting);
      setTitle('');
      pushToast({
        title: 'Tumour Board scheduled',
        description: `${meeting.title} (${meeting.organBoard} Board) saved with ${meeting.agenda.length} queued case(s).`,
        variant: 'success',
        organBoard: meeting.organBoard,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to schedule meeting.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      const { meeting } = await api.archiveMeeting(archiveTarget.id);
      onMeetingArchived(meeting);
      pushToast({
        title: 'Tumour Board archived',
        description: `${meeting.title} was removed from the schedule.`,
        variant: 'info',
        organBoard: meeting.organBoard,
      });
      setArchiveTarget(null);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Unable to archive this meeting.');
    } finally {
      setArchiving(false);
    }
  };

  const handleRestore = async (archived: MdtMeeting) => {
    setRestoringId(archived.id);
    setRestoreError(null);
    try {
      const { meeting } = await api.restoreMeeting(archived.id);
      onMeetingRestored(meeting);
      pushToast({
        title: 'Tumour Board restored',
        description: `${meeting.title} is back on the schedule.`,
        variant: 'success',
        organBoard: meeting.organBoard,
      });
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Unable to restore this meeting.');
    } finally {
      setRestoringId(null);
    }
  };

  const handleToggleLive = async (meeting: MdtMeeting) => {
    const nextStatus = meeting.roomStatus === 'Live' ? 'Completed' : 'Live';
    const { meeting: updated } = await api.updateMeeting(meeting.id, { roomStatus: nextStatus });
    onMeetingUpdated(updated);
    pushToast({
      title: nextStatus === 'Live' ? 'Live Tumour Board started' : 'Tumour Board session completed',
      description: updated.title,
      variant: nextStatus === 'Live' ? 'success' : 'info',
      organBoard: updated.organBoard,
    });
    if (nextStatus === 'Live') {
      onEnterLiveRoom(updated.id);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: Scheduled & Live Board Sessions */}
      <div className="lg:col-span-7 space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">
              Tumour Board Sessions &amp; Agenda Queue
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Launch live WebSocket sessions for synchronized DICOM review, quorum voting, and consensus ratification.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {meetings.length} total
          </span>
        </div>

        <div className="space-y-3">
          {meetings.map((m) => {
            const token = getOrganBoardTheme(m.organBoard);
            return (
              <motion.article
                key={m.id}
                whileHover={{ y: -2 }}
                transition={{ duration: 0.16 }}
                className={`relative overflow-hidden rounded-lg bg-panel border border-hairline ${token.hoverBorderClass} transition-colors`}
              >
                <div className={`h-0.5 w-full ${token.topRuleClass}`} aria-hidden="true" />
                <div className="p-5 space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span
                          className={
                            m.roomStatus === 'Live'
                              ? 'inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold'
                              : m.roomStatus === 'Completed'
                                ? 'text-slate-500 dark:text-slate-400'
                                : 'text-blue-700 dark:text-sky-400 font-medium'
                          }
                        >
                          {m.roomStatus === 'Live' && <Radio className="h-3.5 w-3.5" aria-hidden="true" />}
                          {m.roomStatus}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className={`inline-flex items-center gap-1.5 font-medium ${token.textClass}`}>
                          <span
                            className={`h-2 w-2 rounded-xs ${token.swatchClass}`}
                            aria-hidden="true"
                          />
                          {m.organBoard} Board
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {new Date(m.scheduledStart).toLocaleString([], {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                      <h3 className="font-display text-sm sm:text-base font-semibold text-ink">
                        {m.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" aria-hidden="true" />
                          Chair: {m.chairName}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          {m.durationMinutes} min · {m.agenda.length} cases
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleToggleLive(m)}
                        className="px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap transition-colors"
                      >
                        {m.roomStatus === 'Live' ? 'End Session' : 'Go Live'}
                      </motion.button>
                      {m.roomStatus !== 'Live' && (
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            setArchiveError(null);
                            setArchiveTarget(m);
                          }}
                          aria-label={`Archive ${m.title}`}
                          className="p-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                        </motion.button>
                      )}
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onEnterLiveRoom(m.id)}
                        className="px-3.5 py-2 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold whitespace-nowrap transition-colors"
                      >
                        Enter Room
                      </motion.button>
                    </div>
                  </div>

                  {/* Queued Cases Preview with Organ Swatches */}
                  {m.agenda.length > 0 && (
                    <div className="pt-3 border-t border-hairline">
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                        Agenda Queue
                      </p>
                      <div className="space-y-1.5">
                        {m.agenda.map((item, idx) => {
                          const matched = cases.find((c) => c.id === item.caseId);
                          const caseToken = matched ? getOrganBoardTheme(matched.organBoard) : token;
                          return (
                            <div
                              key={`${item.caseId}-${idx}`}
                              className="flex items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300"
                            >
                              <span className="inline-flex items-center gap-1.5 truncate">
                                <span
                                  className={`h-1.5 w-1.5 rounded-xs shrink-0 ${caseToken.swatchClass}`}
                                  aria-hidden="true"
                                />
                                <span className="font-mono text-slate-400">0{idx + 1}.</span>
                                <span className="font-mono font-medium">
                                  {matched?.mrn ?? item.caseId}
                                </span>
                                <span className="truncate">{matched?.primaryDiagnosis ?? 'Queued Case'}</span>
                              </span>
                              <span className="font-mono text-[11px] tabular-nums text-slate-500 shrink-0">
                                {item.allocatedMinutes}m
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>

        {archivedMeetings.length > 0 && (
          <section
            aria-label="Archived Tumour Board sessions"
            className="rounded-lg bg-panel border border-hairline p-5 space-y-3"
          >
            <div>
              <h3 className="font-display text-sm font-semibold text-ink">Archived Sessions</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Removed from the schedule. Restore a session to use it again.
              </p>
            </div>
            {restoreError && (
              <div role="alert" className="p-3 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {restoreError}
              </div>
            )}
            <ul className="divide-y divide-hairline">
              {archivedMeetings.map((m) => {
                const token = getOrganBoardTheme(m.organBoard);
                return (
                  <li key={m.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink truncate">{m.title}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        <span className={`inline-flex items-center gap-1.5 font-medium ${token.textClass}`}>
                          <span className={`h-2 w-2 rounded-xs ${token.swatchClass}`} aria-hidden="true" />
                          {m.organBoard} Board
                        </span>{' '}
                        ·{' '}
                        <span className="font-mono tabular-nums">
                          {new Date(m.scheduledStart).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </p>
                    </div>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      disabled={restoringId === m.id}
                      onClick={() => handleRestore(m)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-blue-600 hover:text-blue-700 dark:hover:border-sky-400 dark:hover:text-sky-300 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      <ArchiveRestore className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      <span>{restoringId === m.id ? 'Restoring...' : 'Restore'}</span>
                    </motion.button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {/* Right: Schedule New Tumour Board Session Form */}
      <div className="lg:col-span-5">
        <form
          onSubmit={handleSchedule}
          className="relative overflow-hidden rounded-lg bg-panel border border-hairline sticky top-22"
        >
          <div className={`h-0.5 w-full ${getOrganBoardTheme(organBoard).topRuleClass} transition-colors`} aria-hidden="true" />
          <div className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-hairline pb-3">
            <div className="flex items-center gap-2">
              <CalendarPlus className={`h-4 w-4 ${getOrganBoardTheme(organBoard).textClass}`} aria-hidden="true" />
              <h3 className="font-display text-sm font-semibold text-ink">
                Schedule Tumour Board Session
              </h3>
            </div>
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${getOrganBoardTheme(organBoard).textClass}`}>
              <span className={`h-2 w-2 rounded-xs ${getOrganBoardTheme(organBoard).swatchClass}`} aria-hidden="true" />
              {organBoard}
            </span>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          <div>
            <label htmlFor="mtg-title" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Board Session Title *
            </label>
            <input
              id="mtg-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. GI & Hepatobiliary Surgical Resectability Board"
              className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="mtg-board" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Specialty Focus
              </label>
              <select
                id="mtg-board"
                value={organBoard}
                onChange={(e) => setOrganBoard(e.target.value as OrganBoard | 'Multi-Organ')}
                className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
              >
                <option value="Multi-Organ">Multi-Organ</option>
                <option value="Thoracic">Thoracic</option>
                <option value="Neuro">Neuro</option>
                <option value="Breast">Breast</option>
                <option value="GI">GI</option>
                <option value="Heme">Heme</option>
              </select>
            </div>
            <div>
              <label htmlFor="mtg-duration" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Duration (Minutes)
              </label>
              <input
                id="mtg-duration"
                type="number"
                min={15}
                max={240}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="w-full px-3 py-2 rounded-md text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
              />
            </div>
          </div>

          <div>
            <label htmlFor="mtg-start" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Scheduled Date &amp; Time *
            </label>
            <input
              id="mtg-start"
              type="datetime-local"
              value={scheduledStart}
              onChange={(e) => setScheduledStart(e.target.value)}
              className="w-full px-3 py-2 rounded-md text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
            />
          </div>

          <div>
            <p className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Select Cases for Board Agenda ({selectedCaseIds.length} selected)
            </p>
            <div className="max-h-52 overflow-y-auto divide-y divide-hairline border border-slate-200 dark:border-slate-700 rounded-md">
              {cases.map((c) => {
                const checked = selectedCaseIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className="flex items-start gap-2.5 p-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCaseSelection(c.id)}
                      className="mt-0.5 accent-blue-700"
                    />
                    <span className="min-w-0">
                      <span className="font-mono font-semibold text-ink">
                        {c.mrn}
                      </span>{' '}
                      <span className="text-slate-500 dark:text-slate-400">· {c.organBoard}</span>
                      <span className="block text-slate-700 dark:text-slate-300 truncate">
                        {c.primaryDiagnosis}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <motion.button
            type="submit"
            whileTap={{ scale: 0.98 }}
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Scheduling...' : 'Schedule Tumour Board'}
          </motion.button>
          </div>
        </form>
      </div>

      <SpringModal
        open={archiveTarget !== null}
        onClose={() => !archiving && setArchiveTarget(null)}
        labelledBy="archive-meeting-title"
        maxWidthClass="max-w-md"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
          <div>
            <h2 id="archive-meeting-title" className="font-display text-base font-semibold text-ink">
              Archive Tumour Board
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Removes the session from the schedule.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setArchiveTarget(null)}
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
            {archiveTarget?.title} will no longer appear in the schedule or the Live Board Room. The record
            and its audit trail stay in the database, and a board chair can have it restored.
          </p>
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setArchiveTarget(null)}
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
              {archiving ? 'Archiving...' : 'Archive Tumour Board'}
            </button>
          </div>
        </div>
      </SpringModal>
    </div>
  );
}
