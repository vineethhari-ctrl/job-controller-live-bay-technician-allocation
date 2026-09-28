import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useApp } from '../state/AppState';
import { Button, cx } from './ui';

export function ConfirmDialog() {
  const app = useApp();
  const req = app.confirmReq;
  if (!req) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => req.resolve(false)} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-2xl animate-in zoom-in-95 duration-100">
        <div className="flex items-center gap-2">
          {req.tone === 'danger' ? (
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-brand-600 shrink-0" />
          )}
          <h3 className="text-sm font-bold text-slate-900">{req.title}</h3>
        </div>
        <p className="mt-2 text-xs text-slate-600 leading-relaxed">{req.detail}</p>

        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" tone="ghost" onClick={() => req.resolve(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            tone={req.tone === 'danger' ? 'danger' : 'primary'}
            onClick={() => req.resolve(true)}
          >
            {req.confirmLabel || 'Proceed'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ErrorDialog() {
  const app = useApp();
  const issues = app.errorIssues;
  if (!issues || issues.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => app.showError(null)} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-red-200 bg-white p-4 shadow-2xl animate-in zoom-in-95 duration-100">
        <div className="flex items-start justify-between border-b border-red-100 pb-2.5">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <h3 className="text-sm font-bold">Rule Validation Blocked</h3>
          </div>
          <button
            onClick={() => app.showError(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 space-y-2 max-h-60 overflow-y-auto thin-scroll">
          {issues.map((i, idx) => (
            <div key={idx} className="rounded-lg bg-red-50 p-2.5 text-xs text-red-900 border border-red-100">
              <span className="font-bold">{i.title}: </span>
              <span>{i.detail}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <Button size="sm" tone="default" onClick={() => app.showError(null)}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const app = useApp();

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
      {app.toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            'pointer-events-auto flex items-start gap-2.5 rounded-xl border p-3 shadow-2xl backdrop-blur-md text-xs transition-all animate-in slide-in-from-top-2 duration-150',
            t.tone === 'success' && 'border-emerald-300 bg-emerald-50/95 text-emerald-900',
            t.tone === 'error' && 'border-red-300 bg-red-50/95 text-red-900',
            t.tone === 'warning' && 'border-amber-300 bg-amber-50/95 text-amber-900',
            t.tone === 'info' && 'border-slate-300 bg-white/95 text-slate-800'
          )}
        >
          {t.tone === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />}
          {t.tone === 'error' && <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />}
          {t.tone === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />}
          {t.tone === 'info' && <Info className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />}

          <div className="flex-1">
            <div className="font-bold">{t.title}</div>
            {t.detail && <div className="text-[11px] opacity-80 mt-0.5">{t.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
