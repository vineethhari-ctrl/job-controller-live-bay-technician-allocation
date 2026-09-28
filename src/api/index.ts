import {
  Bay,
  Chip,
  ChipDraft,
  JobCard,
  JobCardReference,
  OperationalHoursRow,
  PauseReason,
  PostRepairStage,
  Role,
  RuleIssue,
  Staff,
  WorkStatus,
} from '../domain/types';
import {
  applyChipAction,
  assignmentForJobCard,
  baySummaries,
  BaySummary,
  buildStatusBoard,
  isChipDelayed,
  nonOperationalBands,
  OperationalWindow,
  resolveOperationalWindow,
  suggestNextSlot,
  technicianPresence,
  TechnicianPresence,
  validateDrafts,
} from '../domain/rules';
import { atMinutes, istDate, toMs } from '../domain/time';

export class ApiError extends Error {
  issues: RuleIssue[];
  requiresConfirmation: boolean;
  constructor(message: string, issues: RuleIssue[] = [], requiresConfirmation = false) {
    super(message);
    this.name = 'ApiError';
    this.issues = issues;
    this.requiresConfirmation = requiresConfirmation;
  }
}

export interface ChipView {
  job_chip_id: string;
  job_card_id: string;
  bay_id: string;
  registration_no: string;
  jc_short: string;
  model: string;
  service_type: string;
  service_advisor: string;
  planned_start: string;
  planned_end: string;
  actual_start: string | null;
  actual_end: string | null;
  paused_at: string | null;
  ptd: string;
  status: WorkStatus;
  is_delayed: boolean;
  is_late_start: boolean;
  pause_reason_code: string | null;
  pause_reference: string | null;
  tags: {
    revisit: boolean;
    repeat_complaint: boolean;
    additional_blink: boolean;
    rework_blink: boolean;
    rework_chip: boolean;
  };
  complaint_codes: Array<{
    id: string;
    code: string;
    title: string;
    status: WorkStatus;
    actual_start: string | null;
    actual_end: string | null;
    road_test: boolean;
  }>;
}

export type CalendarBay = Omit<Bay, 'technicians'> & {
  bay_id: string;
  delayed_count: number;
  job_chips: ChipView[];
  technicians: Array<{ technician_id: string; name: string; status: TechnicianPresence }>;
};

export interface CalendarView {
  date: string;
  division_id: string;
  is_today: boolean;
  is_past: boolean;
  operational_window: OperationalWindow;
  non_operational_bands: Array<[number, number]>;
  summary: BaySummary[];
  bays: CalendarBay[];
}

export interface JobCardDetailsView {
  job_card: JobCard & {
    ptd_overdue: boolean;
    assignment_status: string;
    work_status: WorkStatus;
    washing_eligible: boolean;
  };
  complaints: Array<
    JobCard['complaints'][number] & {
      total_hours: number;
      assigned_job_ids: string[];
      is_fully_assigned: boolean;
      previous_bay?: string | null;
      previous_technician?: string | null;
    }
  >;
  chips: Chip[];
}

export interface MastersData {
  bays: Bay[];
  technicians: Staff[];
  techSupervisors: Staff[];
  qualityInspectors: Staff[];
  dets: Staff[];
  pauseReasons: PauseReason[];
}

// -------------------------------------------------------------
// Realistic Seed Data
// -------------------------------------------------------------
const TODAY = istDate(Date.now());

const SEED_BAYS: Bay[] = [
  {
    id: 'bay-1',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    bay_name: 'Mechanical Bay 01',
    bay_type: 'MECHANICAL',
    sequence_no: 1,
    is_active: true,
    supervisor_id: 'sup-1',
    technicians: [
      { technician_id: 'tech-1', name: 'Ramesh Kumar', slot_no: 1 },
      { technician_id: 'tech-2', name: 'Suresh Patil', slot_no: 2 },
    ],
  },
  {
    id: 'bay-2',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    bay_name: 'Mechanical Bay 02',
    bay_type: 'MECHANICAL',
    sequence_no: 2,
    is_active: true,
    supervisor_id: 'sup-1',
    technicians: [{ technician_id: 'tech-3', name: 'Amit Verma', slot_no: 1 }],
  },
  {
    id: 'bay-3',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    bay_name: 'Express Bay 01',
    bay_type: 'EXPRESS',
    sequence_no: 3,
    is_active: true,
    supervisor_id: 'sup-2',
    technicians: [{ technician_id: 'tech-4', name: 'Ganesh Shinde', slot_no: 1 }],
  },
  {
    id: 'bay-4',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    bay_name: 'Electrical Bay 01',
    bay_type: 'ELECTRICAL',
    sequence_no: 4,
    is_active: true,
    supervisor_id: 'sup-2',
    technicians: [{ technician_id: 'tech-5', name: 'Vikram Joshi', slot_no: 1 }],
  },
  {
    id: 'bay-5',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    bay_name: 'General / Inspection Bay',
    bay_type: 'GENERAL',
    sequence_no: 5,
    is_active: true,
    supervisor_id: 'sup-1',
    technicians: [{ technician_id: 'tech-6', name: 'Deepak Rao', slot_no: 1 }],
  },
  {
    id: 'bay-6',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    bay_name: 'Virtual Bay (VAS/Rework)',
    bay_type: 'VIRTUAL',
    sequence_no: 6,
    is_active: true,
    supervisor_id: 'sup-2',
    technicians: [],
  },
];

const SEED_STAFF: Staff[] = [
  { id: 'tech-1', division_id: 'div-1', bu_id: 'PV', full_name: 'Ramesh Kumar', role: 'TECHNICIAN', is_logged_in: true },
  { id: 'tech-2', division_id: 'div-1', bu_id: 'PV', full_name: 'Suresh Patil', role: 'TECHNICIAN', is_logged_in: true },
  { id: 'tech-3', division_id: 'div-1', bu_id: 'PV', full_name: 'Amit Verma', role: 'TECHNICIAN', is_logged_in: false },
  { id: 'tech-4', division_id: 'div-1', bu_id: 'PV', full_name: 'Ganesh Shinde', role: 'TECHNICIAN', is_logged_in: true },
  { id: 'tech-5', division_id: 'div-1', bu_id: 'PV', full_name: 'Vikram Joshi', role: 'TECHNICIAN', is_logged_in: true },
  { id: 'tech-6', division_id: 'div-1', bu_id: 'PV', full_name: 'Deepak Rao', role: 'TECHNICIAN', is_logged_in: true },
  { id: 'sup-1', division_id: 'div-1', bu_id: 'PV', full_name: 'Nitin Sawant (TS-Mechanical)', role: 'TECH_SUPERVISOR', is_logged_in: true },
  { id: 'sup-2', division_id: 'div-1', bu_id: 'PV', full_name: 'Rajesh Kadam (TS-Express/Elec)', role: 'TECH_SUPERVISOR', is_logged_in: true },
  { id: 'qi-1', division_id: 'div-1', bu_id: 'PV', full_name: 'Anand Kulkarni (QI)', role: 'QUALITY_INSPECTOR', is_logged_in: true },
  { id: 'qi-2', division_id: 'div-1', bu_id: 'PV', full_name: 'Mahesh Deshmukh (QI)', role: 'QUALITY_INSPECTOR', is_logged_in: true },
  { id: 'det-1', division_id: 'div-1', bu_id: 'PV', full_name: 'Sunil Gokhale (DET Lead)', role: 'DET', is_logged_in: true },
];

const SEED_PAUSE_REASONS: PauseReason[] = [
  { code: 'PR_MR', label: 'Parts Unavailability (MR Required)', dependency_type: 'MR_PARTS', reference_type: 'MR', dependent_label: 'Material Request No', raise_hint: 'raise an MR with the parts department', sort_order: 1 },
  { code: 'PR_CUST_APP', label: 'Customer Approval Pending', dependency_type: 'AUTO_REF', reference_type: 'CUSTOMER_APPROVAL', dependent_label: 'Approval Token', raise_hint: 'request customer estimate approval via SMS/Call', sort_order: 2 },
  { code: 'PR_TECH_HELP', label: 'Technical Helpline Escalation (THD)', dependency_type: 'AUTO_REF', reference_type: 'THD', dependent_label: 'THD Ticket Number', raise_hint: 'log an engineering support ticket on THD portal', sort_order: 3 },
  { code: 'PR_SUBLET', label: 'Sublet / Specialized Vendor Work', dependency_type: 'VENDOR_SELECT', reference_type: null, dependent_label: 'Vendor Category', raise_hint: null, sort_order: 4 },
  { code: 'PR_LUNCH', label: 'Scheduled Lunch / Tea Break', dependency_type: 'NONE', reference_type: null, dependent_label: null, raise_hint: null, sort_order: 5 },
  { code: 'PR_POWER', label: 'Facility Maintenance / Power Outage', dependency_type: 'NONE', reference_type: null, dependent_label: null, raise_hint: null, sort_order: 6 },
];

const SEED_JOB_CARDS: JobCard[] = [
  {
    id: 'jc-1',
    jc_number: 'JC-2026-0081',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    registration_no: 'MH12RN4590',
    vin: 'MAT623400N2K10942',
    model: 'Harrier XZA+ (Dark)',
    product_line: 'SUV',
    customer_name: 'Rajesh K. Mehta',
    customer_mobile: '9822019482',
    service_type: 'Periodic Maintenance 30,000 km',
    service_advisor: 'Rohit Kulkarni',
    washing_supervisor: 'Babu Lal',
    ptd: atMinutes(TODAY, 17 * 60 + 30), // 17:30 today
    jc_opened_at: atMinutes(TODAY, 8 * 60 + 45),
    special_request: 'Check sunroof creak sound when opening',
    washing_required: true,
    prewash_done: true,
    is_revisit: false,
    is_repeat_complaint: true,
    is_express: false,
    rework_cycle: 0,
    post_repair_stage: null,
    is_cancelled: false,
    cancel_reason: null,
    complaints: [
      {
        id: 'cc-101',
        complaint_code_id: 'code-1',
        code: 'SVC30K',
        title: '30,000 km Major Periodic Service',
        description: 'Engine oil, oil filter, air filter replacement and comprehensive 45-point check',
        complaint_type: 'STANDARD',
        voc: 'Standard scheduled maintenance',
        origin: 'ORIGINAL',
        request_id: null,
        rework_cycle: null,
        is_dropped: false,
        jobs: [
          { id: 'j-101', job_code_id: 'jc-1', code: 'OIL_CHG', description: 'Engine Oil & Filter Renewal', std_hours: 0.8, job_category: 'SSC' },
          { id: 'j-102', job_code_id: 'jc-2', code: 'BRK_INSP', description: '4-Wheel Brake Cleaning & Inspection', std_hours: 1.0, job_category: 'SSC' },
        ],
      },
      {
        id: 'cc-102',
        complaint_code_id: 'code-2',
        code: 'SUNROOF_NOISE',
        title: 'Sunroof Track Greasing & Alignment',
        description: 'Sunroof squeak on tilt and slide',
        complaint_type: 'STANDARD',
        voc: 'Creaking noise on uneven roads',
        origin: 'ORIGINAL',
        request_id: null,
        rework_cycle: null,
        is_dropped: false,
        jobs: [
          { id: 'j-103', job_code_id: 'jc-3', code: 'SUN_LUBE', description: 'Panoramic Guide Lubrication', std_hours: 0.7, job_category: 'GENERAL' },
        ],
      },
    ],
  },
  {
    id: 'jc-2',
    jc_number: 'JC-2026-0092',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    registration_no: 'MH14EV2201',
    vin: 'MAT748399P3K99014',
    model: 'Nexon EV Empowered+',
    product_line: 'EV',
    customer_name: 'Sneha Deshmukh',
    customer_mobile: '9422039182',
    service_type: 'Running Repair & BMS Update',
    service_advisor: 'Pooja Nair',
    washing_supervisor: 'Babu Lal',
    ptd: atMinutes(TODAY, 15 * 60), // 15:00 today
    jc_opened_at: atMinutes(TODAY, 9 * 60),
    special_request: 'Fast charge battery up to 80% before delivery',
    washing_required: false,
    prewash_done: false,
    is_revisit: true,
    is_repeat_complaint: false,
    is_express: false,
    rework_cycle: 0,
    post_repair_stage: null,
    is_cancelled: false,
    cancel_reason: null,
    complaints: [
      {
        id: 'cc-201',
        complaint_code_id: 'code-3',
        code: 'BMS_FLASH',
        title: 'BMS Firmware Flash v4.2.1',
        description: 'High voltage BMS controller update and cell balancing test',
        complaint_type: 'UPDATION',
        voc: 'Occasional charging stall at DC fast chargers',
        origin: 'ORIGINAL',
        request_id: null,
        rework_cycle: null,
        is_dropped: false,
        jobs: [
          { id: 'j-201', job_code_id: 'jc-4', code: 'FLASH_BMS', description: 'ECU Reflash & Diagnostic Scan', std_hours: 1.2, job_category: 'SPEEDO' },
        ],
      },
    ],
  },
  {
    id: 'jc-3',
    jc_number: 'JC-2026-0104',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    registration_no: 'MH12PQ8899',
    vin: 'MAT551100M1K44991',
    model: 'Safari Accomplished+ 6S',
    product_line: 'SUV',
    customer_name: 'Dr. Sameer Joshi',
    customer_mobile: '9890123456',
    service_type: 'Brake Overhaul',
    service_advisor: 'Rohit Kulkarni',
    washing_supervisor: null,
    ptd: atMinutes(TODAY, 18 * 60),
    jc_opened_at: atMinutes(TODAY, 9 * 60 + 15),
    special_request: null,
    washing_required: true,
    prewash_done: false,
    is_revisit: false,
    is_repeat_complaint: false,
    is_express: false,
    rework_cycle: 0,
    post_repair_stage: null,
    is_cancelled: false,
    cancel_reason: null,
    complaints: [
      {
        id: 'cc-301',
        complaint_code_id: 'code-4',
        code: 'BRK_REPLACE',
        title: 'Front & Rear Disc Pad Replacement',
        description: 'Replace worn pads and machine brake rotors',
        complaint_type: 'STANDARD',
        voc: 'Brake pedal spongy and pulsation on high speed braking',
        origin: 'ORIGINAL',
        request_id: null,
        rework_cycle: null,
        is_dropped: false,
        jobs: [
          { id: 'j-301', job_code_id: 'jc-5', code: 'ROTOR_TURN', description: 'Lathe Turning of Front Rotors', std_hours: 1.5, job_category: 'GENERAL' },
        ],
      },
      {
        id: 'cc-302',
        complaint_code_id: 'code-6',
        code: 'BRK_FLUID',
        title: 'Brake Hydraulic Fluid Bleed & Flush',
        description: 'Complete DOT4 brake fluid replacement and pressure test',
        complaint_type: 'STANDARD',
        voc: 'Preventive fluid maintenance',
        origin: 'ORIGINAL',
        request_id: null,
        rework_cycle: null,
        is_dropped: false,
        jobs: [
          { id: 'j-302', job_code_id: 'jc-7', code: 'BLEED_FLUID', description: 'Hydraulic System Bleeding', std_hours: 0.5, job_category: 'GENERAL' },
        ],
      },
    ],
  },
  {
    id: 'jc-4',
    jc_number: 'JC-2026-0118',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    registration_no: 'MH14TC0023',
    vin: 'MAT332211L0K77123',
    model: 'Punch Creative i-CNG',
    product_line: 'Car',
    customer_name: 'Sunita Gaikwad',
    customer_mobile: '9765432109',
    service_type: 'First Free Service',
    service_advisor: 'Priya Sharma',
    washing_supervisor: 'Babu Lal',
    ptd: atMinutes(TODAY, 14 * 60),
    jc_opened_at: atMinutes(TODAY, 8 * 60 + 30),
    special_request: 'Washing must be done before 1:30 PM',
    washing_required: true,
    prewash_done: true,
    is_revisit: false,
    is_repeat_complaint: false,
    is_express: true,
    rework_cycle: 0,
    post_repair_stage: null,
    is_cancelled: false,
    cancel_reason: null,
    complaints: [
      {
        id: 'cc-401',
        complaint_code_id: 'code-5',
        code: 'FREE1',
        title: '1st Free Inspection Service',
        description: 'General inspection, fluid level top-ups, CNG pressure leak check',
        complaint_type: 'STANDARD',
        voc: 'General health check',
        origin: 'ORIGINAL',
        request_id: null,
        rework_cycle: null,
        is_dropped: false,
        jobs: [
          { id: 'j-401', job_code_id: 'jc-6', code: 'FREE_CHK', description: 'First Service Labor Check', std_hours: 0.6, job_category: 'WASHING' },
        ],
      },
    ],
  },
  {
    id: 'jc-5',
    jc_number: 'JC-2026-0120',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    registration_no: 'MH12RN7788',
    vin: 'MAT998877A1B22334',
    model: 'Curvv EV Empowered+ 55',
    product_line: 'EV',
    customer_name: 'Aniket Deshpande',
    customer_mobile: '9822998877',
    service_type: '20,000 km Service',
    service_advisor: 'Rohit Kulkarni',
    washing_supervisor: 'Babu Lal',
    ptd: atMinutes(TODAY, 18 * 60),
    jc_opened_at: atMinutes(TODAY, 9 * 60),
    special_request: null,
    washing_required: true,
    prewash_done: true,
    is_revisit: false,
    is_repeat_complaint: false,
    is_express: false,
    rework_cycle: 0,
    post_repair_stage: 'QC_IN_QUEUE',
    is_cancelled: false,
    cancel_reason: null,
    complaints: [],
  },
  {
    id: 'jc-6',
    jc_number: 'JC-2026-0121',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    registration_no: 'MH14AB9090',
    vin: 'MAT998877A1B22335',
    model: 'Nexon Dark Edition',
    product_line: 'SUV',
    customer_name: 'Priya Kulkarni',
    customer_mobile: '9822998878',
    service_type: 'General Checkup',
    service_advisor: 'Rohit Kulkarni',
    washing_supervisor: 'Babu Lal',
    ptd: atMinutes(TODAY, 18 * 60),
    jc_opened_at: atMinutes(TODAY, 9 * 60),
    special_request: null,
    washing_required: true,
    prewash_done: true,
    is_revisit: false,
    is_repeat_complaint: false,
    is_express: false,
    rework_cycle: 0,
    post_repair_stage: 'QC_IN_QUEUE',
    is_cancelled: false,
    cancel_reason: null,
    complaints: [],
  },
  {
    id: 'jc-7',
    jc_number: 'JC-2026-0122',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    registration_no: 'MH12CD5656',
    vin: 'MAT998877A1B22336',
    model: 'Altroz Racer i-Turbo',
    product_line: 'Car',
    customer_name: 'Vikram Shinde',
    customer_mobile: '9822998879',
    service_type: 'Minor Service',
    service_advisor: 'Priya Sharma',
    washing_supervisor: 'Babu Lal',
    ptd: atMinutes(TODAY, 18 * 60),
    jc_opened_at: atMinutes(TODAY, 9 * 60),
    special_request: null,
    washing_required: true,
    prewash_done: true,
    is_revisit: false,
    is_repeat_complaint: false,
    is_express: false,
    rework_cycle: 0,
    post_repair_stage: 'QC_WIP',
    is_cancelled: false,
    cancel_reason: null,
    complaints: [],
  },
  {
    id: 'jc-8',
    jc_number: 'JC-2026-0123',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    registration_no: 'MH12EF7878',
    vin: 'MAT998877A1B22337',
    model: 'Tiago EV Long Range',
    product_line: 'EV',
    customer_name: 'Suresh More',
    customer_mobile: '9822998880',
    service_type: 'AC Service',
    service_advisor: 'Pooja Nair',
    washing_supervisor: 'Babu Lal',
    ptd: atMinutes(TODAY, 17 * 60),
    jc_opened_at: atMinutes(TODAY, 8 * 60),
    special_request: null,
    washing_required: true,
    prewash_done: false,
    is_revisit: false,
    is_repeat_complaint: false,
    is_express: false,
    rework_cycle: 0,
    post_repair_stage: 'WASH_WIP_WASHING',
    is_cancelled: false,
    cancel_reason: null,
    complaints: [],
  },
  {
    id: 'jc-9',
    jc_number: 'JC-2026-0124',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    registration_no: 'MH14GH1010',
    vin: 'MAT998877A1B22338',
    model: 'Punch EV Smart+',
    product_line: 'EV',
    customer_name: 'Kiran Pawar',
    customer_mobile: '9822998881',
    service_type: 'Brake Pad Replacement',
    service_advisor: 'Rohit Kulkarni',
    washing_supervisor: 'Babu Lal',
    ptd: atMinutes(TODAY, 17 * 60 + 30),
    jc_opened_at: atMinutes(TODAY, 9 * 60),
    special_request: null,
    washing_required: true,
    prewash_done: true,
    is_revisit: false,
    is_repeat_complaint: false,
    is_express: false,
    rework_cycle: 0,
    post_repair_stage: 'WASH_IN_QUEUE',
    is_cancelled: false,
    cancel_reason: null,
    complaints: [],
  },
  {
    id: 'jc-10',
    jc_number: 'JC-2026-0125',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    registration_no: 'MH12IJ4040',
    vin: 'MAT998877A1B22339',
    model: 'Harrier Fearless Red',
    product_line: 'SUV',
    customer_name: 'Amitabh Joshi',
    customer_mobile: '9822998882',
    service_type: 'Periodic Service',
    service_advisor: 'Rohit Kulkarni',
    washing_supervisor: 'Babu Lal',
    ptd: atMinutes(TODAY, 16 * 60),
    jc_opened_at: atMinutes(TODAY, 8 * 60),
    special_request: null,
    washing_required: true,
    prewash_done: true,
    is_revisit: false,
    is_repeat_complaint: false,
    is_express: false,
    rework_cycle: 0,
    post_repair_stage: 'READY_FOR_DELIVERY',
    is_cancelled: false,
    cancel_reason: null,
    complaints: [],
  },
  {
    id: 'jc-11',
    jc_number: 'JC-2026-0126',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    registration_no: 'MH14KL5050',
    vin: 'MAT998877A1B22340',
    model: 'Safari Adventure Persona',
    product_line: 'SUV',
    customer_name: 'Deepak Patil',
    customer_mobile: '9822998883',
    service_type: 'Wheel Alignment & Balancing',
    service_advisor: 'Priya Sharma',
    washing_supervisor: 'Babu Lal',
    ptd: atMinutes(TODAY, 16 * 60 + 30),
    jc_opened_at: atMinutes(TODAY, 9 * 60),
    special_request: null,
    washing_required: true,
    prewash_done: true,
    is_revisit: false,
    is_repeat_complaint: false,
    is_express: false,
    rework_cycle: 0,
    post_repair_stage: 'READY_FOR_DELIVERY',
    is_cancelled: false,
    cancel_reason: null,
    complaints: [],
  },
  {
    id: 'jc-12',
    jc_number: 'JC-2026-0127',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    registration_no: 'MH12MN6060',
    vin: 'MAT998877A1B22341',
    model: 'Nexon EV Max',
    product_line: 'EV',
    customer_name: 'Sachin Tendulkar',
    customer_mobile: '9822998884',
    service_type: 'Rework Inspection',
    service_advisor: 'Rohit Kulkarni',
    washing_supervisor: 'Babu Lal',
    ptd: atMinutes(TODAY, 17 * 60),
    jc_opened_at: atMinutes(TODAY, 9 * 60),
    special_request: null,
    washing_required: true,
    prewash_done: true,
    is_revisit: true,
    is_repeat_complaint: true,
    is_express: false,
    rework_cycle: 1,
    post_repair_stage: 'REWORK_BAY_NOT_ASSIGNED',
    is_cancelled: false,
    cancel_reason: null,
    complaints: [],
  },
];

const SEED_REFERENCES: JobCardReference[] = [
  {
    id: 'ref-1',
    job_card_id: 'jc-1',
    ref_type: 'MR',
    ref_number: 'MR-2026-9041',
    status: 'OPEN',
    parts: [
      { part_no: '542450100142', description: 'PANORAMIC SUNROOF GUIDE SLIDER RH', order_no: 'ORD-7712' },
      { part_no: '287109200119', description: 'SYNTHETIC GREASE FOR TRACK LUBRICATION', order_no: 'ORD-7713' },
    ],
  },
  {
    id: 'ref-2',
    job_card_id: 'jc-1',
    ref_type: 'CUSTOMER_APPROVAL',
    ref_number: 'EST-2026-4410',
    status: 'OPEN',
    parts: null,
  },
];

const SEED_OPERATIONAL_HOURS: OperationalHoursRow[] = [
  { division_id: 'div-1', day_of_week: 1, specific_date: null, is_closed: false, open_time: '08:30', close_time: '18:30' },
  { division_id: 'div-1', day_of_week: 2, specific_date: null, is_closed: false, open_time: '08:30', close_time: '18:30' },
  { division_id: 'div-1', day_of_week: 3, specific_date: null, is_closed: false, open_time: '08:30', close_time: '18:30' },
  { division_id: 'div-1', day_of_week: 4, specific_date: null, is_closed: false, open_time: '08:30', close_time: '18:30' },
  { division_id: 'div-1', day_of_week: 5, specific_date: null, is_closed: false, open_time: '08:30', close_time: '18:30' },
  { division_id: 'div-1', day_of_week: 6, specific_date: null, is_closed: false, open_time: '08:30', close_time: '18:30' },
  { division_id: 'div-1', day_of_week: 0, specific_date: null, is_closed: true, open_time: null, close_time: null }, // Sunday closed
];

// Initial scheduled chip in Mechanical Bay 1 (Scheduled 09:30 - 11:30)
const SEED_CHIPS: Chip[] = [
  {
    id: 'chip-101',
    job_card_id: 'jc-1',
    bay_id: 'bay-1',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    chip_date: TODAY,
    planned_start: atMinutes(TODAY, 9 * 60 + 30),
    planned_end: atMinutes(TODAY, 11 * 60 + 30),
    actual_start: atMinutes(TODAY, 9 * 60 + 35),
    actual_end: null,
    paused_at: null,
    ptd: atMinutes(TODAY, 17 * 60 + 30),
    status: 'IN_PROGRESS',
    pause_reason_code: null,
    pause_reference: null,
    technician_id: null,
    tech_supervisor_id: 'sup-1',
    quality_inspector_id: 'qi-1',
    is_cancelled: false,
    version: 1,
    complaints: [
      {
        id: 'chip-line-1',
        job_card_complaint_id: 'cc-101',
        job_card_job_ids: null,
        status: 'IN_PROGRESS',
        actual_start: atMinutes(TODAY, 9 * 60 + 35),
        actual_end: null,
        road_test: false,
        det_id: null,
        remarks: null,
      },
    ],
  },
  {
    id: 'chip-102',
    job_card_id: 'jc-2',
    bay_id: 'bay-2',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    chip_date: TODAY,
    planned_start: atMinutes(TODAY, 11 * 60 + 30),
    planned_end: atMinutes(TODAY, 13 * 60),
    actual_start: atMinutes(TODAY, 11 * 60 + 35),
    actual_end: null,
    paused_at: atMinutes(TODAY, 12 * 60),
    ptd: atMinutes(TODAY, 15 * 60),
    status: 'ON_HOLD',
    pause_reason_code: 'PR_MR',
    pause_reference: 'MR-2026-9041',
    technician_id: 'tech-3',
    tech_supervisor_id: 'sup-1',
    quality_inspector_id: 'qi-1',
    is_cancelled: false,
    version: 1,
    complaints: [
      {
        id: 'chip-line-2',
        job_card_complaint_id: 'cc-201',
        job_card_job_ids: null,
        status: 'ON_HOLD',
        actual_start: atMinutes(TODAY, 11 * 60 + 35),
        actual_end: null,
        road_test: false,
        det_id: null,
        remarks: 'Waiting for parts from spares counter',
      },
    ],
  },
  {
    id: 'chip-103',
    job_card_id: 'jc-4',
    bay_id: 'bay-3',
    dealer_id: 'dlr-1',
    division_id: 'div-1',
    bu_id: 'PV',
    chip_date: TODAY,
    planned_start: atMinutes(TODAY, 10 * 60),
    planned_end: atMinutes(TODAY, 11 * 60),
    actual_start: null,
    actual_end: null,
    paused_at: null,
    ptd: atMinutes(TODAY, 14 * 60),
    status: 'NOT_STARTED',
    pause_reason_code: null,
    pause_reference: null,
    technician_id: null,
    tech_supervisor_id: 'sup-2',
    quality_inspector_id: 'qi-2',
    is_cancelled: false,
    version: 1,
    complaints: [
      {
        id: 'chip-line-3',
        job_card_complaint_id: 'cc-401',
        job_card_job_ids: null,
        status: 'NOT_STARTED',
        actual_start: null,
        actual_end: null,
        road_test: false,
        det_id: null,
        remarks: null,
      },
    ],
  },
];

// In-Memory Store
let storeBays = [...SEED_BAYS];
let storeJobCards = [...SEED_JOB_CARDS];
let storeChips = [...SEED_CHIPS];
let storeStaff = [...SEED_STAFF];
let storeReferences = [...SEED_REFERENCES];
let storeOperationalHours = [...SEED_OPERATIONAL_HOURS];

function buildChipView(chip: Chip, jc: JobCard, now: number): ChipView {
  const isDelayed = isChipDelayed(chip, now);
  const isLateStart = chip.actual_start ? toMs(chip.actual_start) > toMs(chip.planned_start) + 15 * 60_000 : false;
  const ccOriginRework = chip.complaints.some((c) => {
    const orig = jc.complaints.find((x) => x.id === c.job_card_complaint_id)?.origin;
    return orig === 'REWORK';
  });
  const ccOriginAdd = chip.complaints.some((c) => {
    const orig = jc.complaints.find((x) => x.id === c.job_card_complaint_id)?.origin;
    return orig === 'ADDITIONAL';
  });

  return {
    job_chip_id: chip.id,
    job_card_id: chip.job_card_id,
    bay_id: chip.bay_id,
    registration_no: jc.registration_no,
    jc_short: jc.jc_number.replace('JC-2026-', '#'),
    model: jc.model || '',
    service_type: jc.service_type || '',
    service_advisor: jc.service_advisor || '',
    planned_start: chip.planned_start,
    planned_end: chip.planned_end,
    actual_start: chip.actual_start,
    actual_end: chip.actual_end,
    paused_at: chip.paused_at,
    ptd: jc.ptd,
    status: chip.status,
    is_delayed: isDelayed,
    is_late_start: isLateStart,
    pause_reason_code: chip.pause_reason_code,
    pause_reference: chip.pause_reference,
    tags: {
      revisit: jc.is_revisit,
      repeat_complaint: jc.is_repeat_complaint,
      additional_blink: ccOriginAdd,
      rework_blink: ccOriginRework,
      rework_chip: ccOriginRework,
    },
    complaint_codes: chip.complaints.map((c) => {
      const parent = jc.complaints.find((p) => p.id === c.job_card_complaint_id);
      return {
        id: c.id,
        code: parent?.code || 'CC',
        title: parent?.title || '',
        status: c.status,
        actual_start: c.actual_start,
        actual_end: c.actual_end,
        road_test: c.road_test,
      };
    }),
  };
}

export const api = {
  async getCalendar(_divisionId = 'div-1', date: string): Promise<CalendarView> {
    const now = Date.now();
    const today = istDate(now);
    const win = resolveOperationalWindow(date, storeOperationalHours);
    const nonOpBands = nonOperationalBands(win);

    const activeChips = storeChips.filter((c) => c.chip_date === date && !c.is_cancelled);
    const summaries = baySummaries(storeBays, activeChips, now);

    const bays = storeBays.map((bay) => {
      const bayChips = activeChips
        .filter((c) => c.bay_id === bay.id)
        .map((chip) => {
          const jc = storeJobCards.find((j) => j.id === chip.job_card_id) || SEED_JOB_CARDS[0];
          return buildChipView(chip, jc, now);
        });

      const delayed = bayChips.filter((c) => c.is_delayed).length;
      const techList = technicianPresence(bay, activeChips, storeStaff);

      return {
        ...bay,
        bay_id: bay.id,
        delayed_count: delayed,
        job_chips: bayChips,
        technicians: techList,
      };
    });

    return {
      date,
      division_id: 'div-1',
      is_today: date === today,
      is_past: date < today,
      operational_window: win,
      non_operational_bands: nonOpBands,
      summary: summaries,
      bays,
    };
  },

  async getMasters(_divisionId = 'div-1'): Promise<MastersData> {
    return {
      bays: storeBays,
      technicians: storeStaff.filter((s) => s.role === 'TECHNICIAN'),
      techSupervisors: storeStaff.filter((s) => s.role === 'TECH_SUPERVISOR'),
      qualityInspectors: storeStaff.filter((s) => s.role === 'QUALITY_INSPECTOR'),
      dets: storeStaff.filter((s) => s.role === 'DET'),
      pauseReasons: SEED_PAUSE_REASONS,
    };
  },

  async getJobCard(jobCardId: string): Promise<JobCardDetailsView> {
    const jc = storeJobCards.find((j) => j.id === jobCardId);
    if (!jc) throw new ApiError('Job Card not found');

    const asgn = assignmentForJobCard(jc, storeChips);
    const now = Date.now();
    const chips = storeChips.filter((c) => c.job_card_id === jc.id && !c.is_cancelled);

    const complaintsWithMeta = jc.complaints.map((cc) => {
      const meta = asgn.complaints.find((a) => a.job_card_complaint_id === cc.id);
      return {
        ...cc,
        total_hours: meta?.total_hours || 1.0,
        assigned_job_ids: meta?.assigned_job_ids || [],
        is_fully_assigned: meta?.is_fully_assigned || false,
      };
    });

    return {
      job_card: {
        ...jc,
        ptd_overdue: now > toMs(jc.ptd),
        assignment_status: asgn.status,
        work_status: asgn.status === 'FULLY_ASSIGNED' ? 'IN_PROGRESS' : 'NOT_STARTED',
        washing_eligible: jc.washing_required || true,
      },
      complaints: complaintsWithMeta,
      chips,
    };
  },

  async getBaySequence(bayId: string | undefined, date: string, durationMin: number) {
    if (!bayId) return null;
    const bay = storeBays.find((b) => b.id === bayId);
    if (!bay) return null;
    const now = Date.now();
    const win = resolveOperationalWindow(date, storeOperationalHours);
    const dayChips = storeChips.filter((c) => c.bay_id === bayId && c.chip_date === date && !c.is_cancelled);

    const suggested = suggestNextSlot(bay, date, dayChips, win, durationMin, now);

    return {
      bay_id: bayId,
      operational_window: win,
      suggested_start_minutes: suggested,
      chips: dayChips.map((c) => {
        const jc = storeJobCards.find((j) => j.id === c.job_card_id);
        return {
          job_chip_id: c.id,
          registration_no: jc?.registration_no,
          planned_start: c.planned_start,
          planned_end: c.planned_end,
          status: c.status,
          paused_at: c.paused_at,
          actual_start: c.actual_start,
        };
      }),
    };
  },

  async validateDrafts(drafts: ChipDraft[]) {
    const now = Date.now();
    const res = validateDrafts(drafts, {
      now,
      bays: storeBays,
      jobCards: storeJobCards,
      chips: storeChips,
      operationalHours: storeOperationalHours,
    });
    return {
      is_valid: res.ok,
      errors: res.errors,
      warnings: res.warnings,
      total_hours: res.total_hours,
    };
  },

  async createChips(payload: {
    chips: ChipDraft[];
    confirm_ptd_warning?: boolean;
    washing_required?: boolean;
    prewash_done?: boolean;
  }) {
    const val = await this.validateDrafts(payload.chips);
    if (!val.is_valid) {
      throw new ApiError('Validation failed', val.errors);
    }
    if (val.warnings.length > 0 && !payload.confirm_ptd_warning) {
      throw new ApiError('Requires confirmation', val.warnings, true);
    }

    const createdChips: Chip[] = [];
    payload.chips.forEach((d, idx) => {
      const jc = storeJobCards.find((j) => j.id === d.job_card_id)!;
      const bay = storeBays.find((b) => b.id === d.bay_id)!;
      const id = `chip-${Date.now()}-${idx}`;
      const chip: Chip = {
        id,
        job_card_id: d.job_card_id,
        bay_id: d.bay_id,
        dealer_id: bay.dealer_id,
        division_id: bay.division_id,
        bu_id: bay.bu_id,
        chip_date: istDate(d.planned_start),
        planned_start: d.planned_start,
        planned_end: d.planned_end,
        actual_start: null,
        actual_end: null,
        paused_at: null,
        ptd: jc.ptd,
        status: 'NOT_STARTED',
        pause_reason_code: null,
        pause_reference: null,
        technician_id: d.technician_id || null,
        tech_supervisor_id: d.tech_supervisor_id || 'sup-1',
        quality_inspector_id: d.quality_inspector_id || 'qi-1',
        is_cancelled: false,
        version: 1,
        complaints: d.lines.map((l, i) => ({
          id: `${id}-cc${i}`,
          job_card_complaint_id: l.job_card_complaint_id,
          job_card_job_ids: l.job_card_job_ids || null,
          status: 'NOT_STARTED',
          actual_start: null,
          actual_end: null,
          road_test: !!l.road_test,
          det_id: l.det_id || null,
          remarks: null,
        })),
      };
      createdChips.push(chip);
      storeChips.push(chip);
    });

    const jc = storeJobCards.find((j) => j.id === payload.chips[0].job_card_id)!;
    if (payload.washing_required !== undefined) jc.washing_required = payload.washing_required;
    if (payload.prewash_done !== undefined) jc.prewash_done = payload.prewash_done;

    const asgn = assignmentForJobCard(jc, storeChips);
    return {
      job_chips: createdChips,
      job_card: {
        ...jc,
        assignment_status: asgn.status,
      },
    };
  },

  async rescheduleChip(chipId: string, body: { planned_start: string; planned_end: string; confirm_ptd_warning?: boolean }) {
    const chip = storeChips.find((c) => c.id === chipId);
    if (!chip) throw new ApiError('Chip not found');

    const draft: ChipDraft = {
      job_card_id: chip.job_card_id,
      bay_id: chip.bay_id,
      planned_start: body.planned_start,
      planned_end: body.planned_end,
      lines: chip.complaints.map((c) => ({
        job_card_complaint_id: c.job_card_complaint_id,
        job_card_job_ids: c.job_card_job_ids,
        road_test: c.road_test,
        det_id: c.det_id,
      })),
      tech_supervisor_id: chip.tech_supervisor_id,
      quality_inspector_id: chip.quality_inspector_id,
      technician_id: chip.technician_id,
    };

    const otherChips = storeChips.filter((c) => c.id !== chipId);
    const now = Date.now();
    const res = validateDrafts([draft], {
      now,
      bays: storeBays,
      jobCards: storeJobCards,
      chips: otherChips,
      operationalHours: storeOperationalHours,
    });

    if (!res.ok) {
      throw new ApiError('Reschedule validation failed', res.errors);
    }
    if (res.warnings.length > 0 && !body.confirm_ptd_warning) {
      throw new ApiError('PTD Near Confirmation required', res.warnings, true);
    }

    chip.planned_start = body.planned_start;
    chip.planned_end = body.planned_end;
    chip.chip_date = istDate(body.planned_start);
    chip.version += 1;

    return chip;
  },

  async chipAction(chipId: string, action: string, body: { pause?: any; delay_reason?: string | null }) {
    const now = Date.now();
    const res = applyChipAction(
      {
        chip_id: chipId,
        action: action as any,
        pause: body.pause,
        delay_reason: body.delay_reason,
      },
      {
        now,
        role: 'JOB_CONTROLLER',
        bays: storeBays,
        chips: storeChips,
        jobCards: storeJobCards,
        references: storeReferences,
        pauseReasons: SEED_PAUSE_REASONS,
      }
    );

    if (!res.ok) {
      throw new ApiError(res.issue?.title || 'Action failed', res.issue ? [res.issue] : []);
    }

    if (res.chip) {
      const idx = storeChips.findIndex((c) => c.id === chipId);
      if (idx !== -1) storeChips[idx] = res.chip;
    }

    return res;
  },

  async unassignedJobs(_divisionId = 'div-1', _date: string) {
    return storeJobCards
      .filter((jc) => !jc.is_cancelled)
      .map((jc) => {
        const asgn = assignmentForJobCard(jc, storeChips);
        return {
          job_card_id: jc.id,
          jc_number: jc.jc_number,
          registration_no: jc.registration_no,
          model: jc.model,
          service_type: jc.service_type,
          service_advisor: jc.service_advisor,
          ptd: jc.ptd,
          ptd_overdue: Date.now() > toMs(jc.ptd),
          unassigned_hours: asgn.unassigned_hours,
          unassigned_complaints: asgn.unassigned_complaints,
          total_complaints: asgn.total_complaints,
          has_additional_pending: asgn.has_additional_pending,
          has_rework_pending: asgn.has_rework_pending,
          status: asgn.status,
        };
      })
      .filter((item) => item.status !== 'FULLY_ASSIGNED');
  },

  async getStatusBoard(_divisionId = 'div-1') {
    const now = Date.now();
    return buildStatusBoard(storeJobCards, storeChips, now);
  },

  async search(query: string, _page = 1) {
    const q = query.trim().toLowerCase();
    const hits = storeJobCards.filter((jc) =>
      jc.registration_no.toLowerCase().includes(q) ||
      jc.jc_number.toLowerCase().includes(q) ||
      (jc.customer_name && jc.customer_name.toLowerCase().includes(q))
    );
    return {
      results: hits.map((jc) => ({
        id: jc.id,
        jc_number: jc.jc_number,
        registration_no: jc.registration_no,
        model: jc.model,
        customer_name: jc.customer_name,
        service_type: jc.service_type,
        ptd: jc.ptd,
      })),
    };
  },

  async moveStage(jobCardId: string, body: { target_stage: PostRepairStage }) {
    const jc = storeJobCards.find((j) => j.id === jobCardId);
    if (!jc) throw new ApiError('Job card not found');
    jc.post_repair_stage = body.target_stage;
    return jc;
  },
};
