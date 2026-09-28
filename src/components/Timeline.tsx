import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleX, Flag, GripVertical } from 'lucide-react';
import type { CalendarView, ChipView } from '../api';
import { ApiError } from '../api';
import { useApp } from '../state/AppState';
import { DragPayload, DropHover, useDrag } from '../dnd/DragProvider';
import { useReschedule } from '../hooks/queries';
import { useNow } from '../hooks/useNow';
import { atMinutes, fmtDateTime, fmtTime, istDate, minutesInDay, minutesToHhmm, toMs } from '../domain/time';
import { BAY_TYPE_LABEL } from '../domain/types';
import { cx, Pill, STATUS_META } from './ui';

export const HOUR_PX = 96;
const PX_PER_MIN = HOUR_PX / 60;
const ROW_H = 108;
const HEADER_H = 32;

export function Timeline({ data, onChipClick }: { data: CalendarView; onChipClick: (chip: ChipView, rect: DOMRect) => void }) {
  const app = useApp();
  const drag = useDrag();
  const reschedule = useReschedule();
  const LABEL_W = typeof window !== 'undefined' && window.innerWidth < 640 ? 132 : 184;
  const now = useNow(30_000);
  const scroller = useRef<HTMLDivElement>(null);
  const win = data.operational_window;
  const readOnly = data.is_past;

  // Initial scroll: 2 h before "now" on today, else to opening time
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = data.is_today ? minutesInDay(Date.now(), data.date) - 120 : (win.is_closed ? 480 : win.open_min - 30);
    el.scrollTo({ left: Math.max(0, target * PX_PER_MIN), behavior: 'auto' });
  }, [data.date, data.division_id]);

  const insideHours = useCallback((startMin: number, endMin: number) =>
    !win.is_closed && startMin >= win.open_min && endMin <= win.close_min, [win]);

  const onDrop = useCallback((p: DragPayload, hover: DropHover) => {
    if (readOnly) { app.toast({ tone: 'info', title: 'Past dates are read-only' }); return; }
    if (p.kind === 'jobcard') {
      if (!insideHours(hover.minutes, hover.minutes + 5)) {
        app.toast({ tone: 'warning', title: 'Non-operational hours', detail: 'Drop the job inside the workshop operating window.' });
        return;
      }
      app.openCreate({ jobCardId: p.jobCardId, bayId: hover.bayId, startMinutes: hover.minutes, mode: 'create' });
      return;
    }
    if (hover.bayId !== p.bayId) {
      app.toast({ tone: 'warning', title: 'Cannot move to another bay', detail: 'A chip can only be moved within the bay it is already in.' });
      return;
    }
    const start = hover.minutes;
    const end = start + p.durationMin;
    if (!insideHours(start, end)) {
      app.toast({ tone: 'warning', title: 'Non-operational hours', detail: 'The chip would fall outside operating hours.' });
      return;
    }
    const body = { planned_start: atMinutes(data.date, start), planned_end: atMinutes(data.date, end) };
    const run = (confirm: boolean) => reschedule.mutate({ chipId: p.chipId, body: { ...body, confirm_ptd_warning: confirm } }, {
      onSuccess: () => app.toast({ tone: 'success', title: 'Chip rescheduled', detail: `${minutesToHhmm(start)} – ${minutesToHhmm(end)}` }),
      onError: (e) => {
        if (e instanceof ApiError && e.requiresConfirmation) {
          app.askConfirm({ title: e.issues[0]?.title ?? 'Confirm', detail: e.issues[0]?.detail ?? '', confirmLabel: 'Proceed' })
            .then((ok) => (ok ? run(true) : app.toast({ tone: 'info', title: 'Reschedule cancelled' })));
          return;
        }
        app.showError(e instanceof ApiError ? e.issues : [{ code: 'ERR', title: 'Reschedule failed', detail: String(e), severity: 'error' }]);
      },
    });
    run(false);
  }, [app, data.date, insideHours, readOnly, reschedule]);

  useEffect(() => { drag.setDropHandler(onDrop); return () => drag.setDropHandler(null); }, [drag, onDrop]);

  const width = 24 * HOUR_PX;
  const nowMin = minutesInDay(now, data.date);
  const showNow = istDate(now) === data.date;
  const hover = drag.active?.hover;

  return (
    <div
      ref={scroller}
      id="timeline-scroller"
      className="thin-scroll relative h-full overflow-auto bg-white touch-pan-x touch-pan-y"
    >
      <div style={{ width: LABEL_W + width }} className="relative select-none">
        {/* hour header */}
        <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-white" style={{ height: HEADER_H }}>
          <div className="sticky left-0 z-10 flex items-center border-r border-slate-200 bg-slate-50 px-3 text-[11px] font-bold uppercase tracking-wide text-slate-500" style={{ width: LABEL_W, minWidth: LABEL_W }}>
            Bays · {data.bays.length}
          </div>
          <div className="relative" style={{ width }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className={cx('absolute top-0 flex h-full items-center border-l pl-1.5 text-[11px] font-semibold',
                !win.is_closed && h * 60 >= win.open_min && h * 60 < win.close_min ? 'border-slate-200 text-slate-600' : 'border-slate-100 text-slate-400')}
                style={{ left: h * HOUR_PX, width: HOUR_PX }}>{String(h).padStart(2, '0')}:00</div>
            ))}
            {showNow && <div className="absolute top-0 z-10 -translate-x-1/2 rounded-b bg-red-600 px-1.5 text-[10px] font-bold leading-4 text-white shadow-xs" style={{ left: nowMin * PX_PER_MIN }}>{fmtTime(now)}</div>}
          </div>
        </div>

        {data.bays.map((bay) => (
          <div key={bay.bay_id} id={`bay-row-${bay.bay_id}`} className="flex border-b border-slate-200" style={{ height: ROW_H }}>
            <div className={cx('sticky left-0 z-10 flex flex-col justify-center gap-1 border-r border-slate-200 px-3', bay.delayed_count ? 'bg-red-50' : 'bg-slate-50')} style={{ width: LABEL_W, minWidth: LABEL_W }}>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-slate-900">{bay.bay_name}</span>
                {bay.delayed_count > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{bay.delayed_count}</span>}
              </div>
              <span className="w-fit rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">{BAY_TYPE_LABEL[bay.bay_type]}</span>
              <div className="flex flex-col gap-0.5">
                {bay.technicians.length === 0 && <span className="text-[11px] italic text-slate-400">Technician per chip</span>}
                {bay.technicians.map((t) => (
                  <span key={t.technician_id} className="flex items-center gap-1 truncate text-[11px] text-slate-600" title={t.status}>
                    {t.status === 'ABSENT' ? <CircleX className="h-3 w-3 text-slate-400" /> : <span className={cx('h-2 w-2 rounded-full', t.status === 'BUSY' ? 'bg-red-500' : 'bg-emerald-500')} />}
                    <span className={cx('truncate', t.status === 'ABSENT' && 'text-slate-400 line-through')}>{t.name}</span>
                  </span>
                ))}
              </div>
            </div>
            <div data-bay-row data-bay-id={bay.bay_id} className="relative"
              style={{
                width,
                backgroundImage: `repeating-linear-gradient(90deg, #e2e8f0 0 1px, transparent 1px ${HOUR_PX / 2}px, #f1f5f9 ${HOUR_PX / 2}px ${HOUR_PX / 2 + 1}px, transparent ${HOUR_PX / 2 + 1}px ${HOUR_PX}px)`,
              }}>
              {data.non_operational_bands.map(([a, b]) => (
                <div key={a} className="nonop-band absolute inset-y-0" style={{ left: a * PX_PER_MIN, width: (b - a) * PX_PER_MIN }} title="Non-operational hours" />
              ))}
              {hover?.bayId === bay.bay_id && drag.active && (
                <div className="pointer-events-none absolute inset-y-1 z-10 rounded-md border-2 border-dashed border-brand-500 bg-brand-500/10"
                  style={{ left: hover.minutes * PX_PER_MIN, width: (drag.active.payload.kind === 'chip' ? drag.active.payload.durationMin : 60) * PX_PER_MIN }} />
              )}
              {bay.job_chips.map((c) => (
                <ChipTile key={c.job_chip_id} chip={c} date={data.date} now={now} readOnly={readOnly} onClick={onChipClick} />
              ))}
            </div>
          </div>
        ))}

        {showNow && (
          <div className="pointer-events-none absolute bottom-0 z-[15] w-0.5 bg-red-600 shadow-[0_0_0_1px_rgba(255,255,255,.6)]"
            style={{ left: LABEL_W + nowMin * PX_PER_MIN, top: HEADER_H }} aria-label="Current time" />
        )}
      </div>
    </div>
  );
}

function ChipTile({
  chip,
  date,
  now,
  readOnly,
  onClick,
}: {
  chip: ChipView;
  date: string;
  now: number;
  readOnly: boolean;
  onClick: (c: ChipView, r: DOMRect) => void;
}) {
  const app = useApp();
  const drag = useDrag();
  const ref = useRef<HTMLDivElement>(null);
  const ps = minutesInDay(chip.planned_start, date);
  const pe = minutesInDay(chip.planned_end, date);
  const as = chip.actual_start ? minutesInDay(chip.actual_start, date) : null;

  // Visual extent: paused chips shrink to time actually worked; overruns render hatched
  const geometry = useMemo(() => {
    let solidStart = ps;
    let solidEnd = pe;
    let hatchEnd: number | null = null;
    if (chip.status === 'ON_HOLD' && as !== null && chip.paused_at) {
      solidStart = Math.min(as, ps);
      solidEnd = Math.max(minutesInDay(chip.paused_at, date), solidStart + 6);
    } else if (chip.status === 'COMPLETED' && chip.actual_end && toMs(chip.actual_end) > toMs(chip.planned_end)) {
      hatchEnd = minutesInDay(chip.actual_end, date);
    } else if (chip.status === 'IN_PROGRESS' && now > toMs(chip.planned_end)) {
      hatchEnd = minutesInDay(now, date);
    }
    return { solidStart, solidEnd, hatchEnd };
  }, [chip, ps, pe, as, date, now]);

  const rawWidth = (geometry.solidEnd - geometry.solidStart) * PX_PER_MIN;
  // Ensure visual width is reasonable, but interactive touch targets meet min 44px
  const w = Math.max(rawWidth, 12);
  const meta = STATUS_META[chip.is_delayed ? 'DELAYED' : chip.status];
  const draggable = !readOnly && chip.status === 'NOT_STARTED' && app.role !== 'TECHNICIAN';
  const compact = rawWidth < 150;
  const tiny = rawWidth < 70;

  const click = () => {
    if (ref.current) {
      onClick(chip, ref.current.getBoundingClientRect());
    }
  };

  const startDrag = (e: React.PointerEvent) => {
    if (!draggable) return;
    const rect = ref.current?.getBoundingClientRect();
    const grabOffsetMin = rect ? (e.clientX - rect.left) / PX_PER_MIN : 0;
    drag.begin(
      e,
      {
        kind: 'chip',
        chipId: chip.job_chip_id,
        bayId: chip.bay_id,
        durationMin: pe - ps,
        grabOffsetMin,
        label: `${chip.registration_no} → move`,
      },
      click
    );
  };

  return (
    <>
      {chip.status === 'ON_HOLD' && (
        <div
          className="pointer-events-none absolute inset-y-1.5 rounded-lg border border-dashed border-fuchsia-300"
          style={{ left: ps * PX_PER_MIN, width: (pe - ps) * PX_PER_MIN }}
          title="Original plan (slot released on pause)"
        />
      )}
      {geometry.hatchEnd !== null && (
        <div
          className="hatch-overrun pointer-events-none absolute inset-y-1.5 rounded-r-lg border border-l-0 border-red-300"
          style={{ left: pe * PX_PER_MIN, width: Math.max(0, geometry.hatchEnd - pe) * PX_PER_MIN }}
          title="Overrun beyond planned end"
        />
      )}

      {/* Chip Box */}
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label={`${chip.registration_no} ${meta.label}`}
        onKeyDown={(e) => { if (e.key === 'Enter') click(); }}
        onClick={click}
        // Min 44px touch hit box on tablets with before pseudo-element
        className={cx(
          'absolute inset-y-1.5 z-[5] overflow-visible rounded-lg border-l-4 border px-1.5 py-1 text-left shadow-xs transition hover:z-[7] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer',
          meta.chip,
          // Expanded hit-box for tablets/touch (ensures min 44px width/height hit-area even on tiny chips)
          'before:absolute before:-inset-y-2 before:-inset-x-3 before:min-w-[44px] before:min-h-[44px] before:content-[\'\'] before:z-0',
          drag.active?.payload.kind === 'chip' && drag.active.payload.chipId === chip.job_chip_id && 'opacity-40'
        )}
        style={{
          left: geometry.solidStart * PX_PER_MIN,
          width: w,
          minWidth: 16,
          // Allow clean horizontal/vertical scrolling across timeline while touching the chip body
          touchAction: 'pan-x pan-y',
        }}
      >
        <div className="relative z-10 flex h-full items-center justify-between w-full overflow-hidden">
          {!tiny ? (
            <div className="flex h-full flex-col justify-between text-[10.5px] leading-tight min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1">
                {draggable && (
                  <span
                    role="button"
                    title="Drag to reschedule"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      startDrag(e);
                    }}
                    className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 text-slate-400 hover:text-slate-700 shrink-0 touch-none"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                )}
                {chip.tags.revisit && <Pill className="bg-indigo-600 text-white">RV</Pill>}
                {chip.tags.repeat_complaint && <Pill className="bg-orange-500 text-white">RC</Pill>}
                {chip.tags.additional_blink && <Pill className="marker-blink bg-emerald-600 text-white">$</Pill>}
                {(chip.tags.rework_blink || chip.tags.rework_chip) && <Pill className={cx('bg-red-600 text-white', chip.tags.rework_blink && 'marker-blink')}>R</Pill>}
                <span className="truncate font-mono text-[11px] font-bold">{chip.registration_no}</span>
                {!compact && <span className="truncate text-[10px] opacity-70">· {chip.jc_short}</span>}
              </div>
              {!compact && <div className="truncate opacity-80">{chip.model} | {chip.service_advisor}</div>}
              <div className="truncate">
                <span className="font-semibold">{fmtTime(chip.planned_start)}–{fmtTime(chip.planned_end)}</span>
                {!compact && <span className="opacity-80"> | <span className={cx(chip.is_late_start && 'font-bold text-red-700')}>{fmtTime(chip.actual_start)}</span>–{fmtTime(chip.actual_end)}</span>}
              </div>
              {!compact && <div className="truncate opacity-80">{chip.service_type}{chip.status === 'ON_HOLD' && ' · Paused'}</div>}
              <div className="flex items-center gap-1">
                <span className="inline-flex items-center gap-0.5 truncate rounded bg-white/70 px-1 text-[9.5px] font-bold text-slate-700 ring-1 ring-black/5">
                  <Flag className="h-2.5 w-2.5" />PTD {compact ? fmtTime(chip.ptd) : fmtDateTime(chip.ptd)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {draggable && (
                <span
                  role="button"
                  title="Drag to reschedule"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    startDrag(e);
                  }}
                  className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-800 touch-none"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
