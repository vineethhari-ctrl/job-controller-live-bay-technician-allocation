import React from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { WorkStatus } from '../domain/types';

export function cx(...classes: Array<string | boolean | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export const inputCls =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-800 transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-100 disabled:text-slate-400';

export const STATUS_META: Record<
  WorkStatus | 'DELAYED',
  { label: string; chip: string; badge: string; border: string; bg: string }
> = {
  NOT_STARTED: {
    label: 'Not Started',
    chip: 'bg-slate-100 text-slate-800 border-slate-300 border-l-slate-500',
    badge: 'bg-slate-100 text-slate-700 ring-slate-300',
    border: 'border-slate-400',
    bg: 'bg-slate-50',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    chip: 'bg-sky-50 text-sky-900 border-sky-300 border-l-sky-600',
    badge: 'bg-sky-100 text-sky-800 ring-sky-300',
    border: 'border-sky-500',
    bg: 'bg-sky-50',
  },
  ON_HOLD: {
    label: 'On Hold (Paused)',
    chip: 'bg-fuchsia-50 text-fuchsia-900 border-fuchsia-300 border-l-fuchsia-600',
    badge: 'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-300',
    border: 'border-fuchsia-500',
    bg: 'bg-fuchsia-50',
  },
  COMPLETED: {
    label: 'Completed',
    chip: 'bg-emerald-50 text-emerald-900 border-emerald-300 border-l-emerald-600',
    badge: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
    border: 'border-emerald-500',
    bg: 'bg-emerald-50',
  },
  DELAYED: {
    label: 'Delayed',
    chip: 'bg-red-50 text-red-950 border-red-300 border-l-red-600',
    badge: 'bg-red-100 text-red-800 ring-red-300',
    border: 'border-red-500',
    bg: 'bg-red-50',
  },
};

export function Button({
  children,
  tone = 'default',
  size = 'md',
  loading = false,
  disabled = false,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'default' | 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  loading?: boolean;
}) {
  const tones = {
    default: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-xs',
    primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-xs',
    secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 ring-1 ring-slate-300',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-xs',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  };

  const sizes = {
    xs: 'h-6 px-2 text-[11px] rounded',
    sm: 'h-7 px-2.5 text-xs rounded-md gap-1.5',
    md: 'h-8 px-3 text-xs rounded-md gap-1.5',
    lg: 'h-10 px-4 text-sm rounded-lg gap-2',
  };

  return (
    <button
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
        tones[tone],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export function Pill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center justify-center px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded',
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: WorkStatus }) {
  const meta = STATUS_META[status] || STATUS_META.NOT_STARTED;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1',
        meta.badge
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', meta.border.replace('border-', 'bg-'))} />
      {meta.label}
    </span>
  );
}

export function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
      </div>
      {children}
      {error && <span className="text-[10px] font-medium text-red-600">{error}</span>}
    </div>
  );
}

export function Tabs({
  value,
  onChange,
  items,
  className,
}: {
  value: string;
  onChange: (v: any) => void;
  items: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <div className={cx('flex border-b border-slate-200', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            '-mb-px px-4 py-2 text-xs font-bold transition border-b-2',
            value === it.value
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex h-32 w-full flex-col items-center justify-center gap-2 text-slate-500">
      <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-48 w-full flex-col items-center justify-center gap-3 p-4 text-center">
      <div className="rounded-full bg-red-100 p-2 text-red-600">
        <AlertCircle className="h-6 w-6" />
      </div>
      <p className="max-w-md text-xs font-semibold text-slate-700">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  headerExtra,
  width = 'max-w-2xl',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerExtra?: React.ReactNode;
  width?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" onClick={onClose} />
      <div
        className={cx(
          'relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150',
          width
        )}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50/70">
          <div>
            <h2 className="text-sm font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {headerExtra}
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto thin-scroll flex-1">{children}</div>
      </div>
    </div>
  );
}
