/**
 * Shared domain types — Live Bay & Technician Allocation (Job Controller module).
 */

export type BuId = 'PV' | 'EV';

export type BayType =
  | 'MECHANICAL'
  | 'BODYSHOP'
  | 'ELECTRICAL'
  | 'EXPRESS'
  | 'ALIGNMENT'
  | 'WASHING'
  | 'GENERAL'
  | 'VIRTUAL';

export const BAY_TYPES: BayType[] = [
  'MECHANICAL', 'BODYSHOP', 'ELECTRICAL', 'EXPRESS', 'ALIGNMENT', 'WASHING', 'GENERAL', 'VIRTUAL',
];

export const BAY_TYPE_LABEL: Record<BayType, string> = {
  MECHANICAL: 'Mechanical',
  BODYSHOP: 'Bodyshop',
  ELECTRICAL: 'Electrical',
  EXPRESS: 'Express',
  ALIGNMENT: 'Alignment',
  WASHING: 'Washing',
  GENERAL: 'General',
  VIRTUAL: 'Virtual',
};

export type WorkStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED';
export type AssignmentStatus = 'NOT_ASSIGNED' | 'PARTIALLY_ASSIGNED' | 'FULLY_ASSIGNED';
export type ComplaintOrigin = 'ORIGINAL' | 'ADDITIONAL' | 'REWORK';
export type ComplaintType = 'STANDARD' | 'UPDATION' | 'REWORK' | 'VAS';
export type Role = 'JOB_CONTROLLER' | 'TECH_SUPERVISOR' | 'TECHNICIAN';
export type StaffRole =
  | 'JOB_CONTROLLER'
  | 'TECH_SUPERVISOR'
  | 'TECHNICIAN'
  | 'QUALITY_INSPECTOR'
  | 'DET'
  | 'SERVICE_ADVISOR'
  | 'WASHING_SUPERVISOR';

export type PostRepairStage =
  | 'QC_IN_QUEUE'
  | 'QC_WIP'
  | 'REWORK_BAY_NOT_ASSIGNED'
  | 'REWORK_WIP'
  | 'WASH_IN_QUEUE'
  | 'WASH_WIP_WASHING'
  | 'WASH_WIP_INSPECTION'
  | 'READY_FOR_DELIVERY';

export type ChipAction = 'START' | 'PAUSE' | 'RESUME' | 'COMPLETE' | 'END';

export interface Division {
  division_id: string;
  dealer_id: string;
  bu_id: BuId;
  name: string;
  code: string;
}

export interface Staff {
  id: string;
  division_id: string;
  bu_id: BuId;
  full_name: string;
  role: StaffRole;
  is_logged_in?: boolean;
}

export interface BayTechnician {
  technician_id: string;
  name: string;
  slot_no: number;
}

export interface Bay {
  id: string;
  dealer_id: string;
  division_id: string;
  bu_id: BuId;
  bay_name: string;
  bay_type: BayType;
  sequence_no: number;
  is_active: boolean;
  technicians: BayTechnician[];
  supervisor_id: string | null;
}

export interface OperationalHoursRow {
  division_id: string;
  day_of_week: number | null; // 0 = Sunday
  specific_date: string | null; // YYYY-MM-DD (overrides weekly)
  is_closed: boolean;
  open_time: string | null; // HH:mm
  close_time: string | null; // HH:mm
}

export interface ComplaintCode {
  id: string;
  code: string;
  title: string;
  description: string | null;
  complaint_type: ComplaintType;
}

export interface JobCode {
  id: string;
  complaint_code_id: string;
  code: string;
  description: string;
  std_hours: number;
  job_category: string | null;
}

export interface JobCardJob {
  id: string;
  job_code_id: string;
  code: string;
  description: string;
  std_hours: number;
  job_category: string | null;
}

export interface JobCardComplaint {
  id: string;
  complaint_code_id: string;
  code: string;
  title: string;
  description: string | null;
  complaint_type: ComplaintType;
  voc: string | null;
  origin: ComplaintOrigin;
  request_id: string | null;
  rework_cycle: number | null;
  is_dropped: boolean;
  jobs: JobCardJob[];
}

export interface JobCard {
  id: string;
  jc_number: string;
  dealer_id: string;
  division_id: string;
  bu_id: BuId;
  registration_no: string;
  vin: string | null;
  model: string | null;
  product_line: string | null;
  customer_name: string | null;
  customer_mobile: string | null;
  service_type: string | null;
  service_advisor: string | null;
  washing_supervisor: string | null;
  ptd: string;
  jc_opened_at: string;
  special_request: string | null;
  washing_required: boolean;
  prewash_done: boolean;
  is_revisit: boolean;
  is_repeat_complaint: boolean;
  is_express: boolean;
  rework_cycle: number;
  post_repair_stage: PostRepairStage | null;
  is_cancelled: boolean;
  cancel_reason: string | null;
  complaints: JobCardComplaint[];
}

export interface ChipComplaint {
  id: string;
  job_card_complaint_id: string;
  /** null = all job codes of the complaint; else the subset (General Bay job-code mode) */
  job_card_job_ids: string[] | null;
  status: WorkStatus;
  actual_start: string | null;
  actual_end: string | null;
  road_test: boolean;
  det_id: string | null;
  remarks: string | null;
}

export interface Chip {
  id: string;
  job_card_id: string;
  bay_id: string;
  dealer_id: string;
  division_id: string;
  bu_id: BuId;
  chip_date: string;
  planned_start: string;
  planned_end: string;
  actual_start: string | null;
  actual_end: string | null;
  paused_at: string | null;
  ptd: string;
  status: WorkStatus;
  pause_reason_code: string | null;
  pause_reference: string | null;
  technician_id: string | null;
  tech_supervisor_id: string;
  quality_inspector_id: string;
  is_cancelled: boolean;
  version: number;
  complaints: ChipComplaint[];
}

export type PauseDependency = 'NONE' | 'AUTO_REF' | 'MR_PARTS' | 'VENDOR_SELECT';
export type ReferenceType = 'MR' | 'THD' | 'CUSTOMER_APPROVAL' | 'HV_TICKET' | 'GOODWILL' | 'EXT_WARRANTY';

export interface PauseReason {
  code: string;
  label: string;
  dependency_type: PauseDependency;
  reference_type: ReferenceType | null;
  dependent_label: string | null;
  raise_hint: string | null;
  sort_order: number;
}

export interface MrPart {
  part_no: string;
  description: string;
  order_no: string | null;
}

export interface JobCardReference {
  id: string;
  job_card_id: string;
  ref_type: ReferenceType;
  ref_number: string;
  status: 'OPEN' | 'CLOSED';
  parts: MrPart[] | null;
}

export interface Notification {
  id: string;
  division_id: string;
  job_card_id: string | null;
  target_role: StaffRole;
  type: string;
  title: string;
  body: string;
  created_at: string;
}

/** Standard error/warning shape — title + detail pattern used across the FDD. */
export interface RuleIssue {
  code: string;
  title: string;
  detail: string;
  severity: 'error' | 'warning';
  /** index of the staged chip in a batch the issue relates to */
  draft_index?: number;
}

export interface ChipDraftLine {
  job_card_complaint_id: string;
  job_card_job_ids?: string[] | null;
  road_test?: boolean;
  det_id?: string | null;
}

export interface ChipDraft {
  job_card_id: string;
  bay_id: string;
  planned_start: string;
  planned_end: string;
  lines: ChipDraftLine[];
  tech_supervisor_id: string | null;
  quality_inspector_id: string | null;
  technician_id?: string | null;
}

export interface PausePayload {
  reason_code: string;
  reference?: string | null;
  part_nos?: string[];
  vendor?: string | null;
}

export const PTD_WARNING_MINUTES_DEFAULT = 60;
export const VENDOR_OPTIONS = ['Infotainment', 'Battery'] as const;
