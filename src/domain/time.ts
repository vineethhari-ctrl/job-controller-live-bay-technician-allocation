/**
 * Time and IST calculation utilities for Job Controller.
 * Workshop operates in IST (UTC+05:30).
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function toMs(value: string | number): number {
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function istDate(msOrIso: string | number): string {
  const ms = toMs(msOrIso);
  const istDateObj = new Date(ms + IST_OFFSET_MS);
  return istDateObj.toISOString().slice(0, 10);
}

export function toIstIso(msOrIso: string | number): string {
  const ms = toMs(msOrIso);
  const d = new Date(ms + IST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  const seconds = pad(d.getUTCSeconds());
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+05:30`;
}

export function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.getUTCDay(); // 0 = Sunday
}

export function minutesInDay(msOrIso: string | number, _date?: string): number {
  const ms = toMs(msOrIso);
  const d = new Date(ms + IST_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function minutesToHhmm(minutes: number): string {
  const m = Math.max(0, Math.min(1439, Math.floor(minutes)));
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function hhmmToMinutes(hhmm: string): number {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function atMinutes(dateStr: string, minutes: number): string {
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dateStr}T${pad(hh)}:${pad(mm)}:00+05:30`;
}

export function overlaps(s1: number, e1: number, s2: number, e2: number): boolean {
  return s1 < e2 && s2 < e1;
}

export function fmtTime(msOrIso: string | number | null | undefined): string {
  if (!msOrIso) return '—';
  const ms = toMs(msOrIso);
  const d = new Date(ms + IST_OFFSET_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function fmtDateLabel(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function fmtDateTime(msOrIso: string | number | null | undefined): string {
  if (!msOrIso) return '—';
  const ms = toMs(msOrIso);
  const d = new Date(ms + IST_OFFSET_MS);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const month = months[d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month}, ${hh}:${mm}`;
}

export function fmtHours(hours: number): string {
  const h = Number(hours) || 0;
  return `${h.toFixed(1)}h`;
}
