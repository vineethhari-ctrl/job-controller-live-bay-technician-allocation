import React, { useState } from 'react';
import { AlertCircle, Clock, Flag, GripVertical, Plus, Sparkles, Wrench } from 'lucide-react';
import { useApp } from '../state/AppState';
import { useDrag } from '../dnd/DragProvider';
import { useUnassignedJobs } from '../hooks/queries';
import { fmtDateTime, fmtHours } from '../domain/time';
import { Button, cx, Pill, Spinner } from './ui';

export function UnassignedSidebar() {
  const app = useApp();
  const drag = useDrag();
  const [filter, setFilter] = useState<'ALL' | 'ADDITIONAL' | 'REWORK' | 'EXPRESS'>('ALL');
  const q = useUnassignedJobs(app.divisionId ?? undefined, app.date);

  const list = q.data || [];
  const filtered = list.filter((item) => {
    if (filter === 'ADDITIONAL') return item.has_additional_pending;
    if (filter === 'REWORK') return item.has_rework_pending;
    return true;
  });

  return (
    <aside className="flex h-full flex-col border-r border-slate-200 bg-slate-50 text-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Unassigned Queue
          </h2>
          <p className="text-[11px] text-slate-400">
            Drag to timeline bay or tap to schedule
          </p>
        </div>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">
          {list.length}
        </span>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-slate-200 bg-slate-100 p-1 text-[11px] font-semibold text-slate-600 gap-1">
        <button
          onClick={() => setFilter('ALL')}
          className={cx(
            'flex-1 rounded py-1 transition cursor-pointer',
            filter === 'ALL' ? 'bg-white font-bold text-slate-900 shadow-xs' : 'hover:text-slate-900'
          )}
        >
          All ({list.length})
        </button>
        <button
          onClick={() => setFilter('ADDITIONAL')}
          className={cx(
            'flex-1 rounded py-1 transition cursor-pointer',
            filter === 'ADDITIONAL' ? 'bg-white font-bold text-slate-900 shadow-xs' : 'hover:text-slate-900'
          )}
        >
          Addl ($)
        </button>
        <button
          onClick={() => setFilter('REWORK')}
          className={cx(
            'flex-1 rounded py-1 transition cursor-pointer',
            filter === 'REWORK' ? 'bg-white font-bold text-slate-900 shadow-xs' : 'hover:text-slate-900'
          )}
        >
          Rework (R)
        </button>
      </div>

      {/* Registration Pills Quick Bar */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-100/60 p-2">
          {filtered.map((item) => {
            const last4 = item.registration_no.slice(-4);
            return (
              <button
                key={item.job_card_id}
                onClick={() => app.openDetails(item.job_card_id)}
                className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-mono font-extrabold text-white shadow-2xs hover:bg-red-700 transition cursor-pointer"
                title={`${item.registration_no} - Click to view details`}
              >
                <span>🚗</span>
                <span>{last4}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Queue items */}
      <div className="flex-1 overflow-y-auto thin-scroll p-2.5 space-y-2">
        {q.isLoading && <Spinner label="Loading queue…" />}
        {!q.isLoading && filtered.length === 0 && (
          <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
            <span>No unassigned job cards in this view</span>
          </div>
        )}
        {filtered.map((item) => (
          <div
            key={item.job_card_id}
            onPointerDown={(e) => {
              // Drag payload
              drag.begin(e, {
                kind: 'jobcard',
                jobCardId: item.job_card_id,
                label: `${item.registration_no} (${item.jc_number})`,
                durationMin: Math.max(30, Math.round(item.unassigned_hours * 60)),
              });
            }}
            className={cx(
              'group relative flex flex-col rounded-lg border bg-white p-2.5 shadow-xs transition hover:border-brand-400 hover:shadow-md cursor-grab active:cursor-grabbing select-none',
              item.ptd_overdue ? 'border-red-300 bg-red-50/20' : 'border-slate-200'
            )}
          >
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <GripVertical className="h-4 w-4 text-slate-300 group-hover:text-slate-500 shrink-0" />
                <span className="font-mono text-xs font-bold text-slate-900 truncate">
                  {item.registration_no}
                </span>
                {item.has_additional_pending && <Pill className="marker-blink bg-emerald-600 text-white">$</Pill>}
                {item.has_rework_pending && <Pill className="bg-red-600 text-white">R</Pill>}
              </div>
              <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                {item.jc_number.replace('JC-2026-', '#')}
              </span>
            </div>

            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600">
              <span className="truncate max-w-[130px] font-medium">{item.model}</span>
              <span className="font-bold text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">
                {fmtHours(item.unassigned_hours)} left
              </span>
            </div>

            <div className="mt-1 flex items-center justify-between text-[10px]">
              <span className={cx('flex items-center gap-0.5 font-semibold', item.ptd_overdue ? 'text-red-700 font-bold' : 'text-slate-500')}>
                <Flag className="h-2.5 w-2.5" /> PTD {fmtDateTime(item.ptd)}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-1 pt-1.5 border-t border-slate-100">
              <Button
                size="xs"
                tone="ghost"
                className="text-[10px] h-6 flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  app.openDetails(item.job_card_id);
                }}
              >
                View Details
              </Button>
              <Button
                size="xs"
                tone="primary"
                className="text-[10px] h-6 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  app.openCreate({
                    jobCardId: item.job_card_id,
                    bayId: '',
                    startMinutes: 9 * 60 + 30,
                    mode: 'create',
                  });
                }}
              >
                <Plus className="h-3 w-3" /> Schedule
              </Button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

