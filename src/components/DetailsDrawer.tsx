import React from 'react';
import {
  CheckCircle2,
  Clock,
  Flag,
  Pause,
  Phone,
  Play,
  Plus,
  Square,
  StopCircle,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { useApp } from '../state/AppState';
import { useChipAction, useJobCard, useMasters } from '../hooks/queries';
import { fmtDateTime, fmtHours, fmtTime } from '../domain/time';
import { Button, cx, ErrorState, Pill, Spinner, StatusBadge } from './ui';

export function DetailsDrawer({
  jobCardId,
  onClose,
}: {
  jobCardId: string;
  onClose: () => void;
}) {
  const app = useApp();
  const jcQ = useJobCard(jobCardId);
  const masters = useMasters(app.divisionId ?? undefined);
  const chipActionMut = useChipAction();
  const data = jcQ.data;

  const handleQuickAction = (chipId: string, action: 'START' | 'RESUME') => {
    chipActionMut.mutate(
      { chipId, action, body: {} },
      {
        onSuccess: () => {
          app.toast({
            tone: 'success',
            title: action === 'START' ? 'Work Started' : 'Work Resumed',
            detail: `${data?.job_card.registration_no} is now active in bay`,
          });
        },
        onError: (err: any) => {
          if (err.issues && err.issues.length > 0) {
            app.showError(err.issues);
          } else {
            app.toast({
              tone: 'error',
              title: `${action} failed`,
              detail: err.message,
            });
          }
        },
      }
    );
  };

  const getBayName = (bayId: string) => {
    return masters.data?.bays.find((b) => b.id === bayId)?.bay_name || bayId;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50">
          <div>
            <span className="font-mono text-xs text-slate-500">{data?.job_card.jc_number}</span>
            <h2 className="text-base font-bold text-slate-900">
              {data?.job_card.registration_no || 'Job Card Details'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto thin-scroll p-5 space-y-5">
          {jcQ.isLoading && <Spinner label="Loading job card…" />}
          {jcQ.isError && <ErrorState message="Could not load details." onRetry={() => jcQ.refetch()} />}

          {data && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vehicle / Model</span>
                  <div className="font-semibold text-xs text-slate-800 mt-0.5">{data.job_card.model}</div>
                  <div className="font-mono text-[10px] text-slate-500">{data.job_card.vin}</div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Promised Delivery</span>
                  <div className={cx('font-bold text-xs mt-0.5', data.job_card.ptd_overdue ? 'text-red-700' : 'text-brand-700')}>
                    {fmtDateTime(data.job_card.ptd)}
                  </div>
                  <div className="text-[10px] text-slate-500">Opened {fmtTime(data.job_card.jc_opened_at)}</div>
                </div>
              </div>

              {/* Customer info */}
              <div className="rounded-lg border border-slate-200 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer</span>
                  <span className="font-medium text-slate-900">{data.job_card.customer_name || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Contact</span>
                  <span className="font-medium text-slate-900">{data.job_card.customer_mobile || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Service Advisor</span>
                  <span className="font-medium text-slate-900">{data.job_card.service_advisor || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Service Type</span>
                  <span className="font-medium text-slate-900">{data.job_card.service_type || '—'}</span>
                </div>
              </div>

              {/* Complaint Codes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Complaints &amp; Jobs ({data.complaints.length})
                  </h3>
                  <Button
                    size="xs"
                    tone="primary"
                    onClick={() => {
                      onClose();
                      app.openCreate({
                        jobCardId: data.job_card.id,
                        bayId: '',
                        startMinutes: 9 * 60 + 30,
                        mode: 'create',
                      });
                    }}
                  >
                    <Plus className="h-3 w-3" /> Schedule Chips
                  </Button>
                </div>

                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {data.complaints.map((cc) => (
                    <div key={cc.id} className="p-3 text-xs bg-white">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">{cc.code}</span>
                          {cc.origin === 'ADDITIONAL' && <Pill className="marker-blink bg-emerald-600 text-white">$</Pill>}
                          {cc.origin === 'REWORK' && <Pill className="bg-red-600 text-white">R</Pill>}
                        </div>
                        <span className={cx('text-[11px] font-bold', cc.is_fully_assigned ? 'text-emerald-700' : 'text-amber-700')}>
                          {cc.is_fully_assigned ? 'Fully Scheduled' : 'Unassigned'}
                        </span>
                      </div>
                      <p className="text-slate-500 mt-0.5">{cc.title}</p>
                      {cc.voc && <p className="text-[11px] italic text-slate-400 mt-1">"{cc.voc}"</p>}

                      <div className="mt-2 space-y-1 pl-2 border-l-2 border-slate-100">
                        {cc.jobs.map((j) => (
                          <div key={j.id} className="flex justify-between text-[11px] text-slate-600">
                            <span>{j.code} · {j.description}</span>
                            <span className="font-mono font-medium">{fmtHours(j.std_hours)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scheduled Bay Chips with Visible Lifecycle Actions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Scheduled Bay Chips ({data.chips.length})
                  </h3>
                  <span className="text-[11px] text-slate-400">Tap action to run</span>
                </div>

                {data.chips.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-400 italic">
                    No chips scheduled yet for this job card.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {data.chips.map((c) => (
                      <div
                        key={c.id}
                        className={cx(
                          'rounded-xl border p-3.5 shadow-xs transition bg-white',
                          c.status === 'IN_PROGRESS' && 'border-sky-300 ring-2 ring-sky-100',
                          c.status === 'ON_HOLD' && 'border-fuchsia-300 bg-fuchsia-50/20',
                          c.status === 'NOT_STARTED' && 'border-slate-200',
                          c.status === 'COMPLETED' && 'border-emerald-200 bg-emerald-50/10'
                        )}
                      >
                        {/* Chip Top Meta */}
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900">
                                {getBayName(c.bay_id)}
                              </span>
                              <StatusBadge status={c.status} />
                            </div>
                            <div className="text-xs font-medium text-slate-600 mt-1 flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-slate-400" />
                              <span>Plan: {fmtTime(c.planned_start)} – {fmtTime(c.planned_end)}</span>
                              {c.actual_start && (
                                <span className="text-slate-400">· Actual: {fmtTime(c.actual_start)}</span>
                              )}
                            </div>
                          </div>

                          <Button
                            size="xs"
                            tone="ghost"
                            onClick={() => app.openActions(c.id)}
                            className="text-[11px] text-slate-500 hover:text-slate-800"
                          >
                            Details &amp; Audit
                          </Button>
                        </div>

                        {c.status === 'ON_HOLD' && c.pause_reason_code && (
                          <div className="mt-2 rounded-md bg-fuchsia-100/80 px-2.5 py-1 text-xs text-fuchsia-900 font-medium">
                            <span className="font-bold">Hold Reason:</span> {c.pause_reason_code}
                            {c.pause_reference && ` · Ref: ${c.pause_reference}`}
                          </div>
                        )}

                        {/* Interactive Lifecycle Action Row */}
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-2">
                          {/* NOT_STARTED: Bright prominent "Start Work" button */}
                          {c.status === 'NOT_STARTED' && (
                            <button
                              onClick={() => handleQuickAction(c.id, 'START')}
                              disabled={chipActionMut.isPending}
                              className="flex-1 flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md transition active:scale-[0.98] cursor-pointer"
                            >
                              <Play className="h-4 w-4 fill-white" />
                              <span>▶ Start Work</span>
                            </button>
                          )}

                          {/* IN_PROGRESS: Pause (magenta) and End / Complete (green) */}
                          {c.status === 'IN_PROGRESS' && (
                            <>
                              <button
                                onClick={() => app.openActions(c.id)}
                                className="flex-1 flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold text-xs shadow-md transition active:scale-[0.98] cursor-pointer"
                              >
                                <Pause className="h-4 w-4" />
                                <span>⏸ Pause</span>
                              </button>
                              <button
                                onClick={() => app.openActions(c.id)}
                                className="flex-1 flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition active:scale-[0.98] cursor-pointer"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                <span>⏹ End / Complete</span>
                              </button>
                            </>
                          )}

                          {/* ON_HOLD: Resume (bright yellow/amber) and End */}
                          {c.status === 'ON_HOLD' && (
                            <>
                              <button
                                onClick={() => handleQuickAction(c.id, 'RESUME')}
                                disabled={chipActionMut.isPending}
                                className="flex-1 flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-lg bg-amber-400 hover:bg-amber-500 text-slate-950 font-extrabold text-xs shadow-md transition active:scale-[0.98] cursor-pointer"
                              >
                                <Play className="h-4 w-4 fill-slate-950" />
                                <span>▶ Resume</span>
                              </button>
                              <button
                                onClick={() => app.openActions(c.id)}
                                className="flex-1 flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition active:scale-[0.98] cursor-pointer"
                              >
                                <Square className="h-4 w-4 fill-white" />
                                <span>⏹ End</span>
                              </button>
                            </>
                          )}

                          {/* COMPLETED */}
                          {c.status === 'COMPLETED' && (
                            <div className="w-full flex items-center justify-between text-xs text-emerald-800 bg-emerald-50 px-3 py-2 rounded-lg">
                              <span className="flex items-center gap-1.5 font-bold">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                Completed in Bay
                              </span>
                              {c.actual_end && (
                                <span className="font-semibold text-slate-500">
                                  Finished at {fmtTime(c.actual_end)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
