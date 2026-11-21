import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

export const CLINICAL_SPRING = {
  type: 'spring' as const,
  stiffness: 460,
  damping: 36,
  mass: 0.75,
};

export const GLIDE_SPRING = {
  type: 'spring' as const,
  stiffness: 520,
  damping: 38,
  mass: 0.7,
};

export const VIEW_TRANSITION = {
  duration: 0.2,
  ease: [0.16, 1, 0.3, 1] as const,
};

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  'data-testid'?: string;
}

/**
 * Smoothly interpolates numeric KPI values using compositor-safe state updates
 * while preserving strict tabular-nums layout stability and respecting reduced motion.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  suffix = '',
  prefix = '',
  className = '',
  'data-testid': testId,
}: AnimatedNumberProps) {
  const prefersReduced = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    if (prefersReduced) {
      prevRef.current = value;
      setDisplayValue(value);
      return;
    }

    const from = prevRef.current;
    const to = value;
    if (from === to) return;

    const durationMs = 380;
    const startTime = performance.now();
    let frameId = 0;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      // Cubic ease-out for crisp settling
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      setDisplayValue(next);
      if (t < 1) {
        frameId = requestAnimationFrame(step);
      } else {
        prevRef.current = to;
        setDisplayValue(to);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frameId);
      prevRef.current = to;
    };
  }, [value, prefersReduced]);

  const formatted =
    decimals > 0
      ? Number(displayValue.toFixed(decimals)).toString()
      : String(Math.round(displayValue));

  return (
    <span data-testid={testId} className={`tabular-nums ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

interface PageTransitionProps {
  viewKey: string;
  children: ReactNode;
}

export function PageTransition({ viewKey, children }: PageTransitionProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={viewKey}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={VIEW_TRANSITION}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

interface SlidingHighlightProps {
  layoutId: string;
  className?: string;
}

export function SlidingHighlight({ layoutId, className = '' }: SlidingHighlightProps) {
  return (
    <motion.span
      layoutId={layoutId}
      transition={GLIDE_SPRING}
      aria-hidden="true"
      className={`absolute inset-0 rounded pointer-events-none ${className}`}
    />
  );
}

interface SpringModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  maxWidthClass?: string;
  children: ReactNode;
}

export function SpringModal({
  open,
  onClose,
  labelledBy,
  maxWidthClass = 'max-w-2xl',
  children,
}: SpringModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={CLINICAL_SPRING}
            className={`w-full ${maxWidthClass} max-h-[90vh] overflow-y-auto rounded-lg bg-panel border border-hairline shadow-2xl`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
