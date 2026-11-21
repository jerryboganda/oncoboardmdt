import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import { getOrganBoardTheme, type BoardColorKey } from '../lib/organPalette';
import { CLINICAL_SPRING } from './MotionPrimitives';

export type ToastVariant = 'success' | 'info' | 'warning';

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  organBoard?: BoardColorKey;
  durationMs?: number;
}

interface ToastItem extends Required<Pick<ToastInput, 'title' | 'variant' | 'durationMs'>> {
  id: string;
  description?: string;
  organBoard?: BoardColorKey;
}

interface ToastContextValue {
  pushToast: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue>({
  pushToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (input: ToastInput) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const item: ToastItem = {
        id,
        title: input.title,
        description: input.description,
        variant: input.variant ?? 'success',
        organBoard: input.organBoard,
        durationMs: input.durationMs ?? 4200,
      };
      setToasts((prev) => [...prev.slice(-2), item]);
      window.setTimeout(() => {
        dismiss(id);
      }, item.durationMs);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div
        aria-live="polite"
        aria-label="Clinical workflow notifications"
        className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2.5 w-[calc(100vw-2rem)] max-w-sm pointer-events-none no-print"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const boardTheme = toast.organBoard ? getOrganBoardTheme(toast.organBoard) : null;
            const Icon =
              toast.variant === 'warning'
                ? AlertTriangle
                : toast.variant === 'info'
                  ? Info
                  : CheckCircle2;

            const iconColor =
              toast.variant === 'warning'
                ? 'text-amber-600 dark:text-amber-400'
                : toast.variant === 'info'
                  ? 'text-sky-600 dark:text-sky-400'
                  : 'text-emerald-600 dark:text-emerald-400';

            const progressBarClass = boardTheme
              ? boardTheme.swatchClass
              : toast.variant === 'warning'
                ? 'bg-amber-500'
                : toast.variant === 'info'
                  ? 'bg-sky-500'
                  : 'bg-emerald-500';

            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.96 }}
                transition={CLINICAL_SPRING}
                data-testid="clinical-toast"
                className="pointer-events-auto relative overflow-hidden rounded-lg bg-panel border border-slate-200 dark:border-slate-700 shadow-lg"
              >
                <div className="p-3.5 flex items-start gap-2.5">
                  <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${iconColor}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      {boardTheme && (
                        <span
                          className={`inline-block h-2 w-2 rounded-xs shrink-0 ${boardTheme.swatchClass}`}
                          aria-hidden="true"
                        />
                      )}
                      <p className="text-xs font-semibold text-ink leading-snug">
                        {toast.title}
                      </p>
                    </div>
                    {toast.description && (
                      <p className="text-[11px] text-ink-muted leading-relaxed">
                        {toast.description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(toast.id)}
                    aria-label="Dismiss notification"
                    className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <motion.div
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: toast.durationMs / 1000, ease: 'linear' }}
                  style={{ transformOrigin: 'left center' }}
                  className={`h-0.5 w-full ${progressBarClass} opacity-75`}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
