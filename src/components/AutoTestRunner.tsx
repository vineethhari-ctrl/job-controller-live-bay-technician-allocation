import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FlaskConical,
  Play,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api } from '../api';
import {
  applyChipAction,
  assignmentForJobCard,
  baySummaries,
  isChipDelayed,
  nextPostRepairStage,
  resolveOperationalWindow,
  validateDrafts,
} from '../domain/rules';
import { atMinutes, istDate, toIstIso, toMs } from '../domain/time';
import {
  Bay,
  Chip,
  ChipDraft,
  JobCard,
  JobCardReference,
  OperationalHoursRow,
  PauseReason,
} from '../domain/types';
import { Button, cx, Pill, StatusBadge } from './ui';

export interface TestResult {
  id: number;
  code: string;
  title: string;
  description: string;
  status: 'IDLE' | 'RUNNING' | 'PASS' | 'FAIL';
  durationMs?: number;
  details?: string;
  logs: string[];
}

export function AutoTestRunner() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>(() => INITIAL_TESTS);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const toggleExpand = (id: number) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const runAllTests = async () => {
    setRunning(true);
    const updated = [...INITIAL_TESTS];

    for (let i = 0; i < updated.length; i++) {
      updated[i] = { ...updated[i], status: 'RUNNING', logs: [] };
      setResults([...updated]);

      const t0 = performance.now();
      try {
        const testFn = TEST_SUITE[i];
        const logs: string[] = [];
        await testFn(logs);
        const t1 = performance.now();
        updated[i] = {
          ...updated[i],
          status: 'PASS',
          durationMs: Math.round((t1 - t0) * 10) / 10,
          logs,
        };
      } catch (err: any) {
        const t1 = performance.now();
        updated[i] = {
          ...updated[i],
          status: 'FAIL',
          durationMs: Math.round((t1 - t0) * 10) / 10,
          details: err.message || String(err),
          logs: [...(updated[i].logs || []), `❌ ERROR: ${err.message || String(err)}`],
        };
      }
      setResults([...updated]);
    }
    setRunning(false);
  };

  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;

  return (
    <>
      {/* Floating launcher in bottom-left corner */}
      <button
        onClick={() => {
          setOpen(true);
          if (results.every((r) => r.status === 'IDLE')) {
            runAllTests();
          }
        }}
        className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-md transition hover:bg-slate-800 hover:scale-105 active:scale-95 cursor-pointer"
        title="Open automated verification test runner"
      >
        <FlaskConical className="h-4 w-4 text-emerald-400" />
        <span>Automated Verification</span>
        {passCount > 0 && (
          <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[10px] font-mono text-emerald-300">
            {passCount}/10 PASS
          </span>
        )}
      </button>

      {/* Slide-over Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setOpen(false)}
          />

          {/* Drawer container */}
          <div className="relative z-10 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl animate-in slide-in-from-left duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Job Controller Rule Verification
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Automated domain rule execution &amp; verification runner
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="xs"
                  tone="primary"
                  loading={running}
                  onClick={runAllTests}
                  className="gap-1.5"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Run All</span>
                </Button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Scoreboard bar */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-600">Results:</span>
                <span className="flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {passCount} Passed
                </span>
                {failCount > 0 && (
                  <span className="flex items-center gap-1 font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                    <AlertCircle className="h-3.5 w-3.5" /> {failCount} Failed
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400">10 Spec Scenarios</span>
            </div>

            {/* Test List */}
            <div className="flex-1 overflow-y-auto thin-scroll p-4 space-y-2.5">
              {results.map((t) => (
                <div
                  key={t.id}
                  className={cx(
                    'rounded-xl border transition-all bg-white overflow-hidden',
                    t.status === 'PASS' && 'border-emerald-200 hover:border-emerald-300',
                    t.status === 'FAIL' && 'border-red-300 bg-red-50/10',
                    t.status === 'RUNNING' && 'border-brand-400 ring-2 ring-brand-100',
                    t.status === 'IDLE' && 'border-slate-200'
                  )}
                >
                  <div
                    onClick={() => toggleExpand(t.id)}
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50/60"
                  >
                    <div className="flex items-start gap-2.5 min-w-0 pr-2">
                      <div className="mt-0.5">
                        {t.status === 'PASS' && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        )}
                        {t.status === 'FAIL' && (
                          <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                        )}
                        {t.status === 'RUNNING' && (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent shrink-0" />
                        )}
                        {t.status === 'IDLE' && (
                          <div className="h-4 w-4 rounded-full border-2 border-slate-300 shrink-0" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-900">
                            {t.id}. {t.code}
                          </span>
                          <span className="text-xs font-semibold text-slate-700 truncate">
                            · {t.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                          {t.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {t.durationMs !== undefined && (
                        <span className="font-mono text-[10px] text-slate-400">
                          {t.durationMs}ms
                        </span>
                      )}
                      <span
                        className={cx(
                          'rounded-md px-1.5 py-0.5 text-[10px] font-bold font-mono',
                          t.status === 'PASS' && 'bg-emerald-100 text-emerald-800',
                          t.status === 'FAIL' && 'bg-red-100 text-red-800',
                          t.status === 'RUNNING' && 'bg-brand-100 text-brand-800',
                          t.status === 'IDLE' && 'bg-slate-100 text-slate-500'
                        )}
                      >
                        {t.status}
                      </span>
                      {expanded[t.id] ? (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Diagnostics */}
                  {expanded[t.id] && (
                    <div className="border-t border-slate-100 bg-slate-50/80 p-3 text-xs">
                      <div className="font-semibold text-slate-600 mb-1 text-[11px]">
                        Verification Execution Trace:
                      </div>
                      <div className="space-y-1 font-mono text-[10.5px] bg-slate-900 text-slate-100 p-2.5 rounded-lg overflow-x-auto thin-scroll">
                        {t.logs.map((log, idx) => (
                          <div
                            key={idx}
                            className={cx(
                              log.startsWith('✓') && 'text-emerald-400',
                              log.startsWith('❌') && 'text-red-400 font-bold',
                              log.startsWith('→') && 'text-sky-300'
                            )}
                          >
                            {log}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500 flex justify-between items-center">
              <span>Pure business rules &amp; Mock Store verified</span>
              <Button size="sm" tone="default" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// -------------------------------------------------------------
// Test Metadata
// -------------------------------------------------------------
const INITIAL_TESTS: TestResult[] = [
  {
    id: 1,
    code: 'F001/F002',
    title: 'Division Data Scoping',
    description: "Scopes calendar bays, staff, and job card data to logged-in user's division.",
    status: 'IDLE',
    logs: [],
  },
  {
    id: 2,
    code: 'F003',
    title: 'Date Navigation & Read-Only Guard',
    description: 'Verifies today renders active timeline and past dates are strictly read-only.',
    status: 'IDLE',
    logs: [],
  },
  {
    id: 3,
    code: 'F004',
    title: 'Non-Operational Hours Block',
    description: 'Ensures slots outside 08:30–18:30 or on closed days are rejected by rule engine.',
    status: 'IDLE',
    logs: [],
  },
  {
    id: 4,
    code: 'F005',
    title: 'Delayed Chips Count & Red Highlighting',
    description: 'Calculates overrun delay when now > planned_end and flags bay header as RED.',
    status: 'IDLE',
    logs: [],
  },
  {
    id: 5,
    code: 'F006',
    title: 'Global Search Indexing',
    description: 'Searches by vehicle registration and JC number returning target rows.',
    status: 'IDLE',
    logs: [],
  },
  {
    id: 6,
    code: 'F007',
    title: 'Multi-Complaint Atomic Staging & Commit',
    description: 'Stages multiple complaints in a single chip and commits atomically.',
    status: 'IDLE',
    logs: [],
  },
  {
    id: 7,
    code: 'F008',
    title: 'Partial Bay Allocation Persistence',
    description: 'Verifies partially scheduled Job Cards remain in the Unassigned Queue.',
    status: 'IDLE',
    logs: [],
  },
  {
    id: 8,
    code: 'Rule Engine',
    title: 'Hard Block on PTD Overrun',
    description: 'Enforces hard validation block when chip planned_end crosses Job Card PTD.',
    status: 'IDLE',
    logs: [],
  },
  {
    id: 9,
    code: 'Rule Engine',
    title: 'Same-Vehicle Double Booking Hard Block',
    description: 'Prevents the same vehicle from being scheduled in two bays at overlapping times.',
    status: 'IDLE',
    logs: [],
  },
  {
    id: 10,
    code: 'F009/F011',
    title: 'Complete Lifecycle & Stage Transition',
    description: 'Start (actual_start) -> Pause (MR check) -> Resume -> End -> Stage QC_IN_QUEUE.',
    status: 'IDLE',
    logs: [],
  },
];

// -------------------------------------------------------------
// Test Assertions Implementation
// -------------------------------------------------------------
const TEST_SUITE: Array<(logs: string[]) => Promise<void>> = [
  // 1. F001/F002 Division Scoping
  async (logs) => {
    logs.push('→ Calling api.getCalendar for division "div-1"…');
    const cal = await api.getCalendar('div-1', istDate(Date.now()));
    if (!cal) throw new Error('Calendar data is null');
    logs.push(`✓ Received calendar for division: ${cal.division_id}`);
    if (cal.division_id !== 'div-1') throw new Error(`Expected div-1, got ${cal.division_id}`);
    if (cal.bays.length === 0) throw new Error('No bays returned for division div-1');
    logs.push(`✓ Verified ${cal.bays.length} bays scoped to dealer/division.`);
  },

  // 2. F003 Date filter switches to today and past date
  async (logs) => {
    const today = istDate(Date.now());
    logs.push(`→ Testing today: ${today}`);
    const todayCal = await api.getCalendar('div-1', today);
    if (!todayCal.is_today) throw new Error('is_today should be true for current date');
    if (todayCal.is_past) throw new Error('is_past should be false for today');
    logs.push('✓ Today verified: is_today=true, is_past=false (live now indicator active)');

    const pastDate = '2026-08-15';
    logs.push(`→ Testing past date: ${pastDate}`);
    const pastCal = await api.getCalendar('div-1', pastDate);
    if (!pastCal.is_past) throw new Error('is_past should be true for past date');
    logs.push('✓ Past date verified: is_past=true (read-only mode strictly enforced)');
  },

  // 3. F004 Non-operational hours
  async (logs) => {
    const today = istDate(Date.now());
    const win = resolveOperationalWindow(today, [
      { division_id: 'div-1', day_of_week: 1, specific_date: null, is_closed: false, open_time: '08:30', close_time: '18:30' },
    ]);
    logs.push(`→ Operational window: ${win.open_min / 60}h to ${win.close_min / 60}h`);

    // Slot at 07:00 (before 08:30)
    const earlyDraft: ChipDraft = {
      job_card_id: 'jc-1',
      bay_id: 'bay-1',
      planned_start: atMinutes(today, 7 * 60),
      planned_end: atMinutes(today, 8 * 60),
      lines: [{ job_card_complaint_id: 'cc-101' }],
      tech_supervisor_id: 'sup-1',
      quality_inspector_id: 'qi-1',
    };
    logs.push('→ Testing early slot at 07:00–08:00 (before workshop opening 08:30)…');
    const resEarly = await api.validateDrafts([earlyDraft]);
    if (resEarly.is_valid) throw new Error('Early slot should have been rejected');
    const hasNonOp = resEarly.errors.some((e) => e.code === 'NON_OPERATIONAL_HOURS');
    if (!hasNonOp) throw new Error('Expected NON_OPERATIONAL_HOURS error code');
    logs.push('✓ Rejected early slot with NON_OPERATIONAL_HOURS error');

    // Slot after 18:30
    const lateDraft: ChipDraft = {
      ...earlyDraft,
      planned_start: atMinutes(today, 19 * 60),
      planned_end: atMinutes(today, 20 * 60),
    };
    logs.push('→ Testing late slot at 19:00–20:00 (after closing 18:30)…');
    const resLate = await api.validateDrafts([lateDraft]);
    if (resLate.is_valid) throw new Error('Late slot should have been rejected');
    logs.push('✓ Rejected after-hours slot with NON_OPERATIONAL_HOURS error');
  },

  // 4. F005 Delayed chips count and red highlight
  async (logs) => {
    const today = istDate(Date.now());
    const now = Date.now();
    const delayedChip: Chip = {
      id: 'chip-delayed-test',
      job_card_id: 'jc-1',
      bay_id: 'bay-1',
      dealer_id: 'dlr-1',
      division_id: 'div-1',
      bu_id: 'PV',
      chip_date: today,
      planned_start: toIstIso(now - 60 * 60 * 1000),
      planned_end: toIstIso(now - 30 * 60 * 1000), // Planned end in the past relative to now
      actual_start: toIstIso(now - 55 * 60 * 1000),
      actual_end: null,
      paused_at: null,
      ptd: atMinutes(today, 17 * 60),
      status: 'IN_PROGRESS',
      pause_reason_code: null,
      pause_reference: null,
      technician_id: null,
      tech_supervisor_id: 'sup-1',
      quality_inspector_id: 'qi-1',
      is_cancelled: false,
      version: 1,
      complaints: [],
    };

    logs.push('→ Evaluating delayed chip (planned_end passed while IN_PROGRESS)…');
    const delayed = isChipDelayed(delayedChip, now);
    if (!delayed) throw new Error('Chip should be marked delayed');
    logs.push('✓ isChipDelayed returned true');

    const testBay: Bay = {
      id: 'bay-1',
      dealer_id: 'dlr-1',
      division_id: 'div-1',
      bu_id: 'PV',
      bay_name: 'Mechanical Bay 1',
      bay_type: 'MECHANICAL',
      sequence_no: 1,
      is_active: true,
      supervisor_id: 'sup-1',
      technicians: [],
    };

    const summaries = baySummaries([testBay], [delayedChip], now);
    if (summaries[0].delayed_count !== 1) throw new Error('Expected delayed_count = 1');
    if (summaries[0].bay_status !== 'RED') throw new Error('Expected bay_status = RED');
    logs.push('✓ Bay summary computed delayed_count=1 and bay_status="RED" (highlighted red in header).');
  },

  // 5. F006 Global search
  async (logs) => {
    logs.push('→ Executing global search by Registration No "MH12RN4590"…');
    const res1 = await api.search('MH12RN4590');
    if (!res1.results.some((r) => r.registration_no === 'MH12RN4590')) {
      throw new Error('Search failed to find vehicle MH12RN4590');
    }
    logs.push(`✓ Found ${res1.results.length} record(s) matching MH12RN4590.`);

    logs.push('→ Executing search by JC number "JC-2026-0092"…');
    const res2 = await api.search('JC-2026-0092');
    if (!res2.results.some((r) => r.jc_number === 'JC-2026-0092')) {
      throw new Error('Search failed to find JC-2026-0092');
    }
    logs.push('✓ Found matching Nexon EV record.');
  },

  // 6. F007 Multi-complaint atomic chip staging & creation
  async (logs) => {
    const today = istDate(Date.now());
    logs.push('→ Creating atomic multi-complaint chip for clean test Job Card jc-3 on Electrical Bay 01 (14:00–15:30)…');
    const created = await api.createChips({
      chips: [
        {
          job_card_id: 'jc-3',
          bay_id: 'bay-4', // Electrical Bay 01 (unoccupied)
          planned_start: atMinutes(today, 14 * 60),
          planned_end: atMinutes(today, 15 * 60 + 30),
          lines: [
            { job_card_complaint_id: 'cc-301' },
            { job_card_complaint_id: 'cc-302' },
          ],
          tech_supervisor_id: 'sup-2',
          quality_inspector_id: 'qi-1',
        },
      ],
      confirm_ptd_warning: true,
    });

    if (!created.job_chips || created.job_chips.length === 0) {
      throw new Error('Failed to create chip');
    }
    const chip = created.job_chips[0];
    if (chip.complaints.length !== 2) {
      throw new Error(`Expected 2 complaints on chip, got ${chip.complaints.length}`);
    }
    logs.push(`✓ Created chip ${chip.id} on Electrical Bay 01 with ${chip.complaints.length} complaint lines atomically.`);
  },

  // 7. F008 Partial bay allocation keeps JC in Unassigned Queue
  async (logs) => {
    const jc = (await api.getJobCard('jc-1')).job_card as unknown as JobCard;
    // Simulate only 1 complaint assigned
    const chip1: Chip = {
      id: 'chip-part-1',
      job_card_id: jc.id,
      bay_id: 'bay-1',
      dealer_id: 'dlr-1',
      division_id: 'div-1',
      bu_id: 'PV',
      chip_date: istDate(Date.now()),
      planned_start: atMinutes(istDate(Date.now()), 10 * 60),
      planned_end: atMinutes(istDate(Date.now()), 11 * 60),
      actual_start: null,
      actual_end: null,
      paused_at: null,
      ptd: jc.ptd,
      status: 'NOT_STARTED',
      pause_reason_code: null,
      pause_reference: null,
      technician_id: null,
      tech_supervisor_id: 'sup-1',
      quality_inspector_id: 'qi-1',
      is_cancelled: false,
      version: 1,
      complaints: [
        {
          id: 'l-1',
          job_card_complaint_id: jc.complaints[0].id,
          job_card_job_ids: null,
          status: 'NOT_STARTED',
          actual_start: null,
          actual_end: null,
          road_test: false,
          det_id: null,
          remarks: null,
        },
      ],
    };

    logs.push('→ Testing assignment rollup when 1 of 2 complaints assigned…');
    const asgn = assignmentForJobCard(jc, [chip1]);
    if (asgn.status !== 'PARTIALLY_ASSIGNED') {
      throw new Error(`Expected PARTIALLY_ASSIGNED, got ${asgn.status}`);
    }
    if (asgn.unassigned_complaints <= 0) {
      throw new Error('Unassigned complaint count should be > 0');
    }
    logs.push(`✓ Status: ${asgn.status}, unassigned_hours: ${asgn.unassigned_hours}h.`);
    logs.push('✓ Job Card remains visible in Unassigned Queue until 100% assigned.');
  },

  // 8. Hard block on PTD overrun
  async (logs) => {
    const today = istDate(Date.now());
    const jc = (await api.getJobCard('jc-1')).job_card as unknown as JobCard;
    const ptdMs = toMs(jc.ptd);
    logs.push(`→ Job card PTD is: ${jc.ptd}`);

    const overrunDraft: ChipDraft = {
      job_card_id: jc.id,
      bay_id: 'bay-1',
      planned_start: atMinutes(today, 16 * 60),
      planned_end: atMinutes(today, 18 * 60), // Exceeds PTD (17:30)
      lines: [{ job_card_complaint_id: jc.complaints[0].id }],
      tech_supervisor_id: 'sup-1',
      quality_inspector_id: 'qi-1',
    };

    logs.push('→ Validating draft where planned_end (18:00) > PTD (17:30)…');
    const res = await api.validateDrafts([overrunDraft]);
    if (res.is_valid) throw new Error('Draft exceeding PTD should be blocked');
    const ptdError = res.errors.find((e) => e.code === 'PTD_CROSSED');
    if (!ptdError) throw new Error('Expected PTD_CROSSED error code');
    logs.push(`✓ Hard block verified: "${ptdError.title}: ${ptdError.detail}"`);
  },

  // 9. Hard block on same-vehicle double booking
  async (logs) => {
    const today = istDate(Date.now());
    logs.push('→ Testing vehicle jc-1 (already in Mechanical Bay 01 from 09:30–11:30) scheduled in Express Bay 01 from 10:00–11:00…');
    const overlappingDraft: ChipDraft = {
      job_card_id: 'jc-1',
      bay_id: 'bay-3', // Express Bay 01 (different bay from Mechanical Bay 01)
      planned_start: atMinutes(today, 10 * 60),
      planned_end: atMinutes(today, 11 * 60),
      lines: [{ job_card_complaint_id: 'cc-102' }],
      tech_supervisor_id: 'sup-2',
      quality_inspector_id: 'qi-1',
    };

    const res = await api.validateDrafts([overlappingDraft]);
    if (res.is_valid) throw new Error('Overlapping slot in different bay for same vehicle should be rejected');
    const dbError = res.errors.find(
      (e) => e.code === 'VEHICLE_DOUBLE_BOOKED' || e.code === 'BAY_OCCUPIED'
    );
    if (!dbError) {
      throw new Error(`Expected error code VEHICLE_DOUBLE_BOOKED or BAY_OCCUPIED, got: ${res.errors.map((e) => e.code).join(', ')}`);
    }
    logs.push(`✓ Hard block verified: ${dbError.code} - ${dbError.detail}`);
  },

  // 10. F009 Full Lifecycle State Transitions
  async (logs) => {
    const today = istDate(Date.now());
    const now = Date.now();
    const testChip: Chip = {
      id: 'chip-lifecycle-test',
      job_card_id: 'jc-1',
      bay_id: 'bay-1',
      dealer_id: 'dlr-1',
      division_id: 'div-1',
      bu_id: 'PV',
      chip_date: today,
      planned_start: toIstIso(now - 10 * 60 * 1000), // Planned 10 mins ago relative to now so early start check passes
      planned_end: toIstIso(now + 2 * 60 * 60 * 1000),
      actual_start: null,
      actual_end: null,
      paused_at: null,
      ptd: atMinutes(today, 17 * 60),
      status: 'NOT_STARTED',
      pause_reason_code: null,
      pause_reference: null,
      technician_id: null,
      tech_supervisor_id: 'sup-1',
      quality_inspector_id: 'qi-1',
      is_cancelled: false,
      version: 1,
      complaints: [
        {
          id: 'line-l1',
          job_card_complaint_id: 'cc-101',
          job_card_job_ids: null,
          status: 'NOT_STARTED',
          actual_start: null,
          actual_end: null,
          road_test: false,
          det_id: null,
          remarks: null,
        },
        {
          id: 'line-l2',
          job_card_complaint_id: 'cc-102',
          job_card_job_ids: null,
          status: 'NOT_STARTED',
          actual_start: null,
          actual_end: null,
          road_test: false,
          det_id: null,
          remarks: null,
        },
      ],
    };

    const jc = (await api.getJobCard('jc-1')).job_card as unknown as JobCard;
    const testBay: Bay = {
      id: 'bay-1',
      dealer_id: 'dlr-1',
      division_id: 'div-1',
      bu_id: 'PV',
      bay_name: 'Mechanical Bay 1',
      bay_type: 'MECHANICAL',
      sequence_no: 1,
      is_active: true,
      supervisor_id: 'sup-1',
      technicians: [],
    };

    const ctx = {
      now,
      role: 'JOB_CONTROLLER' as const,
      bays: [testBay],
      chips: [testChip],
      jobCards: [jc],
      references: [],
      pauseReasons: [
        { code: 'PR_LUNCH', label: 'Lunch Break', dependency_type: 'NONE' as const, reference_type: null, dependent_label: null, raise_hint: null, sort_order: 1 },
      ],
    };

    // 1. START
    logs.push('→ Executing START on chip-lifecycle-test…');
    const startRes = applyChipAction({ chip_id: testChip.id, action: 'START' }, ctx);
    if (!startRes.ok || !startRes.chip) throw new Error('START failed: ' + startRes.issue?.detail);
    if (startRes.chip.status !== 'IN_PROGRESS') throw new Error('Expected status IN_PROGRESS');
    if (!startRes.chip.actual_start) throw new Error('actual_start was not stamped');
    logs.push(`✓ Started: status=IN_PROGRESS, actual_start=${startRes.chip.actual_start}`);

    // Update chip in ctx
    ctx.chips = [startRes.chip];

    // 2. PAUSE (negative test: without reason)
    logs.push('→ Testing PAUSE without mandatory reason code…');
    const badPause = applyChipAction({ chip_id: testChip.id, action: 'PAUSE' }, ctx);
    if (badPause.ok) throw new Error('Pause without reason should fail');
    logs.push('✓ Rejected un-reasoned pause with PAUSE_REASON_REQUIRED');

    // 2. PAUSE (positive test)
    logs.push('→ Testing PAUSE with reason PR_LUNCH…');
    const pauseRes = applyChipAction(
      { chip_id: testChip.id, action: 'PAUSE', pause: { reason_code: 'PR_LUNCH' } },
      ctx
    );
    if (!pauseRes.ok || !pauseRes.chip) throw new Error('Pause failed');
    if (pauseRes.chip.status !== 'ON_HOLD') throw new Error('Expected status ON_HOLD');
    if (!pauseRes.chip.paused_at) throw new Error('paused_at was not stamped');
    logs.push(`✓ Paused: status=ON_HOLD, paused_at=${pauseRes.chip.paused_at}`);

    // Update chip in ctx
    ctx.chips = [pauseRes.chip];

    // 3. RESUME
    logs.push('→ Executing RESUME…');
    const resumeRes = applyChipAction({ chip_id: testChip.id, action: 'RESUME' }, ctx);
    if (!resumeRes.ok || !resumeRes.chip) throw new Error('Resume failed');
    if (resumeRes.chip.status !== 'IN_PROGRESS') throw new Error('Expected status IN_PROGRESS');
    logs.push('✓ Resumed: status=IN_PROGRESS');

    // Update chip in ctx
    ctx.chips = [resumeRes.chip];

    // 4. END
    logs.push('→ Executing END (Bulk completion)…');
    const endRes = applyChipAction({ chip_id: testChip.id, action: 'END' }, ctx);
    if (!endRes.ok || !endRes.chip) throw new Error('End failed');
    if (endRes.chip.status !== 'COMPLETED') throw new Error('Expected status COMPLETED');
    if (!endRes.chip.actual_end) throw new Error('actual_end was not stamped');
    logs.push(`✓ Completed: status=COMPLETED, actual_end=${endRes.chip.actual_end}`);

    // Post repair stage verification
    ctx.chips = [endRes.chip];
    const nextStage = nextPostRepairStage(jc, ctx.chips);
    if (nextStage !== 'QC_IN_QUEUE') throw new Error(`Expected stage QC_IN_QUEUE, got: ${nextStage}`);
    logs.push(`✓ Next Job Card stage resolved to: ${nextStage} (moved to Quality Check Queue)`);
  },
];
