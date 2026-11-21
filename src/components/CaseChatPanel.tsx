import { useEffect, useState, type FormEvent } from 'react';
import { Lock, Send, Users } from 'lucide-react';
import { useBoardSocket } from '../hooks/useBoardSocket';
import { api } from '../services/api';
import type { CaseMessage, MessageTag } from '../types';

interface CaseChatPanelProps {
  roomId: string;
  caseId: string | null;
  tokenVersion: string | null;
  title?: string;
}

const MESSAGE_TAGS: MessageTag[] = [
  'General',
  'Radiology Finding',
  'Pathology Update',
  'Action Item',
  'Urgent Handoff',
];

function tagColor(tag: MessageTag): string {
  switch (tag) {
    case 'Urgent Handoff':
      return 'text-rose-700 dark:text-rose-400 font-semibold';
    case 'Radiology Finding':
      return 'text-blue-700 dark:text-sky-400 font-medium';
    case 'Pathology Update':
      return 'text-emerald-700 dark:text-emerald-400 font-medium';
    case 'Action Item':
      return 'text-amber-700 dark:text-amber-400 font-medium';
    default:
      return 'text-slate-500 dark:text-slate-400';
  }
}

export function CaseChatPanel({
  roomId,
  caseId,
  tokenVersion,
  title = 'Secure MDT Clinical Communication',
}: CaseChatPanelProps) {
  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [tag, setTag] = useState<MessageTag>('General');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getMessages(roomId)
      .then((res) => {
        if (active) setMessages(res.messages);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load thread.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [roomId]);

  const { connected, presence } = useBoardSocket(roomId, tokenVersion, {
    onChatMessage: (incoming) => {
      setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
    },
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const { message } = await api.sendMessage({
        roomId,
        caseId,
        tag,
        body: body.trim(),
      });
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      setBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-lg bg-panel border border-hairline flex flex-col h-[520px]">
      {/* Channel Header */}
      <div className="px-4 py-3 border-b border-hairline flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          <h3 className="font-display text-xs font-semibold text-ink">
            {title}
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`}
              aria-hidden="true"
            />
            <span>{connected ? 'Live Socket Connected' : 'Reconnecting'}</span>
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {presence.length || 1} active
          </span>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Loading clinical thread...</p>
        ) : messages.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              No multidisciplinary notes posted in this channel yet.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Share radiology impressions, pathology clarifications, or urgent clinical handoffs below.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className="p-3.5 rounded-md bg-slate-50 dark:bg-slate-900/60 border border-hairline space-y-1.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-ink">
                    {m.senderName}
                  </span>
                  <span className="text-slate-400" aria-hidden="true">·</span>
                  <span className="text-ink-muted">{m.senderSpecialty}</span>
                  <span className="text-slate-400" aria-hidden="true">·</span>
                  <span className={tagColor(m.tag)}>{m.tag}</span>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                {m.body}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-hairline space-y-2">
        {error && (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`msg-tag-${roomId}`} className="sr-only">
            Clinical message category
          </label>
          <select
            id={`msg-tag-${roomId}`}
            value={tag}
            onChange={(e) => setTag(e.target.value as MessageTag)}
            className="px-2.5 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
          >
            {MESSAGE_TAGS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <label htmlFor={`msg-input-${roomId}`} className="sr-only">
            Type clinical message
          </label>
          <input
            id={`msg-input-${roomId}`}
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Post clinical update, @mention specialty, or log handoff..."
            className="flex-1 min-w-[200px] px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink placeholder:text-slate-400"
          />

          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Send</span>
          </button>
        </div>
      </form>
    </div>
  );
}
