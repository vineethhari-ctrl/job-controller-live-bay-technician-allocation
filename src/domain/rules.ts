/**
 * Business-rule engine for the Job Controller module.
 *
 * Pure functions only — no I/O. Used both by server/mock store and client UI.
 */
import {
  Bay, Chip, ChipAction, ChipComplaint, ChipDraft, JobCard, JobCardComplaint, JobCardReference,
  OperationalHoursRow, PausePayload, PauseReason, PostRepairStage, PTD_WARNING_MINUTES_DEFAULT,
  Role, RuleIssue, Staff, VENDOR_OPTIONS, WorkStatus, AssignmentStatus,
} from './types';
import {
  dayOfWeek, fmtDateLabel, fmtTime, hhmmToMinutes, istDate, minutesInDay, overlaps, toIstIso, toMs,
} from './time';

const MIN = 60_000;

const err = (code: string, title: string, detail: string, draft_index?: number): RuleIssue =>
  ({ code, title, detail, severity: 'error', draft_index });
const warn = (code: string, title: string, detail: string, draft_index?: number): RuleIssue =>
  ({ code, title, detail, severity: 'warning', draft_index });

// ---------------------------------------------------------------------------
// Status rollup (F009 §7) — never set directly, always derived
// ---------------------------------------------------------------------------
export function rollupStatus(statuses: WorkStatus[]): WorkStatus {
  if (statuses.length === 0) return 'NOT_STARTED';
  if (statuses.every((s) => s === 'COMPLETED')) return 'COMPLETED';
  if (statuses.some((s) => s === 'IN_PROGRESS')) return 'IN_PROGRESS';
  if (statuses.some((s) => s === 'ON_HOLD')) return 'ON_HOLD';
  return 'NOT_STARTED';
}

export function jobCardWorkStatus(jobCardId: string, chips: Chip[]): WorkStatus {
  return rollupStatus(
    chips.filter((c) => c.job_card_id === jobCardId && !c.is_cancelled).flatMap((c) => c.complaints.map((cc) => cc.status)),
  );
}

/** F008 §3 — red/blink when now > planned_end while still IN_PROGRESS or ON_HOLD. */
export function isChipDelayed(chip: Chip, now: number): boolean {
  return !chip.is_cancelled
    && (chip.status === 'IN_PROGRESS' || chip.status === 'ON_HOLD')
    && now > toMs(chip.planned_end);
}

/**
 * The time range a chip actually blocks on its bay.
 *  - cancelled         → frees the slot immediately (F020)
 *  - ON_HOLD           → shrinks to actual_start → paused_at; rest is auto-unassigned (F024)
 *  - COMPLETED         → up to actual_end (overrun included, early finish frees the rest)
 *  - IN_PROGRESS       → planned window, extended to "now" while overrunning
 *  - NOT_STARTED       → planned window
 */
export function chipOccupancy(chip: Chip, now: number): [number, number] | null {
  if (chip.is_cancelled) return null;
  const ps = toMs(chip.planned_start);
  const pe = toMs(chip.planned_end);
  const as = chip.actual_start ? toMs(chip.actual_start) : null;
  switch (chip.status) {
    case 'ON_HOLD': {
      if (as === null) return null;
      const pa = chip.paused_at ? toMs(chip.paused_at) : as;
      return [Math.min(as, ps), Math.max(pa, as + MIN)];
    }
    case 'COMPLETED': {
      const ae = chip.actual_end ? toMs(chip.actual_end) : pe;
      return [Math.min(as ?? ps, ps), ae];
    }
    case 'IN_PROGRESS':
      return [Math.min(as ?? ps, ps), Math.max(pe, now)];
    default:
      return [ps, pe];
  }
}

// ---------------------------------------------------------------------------
// Operational hours (F004)
// ---------------------------------------------------------------------------
export interface OperationalWindow {
  date: string;
  is_closed: boolean;
  open_min: number;
  close_min: number;
  source: 'DATE_EXCEPTION' | 'WEEKLY' | 'DEFAULT';
}

/** A date-specific row overrides the weekly pattern for that date only. */
export function resolveOperationalWindow(date: string, rows: OperationalHoursRow[]): OperationalWindow {
  const exception = rows.find((r) => r.specific_date === date);
  const weekly = rows.find((r) => r.specific_date === null && r.day_of_week === dayOfWeek(date));
  const row = exception ?? weekly;
  if (!row) return { date, is_closed: false, open_min: 0, close_min: 1440, source: 'DEFAULT' };
  const source = exception ? 'DATE_EXCEPTION' : 'WEEKLY';
  if (row.is_closed || !row.open_time || !row.close_time) {
    return { date, is_closed: true, open_min: 0, close_min: 0, source };
  }
  return { date, is_closed: false, open_min: hhmmToMinutes(row.open_time), close_min: hhmmToMinutes(row.close_time), source };
}

/** Grey bands on the 00:00–24:00 timeline. */
export function nonOperationalBands(win: OperationalWindow): Array<[number, number]> {
  if (win.is_closed) return [[0, 1440]];
  const bands: Array<[number, number]> = [];
  if (win.open_min > 0) bands.push([0, win.open_min]);
  if (win.close_min < 1440) bands.push([win.close_min, 1440]);
  return bands;
}

export function isInsideOperationalHours(win: OperationalWindow, startMin: number, endMin: number): boolean {
  return !win.is_closed && startMin >= win.open_min && endMin <= win.close_min;
}

// ---------------------------------------------------------------------------
// Assignment (F006 Unassigned section)
// ---------------------------------------------------------------------------
export interface ComplaintAssignment {
  job_card_complaint_id: string;
  assigned_job_ids: string[];
  unassigned_job_ids: string[];
  total_hours: number;
  unassigned_hours: number;
  is_fully_assigned: boolean;
  chip_ids: string[];
}

export interface JobCardAssignment {
  status: AssignmentStatus;
  complaints: ComplaintAssignment[];
  unassigned_hours: number;
  total_complaints: number;
  unassigned_complaints: number;
  has_additional_pending: boolean;
  has_rework_pending: boolean;
}

export function activeComplaints(jc: JobCard): JobCardComplaint[] {
  return jc.complaints.filter((c) => !c.is_dropped);
}

export function assignmentForJobCard(jc: JobCard, chips: Chip[]): JobCardAssignment {
  const jcChips = chips.filter((c) => c.job_card_id === jc.id && !c.is_cancelled);
  const complaints = activeComplaints(jc).map<ComplaintAssignment>((cc) => {
    const assigned = new Set<string>();
    const chipIds: string[] = [];
    for (const chip of jcChips) {
      for (const line of chip.complaints) {
        if (line.job_card_complaint_id !== cc.id) continue;
        chipIds.push(chip.id);
        (line.job_card_job_ids ?? cc.jobs.map((j) => j.id)).forEach((id) => assigned.add(id));
      }
    }
    const unassigned = cc.jobs.filter((j) => !assigned.has(j.id));
    const total = cc.jobs.reduce((s, j) => s + Number(j.std_hours), 0);
    const open = unassigned.reduce((s, j) => s + Number(j.std_hours), 0);
    return {
      job_card_complaint_id: cc.id,
      assigned_job_ids: [...assigned],
      unassigned_job_ids: unassigned.map((j) => j.id),
      total_hours: round2(total),
      unassigned_hours: round2(open),
      is_fully_assigned: cc.jobs.length === 0 ? chipIds.length > 0 : unassigned.length === 0,
      chip_ids: [...new Set(chipIds)],
    };
  });
  const fully = complaints.filter((c) => c.is_fully_assigned).length;
  const touched = complaints.filter((c) => c.assigned_job_ids.length > 0 || c.chip_ids.length > 0).length;
  const status: AssignmentStatus = complaints.length > 0 && fully === complaints.length
    ? 'FULLY_ASSIGNED'
    : touched === 0 ? 'NOT_ASSIGNED' : 'PARTIALLY_ASSIGNED';
  const pendingOrigins = new Set(
    complaints.filter((c) => !c.is_fully_assigned)
      .map((c) => jc.complaints.find((x) => x.id === c.job_card_complaint_id)!.origin),
  );
  return {
    status,
    complaints,
    unassigned_hours: round2(complaints.reduce((s, c) => s + c.unassigned_hours, 0)),
    total_complaints: complaints.length,
    unassigned_complaints: complaints.length - fully,
    has_additional_pending: pendingOrigins.has('ADDITIONAL'),
    has_rework_pending: pendingOrigins.has('REWORK'),
  };
}

/** F007 — Total Chip Time = Σ standard labour hours of every selected job. */
export function hoursForLines(jc: JobCard, lines: ChipDraft['lines']): number {
  let total = 0;
  for (const line of lines) {
    const cc = jc.complaints.find((c) => c.id === line.job_card_complaint_id);
    if (!cc) continue;
    const ids = line.job_card_job_ids ?? cc.jobs.map((j) => j.id);
    total += cc.jobs.filter((j) => ids.includes(j.id)).reduce((s, j) => s + Number(j.std_hours), 0);
  }
  return round2(total);
}

// ---------------------------------------------------------------------------
// Slot validation engine (F007 §5, F013, F014)
// ---------------------------------------------------------------------------
export interface SlotContext {
  now: number;
  bays: Bay[];
  jobCards: JobCard[];
  chips: Chip[];
  operationalHours: OperationalHoursRow[];
  ptdWarningMinutes?: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: RuleIssue[];
  warnings: RuleIssue[];
  total_hours: number[];
}

export function draftToChip(draft: ChipDraft, jc: JobCard, bay: Bay, id: string): Chip {
  return {
    id,
    job_card_id: draft.job_card_id,
    bay_id: draft.bay_id,
    dealer_id: bay.dealer_id,
    division_id: bay.division_id,
    bu_id: bay.bu_id,
    chip_date: istDate(draft.planned_start),
    planned_start: toIstIso(draft.planned_start),
    planned_end: toIstIso(draft.planned_end),
    actual_start: null,
    actual_end: null,
    paused_at: null,
    ptd: jc.ptd,
    status: 'NOT_STARTED',
    pause_reason_code: null,
    pause_reference: null,
    technician_id: draft.technician_id ?? null,
    tech_supervisor_id: draft.tech_supervisor_id ?? '',
    quality_inspector_id: draft.quality_inspector_id ?? '',
    is_cancelled: false,
    version: 1,
    complaints: draft.lines.map<ChipComplaint>((l, i) => ({
      id: `${id}-cc${i}`,
      job_card_complaint_id: l.job_card_complaint_id,
      job_card_job_ids: l.job_card_job_ids && l.job_card_job_ids.length ? [...l.job_card_job_ids] : null,
      status: 'NOT_STARTED',
      actual_start: null,
      actual_end: null,
      road_test: !!l.road_test,
      det_id: l.det_id ?? null,
      remarks: null,
    })),
  };
}

export function validateDrafts(drafts: ChipDraft[], ctx: SlotContext): ValidationResult {
  const errors: RuleIssue[] = [];
  const warnings: RuleIssue[] = [];
  const hours: number[] = [];
  const pool: Chip[] = [...ctx.chips];
  const today = istDate(ctx.now);
  const ptdWarn = (ctx.ptdWarningMinutes ?? PTD_WARNING_MINUTES_DEFAULT) * MIN;

  drafts.forEach((d, i) => {
    const E = (code: string, t: string, detail: string) => errors.push(err(code, t, detail, i));
    const jc = ctx.jobCards.find((j) => j.id === d.job_card_id);
    const bay = ctx.bays.find((b) => b.id === d.bay_id);
    if (!jc) { E('JOB_CARD_NOT_FOUND', 'Job card not found', 'The selected job card no longer exists.'); hours.push(0); return; }
    if (!bay || !bay.is_active) { E('BAY_NOT_FOUND', 'Select a bay', 'Choose a Bay Type and Bay Name before assigning.'); hours.push(0); return; }
    hours.push(hoursForLines(jc, d.lines));

    if (jc.is_cancelled) E('JOB_CARD_CANCELLED', 'Job card cancelled', `${jc.jc_number} has been cancelled; no new chips can be created.`);
    if (!d.lines.length) E('NO_COMPLAINTS', 'Select complaint codes', 'Check at least one complaint code to build a chip.');

    const s = toMs(d.planned_start);
    const e = toMs(d.planned_end);
    if (!(e > s)) E('INVALID_WINDOW', 'Invalid time', 'The "To" time must be after the "From" time.');

    const date = istDate(s);
    if (date < today) E('PAST_DATE', 'Past date is read-only', 'Chips cannot be created on a past date.');
    if (istDate(e - 1) !== date) E('CROSSES_MIDNIGHT', 'Chip crosses midnight', 'A chip must start and end on the same day.');
    const win = resolveOperationalWindow(date, ctx.operationalHours);
    if (!isInsideOperationalHours(win, minutesInDay(s, date), minutesInDay(e, date))) {
      E('NON_OPERATIONAL_HOURS', 'Non-operational hours',
        win.is_closed ? `The workshop is closed on ${fmtDateLabel(date)}.`
          : `Chips can only be scheduled between ${fmtHm(win.open_min)} and ${fmtHm(win.close_min)}.`);
    }

    if (!d.tech_supervisor_id) E('TS_REQUIRED', 'Technician Supervisor required', 'Select a Technician Supervisor for this chip.');
    if (!d.quality_inspector_id) E('QI_REQUIRED', 'Quality Inspector required', 'Select a Quality Inspector (Assign QI) for this chip.');

    // Virtual Bay (F013)
    if (bay.bay_type === 'VIRTUAL') {
      if (!d.technician_id) E('TECHNICIAN_REQUIRED', 'Technician required', 'Virtual Bay has no roster — select a technician for this chip.');
      const bad = d.lines
        .map((l) => jc.complaints.find((c) => c.id === l.job_card_complaint_id))
        .filter((c): c is JobCardComplaint => !!c && !['UPDATION', 'REWORK', 'VAS'].includes(c.complaint_type) && c.origin !== 'REWORK');
      if (bad.length) {
        E('VIRTUAL_BAY_TYPE', 'Not allowed in Virtual Bay',
          `Only Updation, Rework and VAS complaint codes can be scheduled in Virtual Bay (${bad.map((b) => b.code).join(', ')}).`);
      }
    }

    // Dynamic pool for the current job card (so staged drafts in this batch conflict with each other)
    const jcPool = pool.filter((c) => c.job_card_id === jc.id && !c.is_cancelled);

    // Job-code subsets are a General Bay-only mode (F014)
    if (bay.bay_type !== 'GENERAL') {
      const partial = d.lines.some((l) => {
        const cc = jc.complaints.find((c) => c.id === l.job_card_complaint_id);
        if (!cc || !l.job_card_job_ids || !l.job_card_job_ids.length) return false;
        const taken = new Set(jcPool.flatMap((c) => c.complaints.filter((x) => x.job_card_complaint_id === cc.id && c.status !== 'ON_HOLD')
          .flatMap((x) => x.job_card_job_ids ?? cc.jobs.map((j) => j.id))));
        const open = cc.jobs.filter((j) => !taken.has(j.id));
        return l.job_card_job_ids.length < open.length;
      });
      if (partial) E('JOB_CODE_MODE_GENERAL_ONLY', 'Job-code selection not allowed', 'Only General Bay allows scheduling individual job codes.');
    }

    // Already-assigned complaint/job codes + same-complaint-code overlap
    for (const line of d.lines) {
      const cc = jc.complaints.find((c) => c.id === line.job_card_complaint_id);
      if (!cc) { E('COMPLAINT_NOT_FOUND', 'Unknown complaint code', 'A selected complaint code is not on this job card.'); continue; }
      if (cc.is_dropped) E('COMPLAINT_DROPPED', 'Complaint dropped', `${cc.code} is no longer active on this job card.`);
      const wanted = new Set(line.job_card_job_ids && line.job_card_job_ids.length ? line.job_card_job_ids : cc.jobs.map((j) => j.id));
      for (const other of jcPool) {
        for (const ol of other.complaints) {
          if (ol.job_card_complaint_id !== cc.id) continue;
          const theirs = ol.job_card_job_ids ?? cc.jobs.map((j) => j.id);
          const clash = theirs.some((id) => wanted.has(id)) || (cc.jobs.length === 0);
          const occ = chipOccupancy(other, ctx.now);
          if (occ && overlaps(s, e, occ[0], occ[1])) {
            E('COMPLAINT_OVERLAP', 'Complaint code already scheduled',
              `${cc.code} already has a slot ${fmtTime(occ[0])}–${fmtTime(occ[1])} that overlaps this time.`);
          } else if (clash && other.status !== 'ON_HOLD') {
            E('ALREADY_ASSIGNED', 'Already assigned', `${cc.code} is already assigned to a bay.`);
          }
        }
      }
    }

    // Same-vehicle double booking across bays (and even within the same Virtual Bay)
    for (const other of jcPool) {
      const occ = chipOccupancy(other, ctx.now);
      if (occ && overlaps(s, e, occ[0], occ[1])) {
        const ob = ctx.bays.find((b) => b.id === other.bay_id);
        E('VEHICLE_DOUBLE_BOOKED', 'Vehicle already scheduled',
          `${jc.registration_no} is already scheduled in ${ob?.bay_name ?? 'another bay'} from ${fmtTime(occ[0])} to ${fmtTime(occ[1])}.`);
        break;
      }
    }

    // Physical Bay occupancy conflict (Virtual Bay allows parallel chips for different vehicles)
    if (bay.bay_type !== 'VIRTUAL') {
      for (const other of pool) {
        if (other.bay_id !== bay.id || other.is_cancelled || other.job_card_id === jc.id) continue;
        const occ = chipOccupancy(other, ctx.now);
        if (occ && overlaps(s, e, occ[0], occ[1])) {
          const ojc = ctx.jobCards.find((j) => j.id === other.job_card_id);
          E('BAY_SLOT_CONFLICT', 'Bay slot not free',
            `${bay.bay_name} is occupied ${fmtTime(occ[0])}–${fmtTime(occ[1])}${ojc ? ` by ${ojc.registration_no}` : ''}.`);
        }
      }
    }

    // PTD hard block & warning
    const ptd = toMs(jc.ptd);
    if (e > ptd) {
      E('PTD_CROSSED', 'PTD will be crossed',
        `Planned end ${fmtTime(e)} is after the promised delivery time (${fmtDateLabel(istDate(ptd))} ${fmtTime(ptd)}). Ask the Service Advisor to update the PTD.`);
    } else if (e > ptd - ptdWarn) {
      warnings.push(warn('PTD_NEAR', 'Close to PTD',
        `Planned end ${fmtTime(e)} is within ${Math.round((ptd - e) / MIN)} min of the PTD (${fmtTime(ptd)}). Proceed?`, i));
    }

    pool.push(draftToChip(d, jc, bay, `staged-${i}`));
  });

  return { ok: errors.length === 0, errors: dedupe(errors), warnings, total_hours: hours };
}

// ---------------------------------------------------------------------------
// Lifecycle engine (F009, F011, F024, F025)
// ---------------------------------------------------------------------------
export interface ActionContext {
  now: number;
  role: Role;
  bays: Bay[];
  chips: Chip[];
  jobCards: JobCard[];
  references: JobCardReference[];
  pauseReasons: PauseReason[];
}

export interface ActionRequest {
  chip_id: string;
  action: ChipAction;
  complaint_ids?: string[];
  pause?: PausePayload;
  delay_reason?: string | null;
}

export interface HistoryEntry {
  chip_id: string;
  chip_complaint_id: string | null;
  action: ChipAction;
  from_status: WorkStatus;
  to_status: WorkStatus;
  pause_reason_code: string | null;
  reference: string | null;
  at: string;
}

export interface ActionResult {
  ok: boolean;
  issue?: RuleIssue;
  chip?: Chip;
  targets: string[];
  late_end: boolean;
  history: HistoryEntry[];
}

const fail = (issue: RuleIssue): ActionResult => ({ ok: false, issue, targets: [], late_end: false, history: [] });

export function availableActions(chip: Chip | any, role: Role, now: number): Record<ChipAction, boolean> {
  const today = istDate(now);
  const chipDate = chip.chip_date || (chip.planned_start ? istDate(chip.planned_start) : today);
  const isCancelled = !!chip.is_cancelled;
  const live = !isCancelled && chipDate === today;
  const complaintsList = chip.complaints || chip.complaint_codes || [];
  const st = complaintsList.map((c: any) => c.status);

  return {
    START: live && (st.includes('NOT_STARTED') || st.length === 0) && !st.includes('IN_PROGRESS') && !st.includes('ON_HOLD'),
    PAUSE: live && role !== 'TECHNICIAN' && st.includes('IN_PROGRESS'),
    RESUME: live && role !== 'TECHNICIAN' && st.includes('ON_HOLD'),
    COMPLETE: live && (st.includes('IN_PROGRESS') || st.includes('ON_HOLD')),
    END: live && chip.actual_start !== null && st.some((s: string) => s !== 'COMPLETED'),
  };
}

export function applyChipAction(req: ActionRequest, ctx: ActionContext): ActionResult {
  const chip = ctx.chips.find((c) => c.id === req.chip_id);
  if (!chip) return fail(err('CHIP_NOT_FOUND', 'Chip not found', 'The chip may have been removed.'));
  const bay = ctx.bays.find((b) => b.id === chip.bay_id);
  const today = istDate(ctx.now);
  const nowIso = toIstIso(ctx.now);
  const bulk = !req.complaint_ids || req.complaint_ids.length === 0;

  if (chip.is_cancelled) return fail(err('CHIP_CANCELLED', 'Chip cancelled', 'Actions are disabled on a cancelled chip.'));
  if (chip.chip_date < today) return fail(err('PAST_DATE_READ_ONLY', 'Read-only', 'Past dates are a historical, read-only view.'));
  if (chip.chip_date > today) {
    return fail(err('FUTURE_DATE_LOCKED', 'Not yet available',
      `Start / Pause / End become available on ${fmtDateLabel(chip.chip_date)}.`));
  }
  if (ctx.role === 'TECHNICIAN' && (req.action === 'PAUSE' || req.action === 'RESUME')) {
    return fail(err('ROLE_FORBIDDEN', 'Not permitted', 'Technicians cannot pause or resume work.'));
  }
  if (ctx.role === 'TECHNICIAN' && bulk && chip.complaints.length > 1) {
    return fail(err('ROLE_FORBIDDEN', 'Not permitted', 'Bulk actions are available to Job Controller and Technician Supervisor only.'));
  }

  const pick = (want: WorkStatus[]): ChipComplaint[] => {
    const scope = bulk ? chip.complaints : chip.complaints.filter((c) => req.complaint_ids!.includes(c.id));
    if (!bulk && scope.length !== req.complaint_ids!.length) return [];
    return scope.filter((c) => want.includes(c.status));
  };

  let targets: ChipComplaint[] = [];
  let to: WorkStatus = 'IN_PROGRESS';
  let pauseRef: string | null = null;

  switch (req.action) {
    case 'START':
    case 'RESUME': {
      targets = pick(req.action === 'START' ? ['NOT_STARTED'] : ['ON_HOLD']);
      if (!targets.length) {
        return fail(err('NOTHING_TO_' + req.action, req.action === 'START' ? 'Nothing to start' : 'Nothing to resume',
          req.action === 'START' ? 'Selected complaint codes are already started.' : 'No complaint code is on hold.'));
      }
      if (req.action === 'START' && chip.actual_start === null && ctx.now < toMs(chip.planned_start)) {
        return fail(err('EARLY_START', 'Cannot start early',
          `This chip is planned to start at ${fmtTime(chip.planned_start)}. Please reschedule the planned time before starting early.`));
      }
      const sameDay = ctx.chips.filter((c) => c.id !== chip.id && !c.is_cancelled);
      // Rule A — one chip In Progress per bay (Virtual Bay exempt)
      if (bay && bay.bay_type !== 'VIRTUAL') {
        const running = sameDay.find((c) => c.bay_id === chip.bay_id && c.status === 'IN_PROGRESS');
        if (running) {
          const rjc = ctx.jobCards.find((j) => j.id === running.job_card_id);
          return fail(err('BAY_BUSY', 'Bay is busy',
            `${bay.bay_name} already has ${rjc?.registration_no ?? 'another vehicle'} In Progress. Only one chip per bay can run at a time.`));
        }
      }
      // Rule B — one chip In Progress per job card, everywhere (no exceptions)
      const other = sameDay.find((c) => c.job_card_id === chip.job_card_id && c.status === 'IN_PROGRESS');
      if (other) {
        const ob = ctx.bays.find((b) => b.id === other.bay_id);
        return fail(err('JOB_CARD_BUSY', 'Cannot start chip',
          `This vehicle already has a chip In Progress at ${ob?.bay_name ?? 'another bay'}. Only one chip per Job Card can be In Progress at a time.`));
      }
      // Planned sequence (all bays except Virtual & General)
      if (req.action === 'START' && chip.actual_start === null && bay && bay.bay_type !== 'VIRTUAL' && bay.bay_type !== 'GENERAL') {
        const earlier = sameDay
          .filter((c) => c.bay_id === chip.bay_id && c.chip_date === chip.chip_date && c.status === 'NOT_STARTED'
            && toMs(c.planned_start) < toMs(chip.planned_start))
          .sort((a, b) => toMs(a.planned_start) - toMs(b.planned_start))[0];
        if (earlier) {
          const ejc = ctx.jobCards.find((j) => j.id === earlier.job_card_id);
          return fail(err('OUT_OF_SEQUENCE', 'Start chips in planned order',
            `${ejc?.registration_no ?? 'An earlier chip'} planned at ${fmtTime(earlier.planned_start)} in ${bay.bay_name} must be started first.`));
        }
      }
      to = 'IN_PROGRESS';
      break;
    }
    case 'PAUSE': {
      targets = chip.complaints.filter((c) => c.status === 'IN_PROGRESS');
      if (!targets.length) return fail(err('NOTHING_TO_PAUSE', 'Nothing to pause', 'No complaint code on this chip is In Progress.'));
      const check = validatePause(req.pause, chip, ctx);
      if (check.issue) return fail(check.issue);
      pauseRef = check.reference;
      to = 'ON_HOLD';
      break;
    }
    case 'COMPLETE': {
      targets = pick(['IN_PROGRESS', 'ON_HOLD']);
      if (!targets.length) return fail(err('END_BEFORE_START', 'Cannot end yet', 'End is available only after the complaint code is started.'));
      to = 'COMPLETED';
      break;
    }
    case 'END': {
      if (chip.actual_start === null) return fail(err('END_BEFORE_START', 'Cannot end yet', 'Start the chip before ending it.'));
      targets = bulk ? chip.complaints.filter((c) => c.status !== 'COMPLETED') : pick(['NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD']);
      if (!targets.length) return fail(err('ALREADY_COMPLETED', 'Already complete', 'All complaint codes are already complete.'));
      to = 'COMPLETED';
      break;
    }
  }

  const targetIds = new Set(targets.map((t) => t.id));
  const history: HistoryEntry[] = [];
  const complaints = chip.complaints.map((c) => {
    if (!targetIds.has(c.id)) return c;
    history.push({
      chip_id: chip.id, chip_complaint_id: c.id, action: req.action, from_status: c.status, to_status: to,
      pause_reason_code: req.action === 'PAUSE' ? req.pause!.reason_code : null, reference: pauseRef, at: nowIso,
    });
    return {
      ...c,
      status: to,
      actual_start: c.actual_start ?? (to !== 'ON_HOLD' ? nowIso : c.actual_start),
      actual_end: to === 'COMPLETED' ? nowIso : c.actual_end,
      remarks: req.action === 'COMPLETE' || req.action === 'END' ? (req.delay_reason ?? c.remarks) : c.remarks,
    };
  });
  const status = rollupStatus(complaints.map((c) => c.status));
  const wasComplete = chip.status === 'COMPLETED';
  const updated: Chip = {
    ...chip,
    complaints,
    status,
    version: chip.version + 1,
    actual_start: chip.actual_start ?? (status !== 'NOT_STARTED' ? nowIso : null),
    actual_end: status === 'COMPLETED' ? (chip.actual_end ?? nowIso) : null,
    paused_at: status === 'ON_HOLD' ? nowIso : chip.paused_at,
    pause_reason_code: status === 'ON_HOLD' ? req.pause?.reason_code ?? chip.pause_reason_code : chip.pause_reason_code,
    pause_reference: status === 'ON_HOLD' ? pauseRef ?? chip.pause_reference : chip.pause_reference,
  };
  const lateEnd = !wasComplete && status === 'COMPLETED' && ctx.now > toMs(chip.planned_end);
  return { ok: true, chip: updated, targets: [...targetIds], late_end: lateEnd, history };
}

export function validatePause(
  payload: PausePayload | undefined, chip: Chip, ctx: Pick<ActionContext, 'references' | 'pauseReasons'>,
): { issue?: RuleIssue; reference: string | null } {
  if (!payload?.reason_code) {
    return { issue: err('PAUSE_REASON_REQUIRED', 'Pause reason required', 'Select a pause reason to put this chip on hold.'), reference: null };
  }
  const reason = ctx.pauseReasons.find((r) => r.code === payload.reason_code);
  if (!reason) return { issue: err('PAUSE_REASON_INVALID', 'Unknown pause reason', 'Choose a reason from the list.'), reference: null };
  const open = ctx.references.find((r) => r.job_card_id === chip.job_card_id && r.ref_type === reason.reference_type && r.status === 'OPEN');
  switch (reason.dependency_type) {
    case 'NONE':
      return { reference: null };
    case 'VENDOR_SELECT':
      if (!payload.vendor || !(VENDOR_OPTIONS as readonly string[]).includes(payload.vendor)) {
        return { issue: err('VENDOR_REQUIRED', 'Vendor required', `Select a vendor (${VENDOR_OPTIONS.join(' / ')}).`), reference: null };
      }
      return { reference: payload.vendor };
    case 'MR_PARTS': {
      if (!open) {
        return { issue: err('REFERENCE_MISSING', `${reason.dependent_label ?? 'MR'} not present`,
          `${reason.dependent_label ?? 'MR'} against the job card is not present, please ${reason.raise_hint ?? 'raise it'} to pause the chip.`), reference: null };
      }
      const known = new Set((open.parts ?? []).map((p) => p.part_no));
      const chosen = (payload.part_nos ?? []).filter((p) => known.has(p));
      if (!chosen.length) return { issue: err('PARTS_REQUIRED', 'Select parts', 'Select at least one part that is not available.'), reference: null };
      return { reference: `${open.ref_number}:${chosen.join(',')}` };
    }
    case 'AUTO_REF':
      if (!open) {
        return { issue: err('REFERENCE_MISSING', `${reason.dependent_label ?? 'Reference'} not present`,
          `${reason.dependent_label ?? 'Reference'} against the job card is not present, please ${reason.raise_hint ?? 'raise it'} to pause the chip.`), reference: null };
      }
      return { reference: open.ref_number };
  }
}

export function nextPostRepairStage(jc: JobCard, chips: Chip[]): PostRepairStage | null {
  const jcChips = chips.filter((c) => c.job_card_id === jc.id && !c.is_cancelled);
  const assignment = assignmentForJobCard(jc, chips);
  const work = jobCardWorkStatus(jc.id, chips);
  let stage = jc.post_repair_stage;
  if (stage === 'REWORK_BAY_NOT_ASSIGNED') {
    const reworkIds = new Set(jc.complaints.filter((c) => c.origin === 'REWORK' && c.rework_cycle === jc.rework_cycle).map((c) => c.id));
    const started = jcChips.some((c) => c.complaints.some((l) => reworkIds.has(l.job_card_complaint_id) && l.status !== 'NOT_STARTED'));
    if (started) stage = 'REWORK_WIP';
  }
  if (assignment.status === 'FULLY_ASSIGNED' && work === 'COMPLETED' && (stage === null || stage === 'REWORK_WIP')) {
    stage = 'QC_IN_QUEUE';
  }
  return stage;
}

export type BucketKey = 'JOB_STOP_PAUSED' | 'QUALITY_CHECK' | 'REWORK' | 'WASHING' | 'READY_FOR_DELIVERY';
export type TileColor = 'magenta' | 'grey' | 'amber' | 'sky' | 'green' | 'red';

export interface BoardTile {
  job_card_id: string;
  jc_number: string;
  registration_no: string;
  last4: string;
  stage: string;
  stage_label: string;
  color: TileColor;
  ptd_overdue: boolean;
  ptd: string;
  pause_reason_code?: string | null;
  paused_since?: string | null;
}

export const BUCKET_STAGES: Record<BucketKey, { key: string; label: string }[]> = {
  JOB_STOP_PAUSED: [],
  QUALITY_CHECK: [{ key: 'IN_QUEUE', label: 'In Queue' }, { key: 'WIP', label: 'WIP' }],
  REWORK: [{ key: 'BAY_NOT_ASSIGNED', label: 'Bay Not Assigned' }, { key: 'WIP', label: 'WIP' }],
  WASHING: [{ key: 'IN_QUEUE', label: 'In Queue' }, { key: 'WIP', label: 'WIP' }],
  READY_FOR_DELIVERY: [],
};

export function buildStatusBoard(jobCards: JobCard[], chips: Chip[], now: number): Record<BucketKey, BoardTile[]> {
  const board: Record<BucketKey, BoardTile[]> = {
    JOB_STOP_PAUSED: [], QUALITY_CHECK: [], REWORK: [], WASHING: [], READY_FOR_DELIVERY: [],
  };
  for (const jc of jobCards) {
    if (jc.is_cancelled) continue;
    const overdue = now > toMs(jc.ptd);
    const tile = (stage: string, stage_label: string, color: TileColor, extra: Partial<BoardTile> = {}): BoardTile => ({
      job_card_id: jc.id, jc_number: jc.jc_number, registration_no: jc.registration_no,
      last4: jc.registration_no.slice(-4), stage, stage_label, color: overdue ? 'red' : color, ptd_overdue: overdue, ptd: jc.ptd, ...extra,
    });
    const paused = chips.find((c) => c.job_card_id === jc.id && !c.is_cancelled && c.status === 'ON_HOLD');
    if (paused) {
      board.JOB_STOP_PAUSED.push(tile('PAUSED', 'Paused', 'magenta', { pause_reason_code: paused.pause_reason_code, paused_since: paused.paused_at }));
    }
    switch (jc.post_repair_stage) {
      case 'QC_IN_QUEUE': board.QUALITY_CHECK.push(tile('IN_QUEUE', 'In Queue', 'grey')); break;
      case 'QC_WIP': board.QUALITY_CHECK.push(tile('WIP', 'WIP', 'amber')); break;
      case 'REWORK_BAY_NOT_ASSIGNED': board.REWORK.push(tile('BAY_NOT_ASSIGNED', 'Bay Not Assigned', 'grey')); break;
      case 'REWORK_WIP': board.REWORK.push(tile('WIP', 'WIP', 'amber')); break;
      case 'WASH_IN_QUEUE': board.WASHING.push(tile('IN_QUEUE', 'In Queue', 'grey')); break;
      case 'WASH_WIP_WASHING': board.WASHING.push(tile('WIP', 'WIP · Washing', 'sky')); break;
      case 'WASH_WIP_INSPECTION': board.WASHING.push(tile('WIP', 'WIP · Inspection', 'amber')); break;
      case 'READY_FOR_DELIVERY': board.READY_FOR_DELIVERY.push(tile('READY', 'Ready', 'green')); break;
      default: break;
    }
  }
  return board;
}

export interface BaySummary {
  bay_id: string;
  bay_name: string;
  bay_type: string;
  delayed_count: number;
  pending_count: number;
  in_progress_count: number;
  bay_status: 'RED' | 'NORMAL';
}

export function baySummaries(bays: Bay[], chips: Chip[], now: number): BaySummary[] {
  return bays.map((b) => {
    const mine = chips.filter((c) => c.bay_id === b.id && !c.is_cancelled);
    const delayed = mine.filter((c) => isChipDelayed(c, now)).length;
    return {
      bay_id: b.id,
      bay_name: b.bay_name,
      bay_type: b.bay_type,
      delayed_count: delayed,
      pending_count: mine.filter((c) => c.status !== 'COMPLETED').length,
      in_progress_count: mine.filter((c) => c.status === 'IN_PROGRESS').length,
      bay_status: delayed > 0 ? 'RED' : 'NORMAL',
    };
  });
}

export type TechnicianPresence = 'AVAILABLE' | 'BUSY' | 'ABSENT';

export function technicianPresence(bay: Bay, chips: Chip[], staff: Staff[]): Array<{ technician_id: string; name: string; status: TechnicianPresence }> {
  const running = chips.some((c) => c.bay_id === bay.id && !c.is_cancelled && c.status === 'IN_PROGRESS');
  return bay.technicians.map((t) => {
    const s = staff.find((x) => x.id === t.technician_id);
    const busyVirtual = chips.some((c) => c.technician_id === t.technician_id && c.status === 'IN_PROGRESS' && !c.is_cancelled);
    const status: TechnicianPresence = !s?.is_logged_in ? 'ABSENT' : (running || busyVirtual) ? 'BUSY' : 'AVAILABLE';
    return { technician_id: t.technician_id, name: t.name, status };
  });
}

export function suggestNextSlot(
  bay: Bay, date: string, chips: Chip[], win: OperationalWindow, durationMin: number, now: number, step = 5,
): number | null {
  if (win.is_closed) return null;
  let t = win.open_min;
  if (istDate(now) === date) t = Math.max(t, Math.ceil(minutesInDay(now, date) / step) * step);
  if (istDate(now) > date) return null;
  const dur = Math.max(step, Math.ceil(durationMin / step) * step);
  if (bay.bay_type === 'VIRTUAL') return t + dur <= win.close_min ? t : null;
  const busy = chips
    .filter((c) => c.bay_id === bay.id)
    .map((c) => chipOccupancy(c, now))
    .filter((o): o is [number, number] => !!o)
    .map(([a, b]) => [minutesInDay(a, date), minutesInDay(b, date)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  for (const [a, b] of busy) {
    if (t + dur <= a) break;
    if (b > t) t = Math.ceil(b / step) * step;
  }
  return t + dur <= win.close_min ? t : null;
}

function round2(n: number) { return Math.round(n * 100) / 100; }
function fmtHm(min: number) { return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; }
function dedupe(list: RuleIssue[]) {
  const seen = new Set<string>();
  return list.filter((i) => { const k = `${i.draft_index}|${i.code}|${i.detail}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
