import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, FileText, Image, Layers, Mic, RotateCcw, Trash2, Video } from 'lucide-react';
import { api, ApiError } from '../api';
import type { JobCardDetailsView } from '../api';
import { useApp, CreateChipIntent } from '../state/AppState';
import { useBaySequence, useCreateChips, useJobCard, useMasters } from '../hooks/queries';
import { hoursForLines } from '../domain/rules';
import { atMinutes, fmtDateLabel, fmtDateTime, fmtHours, fmtTime, hhmmToMinutes, minutesInDay, minutesToHhmm, toMs } from '../domain/time';
import { BAY_TYPE_LABEL, BayType, ChipDraft, ChipDraftLine, JobCard, RuleIssue } from '../domain/types';
import { Button, cx, ErrorState, Field, inputCls, Modal, Pill, Spinner, StatusBadge, Tabs } from './ui';

interface LineState { checked: boolean; jobIds: string[]; road_test: boolean; det_id: string }
interface Staged { draft: ChipDraft; confirmed: boolean; bayName: string; hours: number }

export function CreateChipModal({ intent }: { intent: CreateChipIntent }) {
  const app = useApp();
  const jcQ = useJobCard(intent.jobCardId);
  const masters = useMasters(app.divisionId ?? undefined);
  const [tab, setTab] = useState<'chip' | 'jc'>('chip');
  const [staged, setStaged] = useState<Staged[]>([]);

  const close = async () => {
    if (staged.length && !(await app.askConfirm({ title: 'Discard staged chips?', detail: `${staged.length} chip(s) built with Assign Bay have not been submitted and will be lost.`, confirmLabel: 'Discard', tone: 'danger' }))) return;
    app.closeCreate();
  };

  const d = jcQ.data;
  return (
    <Modal
      open
      onClose={close}
      width="max-w-5xl"
      title={<span className="flex items-center gap-2">{intent.mode === 'edit' ? 'Edit Job Chip' : 'Create Job Chip'} {d && <span className="font-mono text-sm text-slate-500">· {d.job_card.jc_number} · {d.job_card.registration_no}</span>}</span>}
      subtitle={<>Scheduling for <b>{fmtDateLabel(app.date)}</b>{app.isFuture && ' (future — Start/Pause/End unlock on the day)'}</>}
      headerExtra={d && <span className={cx('rounded-lg px-2.5 py-1 text-xs font-bold', d.job_card.ptd_overdue ? 'bg-red-100 text-red-700' : 'bg-brand-50 text-brand-700')}>PTD {fmtDateTime(d.job_card.ptd)}</span>}
    >
      {(jcQ.isLoading || masters.isLoading) && <Spinner label="Loading job card" />}
      {(jcQ.isError || masters.isError) && <ErrorState message="Could not load the job card." onRetry={() => { jcQ.refetch(); masters.refetch(); }} />}
      {d && masters.data && (
        <>
          <div className="border-b border-slate-200 px-5 pt-3">
            <Tabs value={tab} onChange={setTab} className="max-w-sm" items={[{ value: 'chip', label: 'Chip Details' }, { value: 'jc', label: 'Job Card Details' }]} />
          </div>
          {tab === 'chip'
            ? <ChipForm intent={intent} details={d} staged={staged} setStaged={setStaged} onDone={() => app.closeCreate()} />
            : <JobCardSummary d={d} />}
        </>
      )}
    </Modal>
  );
}

function ChipForm({ intent, details, staged, setStaged, onDone }: {
  intent: CreateChipIntent; details: JobCardDetailsView; staged: Staged[]; setStaged: React.Dispatch<React.SetStateAction<Staged[]>>; onDone: () => void;
}) {
  const app = useApp();
  const masters = useMasters(app.divisionId ?? undefined).data!;
  const create = useCreateChips();
  const jc = details.job_card as unknown as JobCard;
  const initialBay = masters.bays.find((b) => b.id === intent.bayId);

  const [bayType, setBayType] = useState<BayType | ''>(initialBay?.bay_type ?? '');
  const [bayId, setBayId] = useState(initialBay?.id ?? '');
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [from, setFrom] = useState<number | null>(intent.startMinutes ?? null);
  const [fromTouched, setFromTouched] = useState(intent.startMinutes != null);
  const [to, setTo] = useState<number | null>(null);
  const [toTouched, setToTouched] = useState(false);
  const [tsId, setTsId] = useState('');
  const [tsTouched, setTsTouched] = useState(false);
  const [qiId, setQiId] = useState('');
  const [techId, setTechId] = useState('');
  const [washing, setWashing] = useState(details.job_card.washing_required);
  const [prewash, setPrewash] = useState(details.job_card.prewash_done);
  const [issues, setIssues] = useState<RuleIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const bay = masters.bays.find((b) => b.id === bayId);
  const isGeneral = bay?.bay_type === 'GENERAL';
  const isVirtual = bay?.bay_type === 'VIRTUAL';
  const bayTypes = [...new Set(masters.bays.map((b) => b.bay_type))];

  // jobs already covered
  const stagedJobs = useMemo(() => {
    const set = new Set<string>();
    staged.forEach((s) => s.draft.lines.forEach((l) => {
      const cc = details.complaints.find((c) => c.id === l.job_card_complaint_id);
      (l.job_card_job_ids?.length ? l.job_card_job_ids : cc?.jobs.map((j) => j.id) ?? []).forEach((id) => set.add(id));
    }));
    return set;
  }, [staged, details]);

  const openJobs = (ccId: string) => {
    const cc = details.complaints.find((c) => c.id === ccId)!;
    return cc.jobs.filter((j) => !cc.assigned_job_ids.includes(j.id) && !stagedJobs.has(j.id));
  };

  const draftLines: ChipDraftLine[] = Object.entries(lines).filter(([, v]) => v.checked && v.jobIds.length).map(([id, v]) => {
    const open = openJobs(id);
    const cc = details.complaints.find((c) => c.id === id)!;
    const all = v.jobIds.length === cc.jobs.length;
    return { job_card_complaint_id: id, job_card_job_ids: all ? null : v.jobIds.filter((j) => open.some((o) => o.id === j)), road_test: v.road_test, det_id: v.det_id || null };
  });

  const totalHours = hoursForLines(jc, draftLines);
  const totalMin = Math.round(totalHours * 60);
  const seq = useBaySequence(bayId || undefined, app.date, Math.max(5, totalMin || 60));

  useEffect(() => { if (!tsTouched) setTsId(bay?.supervisor_id ?? ''); }, [bay, tsTouched]);

  useEffect(() => {
    if (fromTouched || !seq.data || seq.data.bay_id !== bayId) return;
    let s = seq.data.suggested_start_minutes;
    if (s !== null) {
      const dur = Math.max(5, Math.ceil((totalMin || 60) / 5) * 5);
      const busy: Array<[number, number]> = [
        ...staged.map((x) => [minutesInDay(x.draft.planned_start, app.date), minutesInDay(x.draft.planned_end, app.date)] as [number, number]),
        ...details.chips.filter((c) => !c.is_cancelled && c.chip_date === app.date && c.status !== 'COMPLETED')
          .map((c) => [minutesInDay(c.planned_start, app.date), minutesInDay(c.planned_end, app.date)] as [number, number]),
        ...(seq.data.chips.map((c) => [minutesInDay(c.planned_start, app.date), minutesInDay(c.planned_end, app.date)] as [number, number])),
      ].sort((a, b) => a[0] - b[0]);
      for (const [a, b] of busy) if (s < b && a < s + dur) s = Math.ceil(b / 5) * 5;
      if (s + dur > seq.data.operational_window.close_min) s = null;
    }
    setFrom(s);
  }, [seq.data, bayId, fromTouched, staged, app.date, details.chips, totalMin]);

  useEffect(() => {
    if (toTouched || from === null) return;
    setTo(totalMin ? Math.min(1440, from + Math.ceil(totalMin / 5) * 5) : null);
  }, [from, totalMin, toTouched]);

  const toggleComplaint = (id: string, checked: boolean) => {
    const open = openJobs(id).map((j) => j.id);
    setLines((l) => ({ ...l, [id]: { road_test: l[id]?.road_test ?? false, det_id: l[id]?.det_id ?? '', checked, jobIds: checked ? open : [] } }));
    setIssues([]);
  };

  const toggleJob = (ccId: string, jobId: string, checked: boolean) => {
    setLines((l) => {
      const cur = l[ccId] ?? { checked: false, jobIds: [], road_test: false, det_id: '' };
      const jobIds = checked ? [...cur.jobIds, jobId] : cur.jobIds.filter((x) => x !== jobId);
      return { ...l, [ccId]: { ...cur, jobIds, checked: jobIds.length > 0 } };
    });
  };

  const setLine = (id: string, patch: Partial<LineState>) => setLines((l) => ({ ...l, [id]: { ...(l[id] ?? { checked: false, jobIds: [], road_test: false, det_id: '' }), ...patch } }));

  const reset = () => { setLines({}); setTsTouched(false); setTsId(bay?.supervisor_id ?? ''); setQiId(''); setTechId(''); setIssues([]); setToTouched(false); };

  const buildDraft = (): ChipDraft | null => {
    if (!bayId || from === null || to === null) return null;
    return {
      job_card_id: details.job_card.id, bay_id: bayId,
      planned_start: atMinutes(app.date, from), planned_end: atMinutes(app.date, to),
      lines: draftLines, tech_supervisor_id: tsId || null, quality_inspector_id: qiId || null, technician_id: isVirtual ? techId || null : null,
    };
  };

  const assignBay = async () => {
    const draft = buildDraft();
    if (!draft) { setIssues([{ code: 'INCOMPLETE', title: 'Incomplete', detail: 'Select complaint codes, Bay Type, Bay Name and a time slot.', severity: 'error' }]); return; }
    if (!draft.lines.length) { app.showError([{ code: 'NO_COMPLAINTS', title: 'Select complaint codes', detail: 'Check at least one complaint code to build a chip.', severity: 'error' }]); return; }
    setBusy(true);
    try {
      const res = await api.validateDrafts([...staged.map((s) => s.draft), draft]);
      const mine = res.errors.filter((e) => e.draft_index === staged.length || e.draft_index === undefined);
      if (!res.is_valid) { setIssues(mine.length ? mine : res.errors); app.showError(mine.length ? mine : res.errors); return; }
      const w = res.warnings.filter((x) => x.draft_index === staged.length);
      let confirmed = false;
      if (w.length) {
        confirmed = await app.askConfirm({ title: w[0].title, detail: w[0].detail, confirmLabel: 'Proceed' });
        if (!confirmed) return;
      }
      setStaged((s) => [...s, { draft, confirmed, bayName: bay?.bay_name ?? '', hours: totalHours }]);
      setIssues([]);
      setLines({});
      setQiId('');
      setFromTouched(false); setToTouched(false);
      app.toast({ tone: 'info', title: 'Chip staged', detail: `${bay?.bay_name} ${minutesToHhmm(from!)}–${minutesToHhmm(to!)} · Submit to commit` });
    } catch (e: any) {
      app.showError(e instanceof ApiError ? e.issues : [{ code: 'ERR', title: 'Validation failed', detail: String(e), severity: 'error' }]);
    } finally { setBusy(false); }
  };

  const submit = (confirmAll = false) => {
    create.mutate({
      chips: staged.map((s) => s.draft), confirm_ptd_warning: confirmAll || staged.some((s) => s.confirmed),
      washing_required: washing, prewash_done: prewash,
    }, {
      onSuccess: (r: any) => {
        app.toast({ tone: 'success', title: `${r.job_chips.length} chip(s) scheduled`, detail: r.job_card.assignment_status === 'FULLY_ASSIGNED' ? 'All complaint codes assigned — removed from Unassigned.' : 'Job card stays in Unassigned until every complaint code has a bay.' });
        onDone();
      },
      onError: async (e: any) => {
        if (e instanceof ApiError && e.requiresConfirmation) {
          if (await app.askConfirm({ title: e.issues[0].title, detail: e.issues[0].detail, confirmLabel: 'Proceed' })) submit(true);
          return;
        }
        app.showError(e instanceof ApiError ? e.issues : [{ code: 'ERR', title: 'Submit failed', detail: String(e), severity: 'error' }]);
      },
    });
  };

  const win = seq.data?.operational_window;
  const ptdMin = minutesInDay(details.job_card.ptd, app.date);
  const reworkCycle = details.job_card.rework_cycle;

  return (
    <div className="grid gap-0 lg:grid-cols-[1.25fr_1fr]">
      {/* Complaint codes section */}
      <div className="border-slate-200 p-4 lg:border-r">
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={washing} onChange={(e) => setWashing(e.target.checked)} />
            Washing Required
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={prewash} onChange={(e) => setPrewash(e.target.checked)} />
            Pre-Wash Done
          </label>
          <div className="flex min-w-[12rem] flex-1 items-center gap-1.5 text-xs">
            <span className="font-semibold text-slate-500">Special Request</span>
            <input readOnly value={details.job_card.special_request ?? ''} className="h-7 flex-1 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700" aria-label="Special request (read-only)" />
          </div>
        </div>

        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Complaint Codes</h3>
          {isGeneral && <span className="flex items-center gap-1 text-[11px] font-semibold text-brand-700"><Layers className="h-3.5 w-3.5" />General Bay: pick individual job codes</span>}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          {details.complaints.filter((c) => !c.is_dropped).map((cc, idx, arr) => {
            const open = openJobs(cc.id);
            const assigned = open.length === 0;
            const isStaged = assigned && !cc.is_fully_assigned;
            const st = lines[cc.id];
            const firstRework = cc.origin === 'REWORK' && arr.findIndex((x) => x.origin === 'REWORK') === idx;
            return (
              <div key={cc.id} className={cx('border-b border-slate-100 last:border-0', assigned && 'bg-slate-50')}>
                {firstRework && <div className="flex items-center gap-2 bg-red-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-red-700">Rework <span className="rounded bg-red-600 px-1.5 text-white">Cycle {reworkCycle}</span></div>}
                <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <input type="checkbox" aria-label={`Select ${cc.code}`} className="h-4 w-4 accent-brand-600" disabled={assigned} checked={!!st?.checked} onChange={(e) => toggleComplaint(cc.id, e.target.checked)} />
                  <button className="text-slate-400" onClick={() => setExpanded((x) => ({ ...x, [cc.id]: !x[cc.id] }))} aria-label="Toggle job codes">
                    {expanded[cc.id] || (isGeneral && !assigned) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-900">{cc.code}</span>
                      {cc.origin === 'ADDITIONAL' && <Pill className="marker-blink bg-emerald-600 text-white">$</Pill>}
                      {cc.origin === 'REWORK' && <Pill className="bg-red-600 text-white">R</Pill>}
                      {cc.complaint_type !== 'STANDARD' && <Pill className="bg-violet-100 text-violet-700">{cc.complaint_type}</Pill>}
                      <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-bold text-slate-600">{cc.jobs.length} job{cc.jobs.length !== 1 && 's'}</span>
                    </div>
                    <div className="truncate text-xs text-slate-500">{cc.title}{cc.voc && ` — ${cc.voc}`}</div>
                    {cc.origin === 'REWORK' && (
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                        Prev: <b>{cc.previous_bay ?? '—'}</b> · {cc.previous_technician ?? '—'}
                        <span className="flex gap-1 text-slate-400" title="QI attachments"><Image className="h-3.5 w-3.5" /><Video className="h-3.5 w-3.5" /><Mic className="h-3.5 w-3.5" /><FileText className="h-3.5 w-3.5" /></span>
                      </div>
                    )}
                  </div>
                  {assigned ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check className="h-4 w-4" />{isStaged ? 'Staged' : 'Assigned'}</span>
                  ) : (
                    <>
                      <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600" title="Push this complaint to the QI Road Test section">
                        <input type="checkbox" className="h-3.5 w-3.5 accent-brand-600" checked={!!st?.road_test} onChange={(e) => setLine(cc.id, { road_test: e.target.checked })} />Road Test
                      </label>
                      <select aria-label="DET" className="h-8 w-32 rounded-md border border-slate-300 bg-white px-1.5 text-xs" value={st?.det_id ?? ''} onChange={(e) => setLine(cc.id, { det_id: e.target.value })}>
                        <option value="">DET —</option>
                        {masters.dets.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
                      </select>
                    </>
                  )}
                </div>
                {(expanded[cc.id] || (isGeneral && !assigned)) && (
                  <div className="space-y-0.5 pb-2 pl-12 pr-3">
                    {cc.jobs.map((j) => {
                      const jobOpen = open.some((o) => o.id === j.id);
                      return (
                        <label key={j.id} className={cx('flex items-center gap-2 text-xs', !jobOpen && 'text-slate-400')}>
                          {isGeneral && <input type="checkbox" className="h-3.5 w-3.5 accent-brand-600" disabled={!jobOpen} checked={!!st?.jobIds.includes(j.id)} onChange={(e) => toggleJob(cc.id, j.id, e.target.checked)} />}
                          <span className="font-mono">{j.code}</span><span className="flex-1 truncate">{j.description}</span><span className="font-semibold">{fmtHours(j.std_hours)}</span>
                          {!jobOpen && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {staged.length > 0 && (
          <div className="mt-3">
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Staged chips ({staged.length}) — not saved until Submit</h3>
            <div className="space-y-1.5">
              {staged.map((s, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-dashed border-brand-500 bg-brand-50 px-3 py-1.5 text-xs">
                  <b>{s.bayName}</b><span>{fmtTime(s.draft.planned_start)}–{fmtTime(s.draft.planned_end)}</span>
                  <span className="text-slate-500">{s.draft.lines.map((l) => details.complaints.find((c) => c.id === l.job_card_complaint_id)?.code).join(', ')}</span>
                  <span className="ml-auto font-semibold">{fmtHours(s.hours)}</span>
                  <button className="rounded p-1 text-slate-500 hover:bg-white cursor-pointer" onClick={() => setStaged((x) => x.filter((_, k) => k !== i))} aria-label="Remove staged chip"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bay + Time assignment section */}
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bay Type" required>
            <select className={inputCls} value={bayType} onChange={(e) => { setBayType(e.target.value as BayType); setBayId(''); setFromTouched(false); }}>
              <option value="">Select…</option>
              {bayTypes.map((t) => <option key={t} value={t}>{BAY_TYPE_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Bay Name" required>
            <select className={inputCls} value={bayId} disabled={!bayType} onChange={(e) => { setBayId(e.target.value); setFromTouched(false); }}>
              <option value="">Select…</option>
              {masters.bays.filter((b) => b.bay_type === bayType).map((b) => <option key={b.id} value={b.id}>{b.bay_name}</option>)}
            </select>
          </Field>
          <Field label="From" required hint={!fromTouched && from !== null ? 'Next free slot' : bayId && seq.data && seq.data.suggested_start_minutes === null && !fromTouched ? 'No free slot left on this date for this duration' : undefined}>
            <input type="time" step={300} className={inputCls} value={from === null ? '' : minutesToHhmm(from)} onChange={(e) => { setFromTouched(true); setFrom(e.target.value ? hhmmToMinutes(e.target.value) : null); }} />
          </Field>
          <Field label="To" required hint={toTouched ? 'Manually adjusted' : 'From + total chip time'}>
            <input type="time" step={300} className={inputCls} value={to === null ? '' : minutesToHhmm(to)} onChange={(e) => { setToTouched(true); setTo(e.target.value ? hhmmToMinutes(e.target.value) : null); }} />
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2">
          <span className="text-xs font-semibold text-brand-900">Total Chip Time (std labour hours)</span>
          <span className="text-base font-bold text-brand-700">{fmtHours(totalHours)}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Technician Supervisor" required>
            <select className={inputCls} value={tsId} onChange={(e) => { setTsTouched(true); setTsId(e.target.value); }}>
              <option value="">Select…</option>
              {masters.techSupervisors.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
            </select>
          </Field>
          <Field label="Assign QI" required>
            <select className={inputCls} value={qiId} onChange={(e) => setQiId(e.target.value)}>
              <option value="">Select…</option>
              {masters.qualityInspectors.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
            </select>
          </Field>
          {isVirtual && (
            <Field label="Technician (Virtual Bay)" required>
              <select className={inputCls} value={techId} onChange={(e) => setTechId(e.target.value)}>
                <option value="">Select…</option>
                {masters.technicians.map((x) => <option key={x.id} value={x.id}>{x.full_name}{x.is_logged_in === false ? ' (absent)' : ''}</option>)}
              </select>
            </Field>
          )}
        </div>
        {bay && !isVirtual && <div className="text-[11px] text-slate-500">Bay technicians: {bay.technicians.map((t) => t.name).join(', ') || '—'}</div>}

        {/* Live Bay Preview */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Live bay preview {bay && `· ${bay.bay_name}`}</h3>
            {win && !win.is_closed && <span className="text-[10px] text-slate-400">{minutesToHhmm(win.open_min)}–{minutesToHhmm(win.close_min)}</span>}
          </div>
          {bay && win ? (
            <BayPreview win={win} chips={seq.data?.chips ?? []} staged={staged.filter((s) => s.draft.bay_id === bayId).map((s) => [minutesInDay(s.draft.planned_start, app.date), minutesInDay(s.draft.planned_end, app.date)])}
              draft={from !== null && to !== null ? [from, to] : null} date={app.date} ptdMin={ptdMin} />
          ) : <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">Select a bay to preview its schedule</div>}
        </div>

        {issues.length > 0 && (
          <div className="space-y-1 rounded-lg bg-red-50 p-2.5">
            {issues.map((i, k) => <div key={k} className="text-xs text-red-700"><b>{i.title}.</b> {i.detail}</div>)}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
          <Button onClick={reset}><RotateCcw className="h-4 w-4" />Reset</Button>
          <Button tone="secondary" className="ring-brand-500 text-brand-700" loading={busy} onClick={assignBay}>Assign Bay</Button>
          <Button tone="primary" className="ml-auto" disabled={!staged.length} loading={create.isPending} onClick={() => submit()}>Submit {staged.length > 0 && `(${staged.length})`}</Button>
        </div>
        <p className="text-[11px] text-slate-500">Steps: select complaint codes → Bay Type → Bay Name → time → <b>Assign Bay</b> (repeat for other bays) → <b>Submit</b>.</p>
      </div>
    </div>
  );
}

function BayPreview({ win, chips, staged, draft, date, ptdMin }: {
  win: { open_min: number; close_min: number; is_closed: boolean }; chips: Array<{ job_chip_id: string; registration_no?: string; planned_start: string; planned_end: string; status: string; paused_at: string | null; actual_start: string | null }>;
  staged: Array<[number, number]>; draft: [number, number] | null; date: string; ptdMin: number;
}) {
  const a = win.is_closed ? 480 : win.open_min - 30; const b = win.is_closed ? 1200 : win.close_min + 30;
  const pct = (m: number) => `${((Math.min(Math.max(m, a), b) - a) / (b - a)) * 100}%`;
  const w = (s: number, e: number) => `${((Math.min(e, b) - Math.max(s, a)) / (b - a)) * 100}%`;
  const ticks = [];
  for (let h = Math.ceil(a / 60); h * 60 <= b; h++) ticks.push(h);
  return (
    <div className="relative h-20 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="nonop-band absolute inset-y-0 left-0" style={{ width: w(a, win.open_min) }} />
      <div className="nonop-band absolute inset-y-0" style={{ left: pct(win.close_min), right: 0 }} />
      {ticks.map((h) => <div key={h} className="absolute inset-y-0 border-l border-slate-100 pl-0.5 text-[9px] text-slate-400" style={{ left: pct(h * 60) }}>{h}</div>)}
      {chips.map((c) => {
        const s = minutesInDay(c.planned_start, date);
        const e = c.status === 'ON_HOLD' && c.paused_at ? minutesInDay(c.paused_at, date) : minutesInDay(c.planned_end, date);
        return (
          <div key={c.job_chip_id} className="absolute top-3 h-7 truncate rounded border border-slate-400 bg-slate-200 px-1 text-[9px] font-semibold leading-7 text-slate-700" style={{ left: pct(s), width: w(s, e) }} title={c.registration_no}>
            {c.registration_no}
          </div>
        );
      })}
      {staged.map(([s, e], i) => <div key={i} className="absolute top-3 h-7 rounded border-2 border-dashed border-brand-500 bg-brand-100/60" style={{ left: pct(s), width: w(s, e) }} />)}
      {draft && draft[1] > draft[0] && <div className="absolute bottom-2 h-5 rounded bg-brand-600/80 text-center text-[9px] font-bold leading-5 text-white" style={{ left: pct(draft[0]), width: w(draft[0], draft[1]) }}>new</div>}
      {ptdMin > a && ptdMin < b && <div className="absolute inset-y-0 w-0.5 bg-brand-900" style={{ left: pct(ptdMin) }} title="PTD"><span className="absolute -top-0 left-1 text-[9px] font-bold text-brand-900">PTD</span></div>}
    </div>
  );
}

function JobCardSummary({ d }: { d: JobCardDetailsView }) {
  const j = d.job_card;
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5 text-sm"><span className="text-slate-500">{k}</span><span className="text-right font-medium text-slate-900">{v ?? '—'}</span></div>;
  return (
    <div className="grid gap-4 p-5 md:grid-cols-3">
      <section><h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Customer</h4>
        <Row k="Name" v={j.customer_name} /><Row k="Mobile" v={j.customer_mobile} /><Row k="Revisit (RV)" v={j.is_revisit ? 'Yes' : 'No'} /><Row k="Repeat complaint (RC)" v={j.is_repeat_complaint ? 'Yes' : 'No'} />
      </section>
      <section><h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Vehicle</h4>
        <Row k="Reg No" v={<span className="font-mono">{j.registration_no}</span>} /><Row k="VIN" v={<span className="font-mono text-xs">{j.vin}</span>} /><Row k="Model" v={j.model} /><Row k="Product line" v={j.product_line} />
      </section>
      <section><h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Job card</h4>
        <Row k="JC Number" v={j.jc_number} /><Row k="Opened" v={fmtDateTime(j.jc_opened_at)} /><Row k="Service type" v={j.service_type} /><Row k="Service Advisor" v={j.service_advisor} />
        <Row k="PTD" v={<span className={cx(j.ptd_overdue && 'text-red-600')}>{fmtDateTime(j.ptd)}</span>} /><Row k="Status" v={<StatusBadge status={j.work_status} />} />
        <Row k="Assignment" v={j.assignment_status.replace(/_/g, ' ').toLowerCase()} /><Row k="Washing eligible" v={j.washing_eligible ? 'Yes' : 'No'} />
      </section>
      {toMs(j.ptd) < Date.now() && <div className="md:col-span-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">PTD has passed — any new chip will be blocked until the Service Advisor updates the PTD.</div>}
    </div>
  );
}
