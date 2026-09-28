import React from 'react';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, Clock, Search, ShieldCheck, UserCheck, Wrench, X, MapPin } from 'lucide-react';
import { useApp } from '../state/AppState';
import { Role } from '../domain/types';
import { BaySummary } from '../domain/rules';
import { fmtDateLabel, istDate } from '../domain/time';
import { cx } from './ui';

export function Header() {
  const app = useApp();

  const changeDate = (days: number) => {
    const cur = new Date(app.date);
    cur.setDate(cur.getDate() + days);
    app.setDate(istDate(cur.getTime()));
  };

  // Generate 8-day date navigation strip
  const baseDate = new Date(app.today);
  const dateTabs = Array.from({ length: 8 }).map((_, i) => {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    const dateStr = istDate(d.getTime());
    const isToday = dateStr === app.today;
    
    // Day label
    let label = '';
    if (isToday) {
      label = 'Today';
    } else {
      label = d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
    }

    // Mock count badge per day
    let count = 0;
    if (isToday) count = 24;
    else if (i === 1) count = 3;
    else count = 0;

    return { dateStr, label, count, isToday, isSelected: dateStr === app.date };
  });

  return (
    <header className="flex flex-col border-b border-slate-800 bg-slate-950 text-white shadow-md">
      {/* Top Navbar */}
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-4 border-b border-slate-900">
        {/* Logo & Branch Selector */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm ring-1 ring-white/20">
            <Wrench className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white leading-none">
                Live Bay &amp; Technician Allocation
              </h1>
              <span className="hidden md:inline-flex items-center rounded-full bg-brand-500/20 px-2 py-0.5 text-[9px] font-bold text-brand-300 ring-1 ring-brand-500/30">
                Demo data · in-browser API
              </span>
            </div>
          </div>

          {/* Dealership Dropdown */}
          <div className="hidden lg:flex items-center gap-1.5 ml-3 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1 text-xs font-semibold text-slate-200 shadow-inner">
            <MapPin className="h-3.5 w-3.5 text-brand-400" />
            <span>Rudra Motors – Andheri (W1)</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-1" />
          </div>
        </div>

        {/* Search & Role Mode */}
        <div className="flex items-center gap-3">
          {/* Search Box */}
          <div className="relative hidden sm:block w-48 md:w-64">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search Reg No or JC Number"
              value={app.searchQuery}
              onChange={(e) => app.setSearchQuery(e.target.value)}
              className="h-8 w-full rounded-md border border-slate-800 bg-slate-900 pl-8 pr-7 text-xs text-white placeholder:text-slate-500 focus:border-brand-500 focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {app.searchQuery && (
              <button
                onClick={() => app.setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Role Mode */}
          <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 p-0.5 text-[11px] font-bold">
            {(['JOB_CONTROLLER', 'TECH_SUPERVISOR', 'TECHNICIAN'] as Role[]).map((r) => (
              <button
                key={r}
                onClick={() => app.setRole(r)}
                className={cx(
                  'rounded px-2.5 py-1 transition cursor-pointer',
                  app.role === r ? 'bg-brand-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                )}
              >
                {r === 'JOB_CONTROLLER' ? 'Job Controller' : r === 'TECH_SUPERVISOR' ? 'Supervisor' : 'Technician'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Multi-Day Navigation Strip */}
      <div className="flex items-center justify-between overflow-x-auto thin-scroll bg-slate-900 px-3 py-1.5 gap-2 text-xs">
        <div className="flex items-center gap-1">
          <button
            onClick={() => changeDate(-1)}
            className="flex h-7 w-7 items-center justify-center rounded border border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
            title="Previous Day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Date Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto thin-scroll">
            {dateTabs.map((tab) => (
              <button
                key={tab.dateStr}
                onClick={() => app.setDate(tab.dateStr)}
                className={cx(
                  'flex items-center gap-1.5 rounded-md px-3 py-1 font-bold text-xs transition cursor-pointer whitespace-nowrap',
                  tab.isSelected
                    ? 'bg-white text-slate-950 shadow-sm ring-1 ring-white/50'
                    : 'bg-slate-950/80 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cx(
                    'rounded-full px-1.5 py-0.2 text-[10px] font-extrabold',
                    tab.isSelected ? 'bg-slate-900 text-white' : 'bg-slate-800 text-slate-300'
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={() => changeDate(1)}
            className="flex h-7 w-7 items-center justify-center rounded border border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
            title="Next Day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Quick Date Indicator & Reset */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] font-bold text-slate-300">
            <Calendar className="h-3.5 w-3.5 text-brand-400" />
            <span>{fmtDateLabel(app.date)}</span>
          </div>
          {app.date !== app.today && (
            <button
              onClick={() => app.setDate(app.today)}
              className="rounded bg-brand-600/30 border border-brand-500/40 px-2.5 py-1 text-[11px] font-bold text-brand-300 hover:bg-brand-600 hover:text-white transition cursor-pointer"
            >
              Back to today
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export function BayStatusStrip({
  summary,
  onJump,
}: {
  summary: BaySummary[];
  onJump: (bayId: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto thin-scroll border-b border-slate-200 bg-slate-100/90 px-3 py-1.5 text-xs shadow-xs">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
        Live Bays:
      </span>
      {summary.map((b) => (
        <button
          key={b.bay_id}
          onClick={() => onJump(b.bay_id)}
          className={cx(
            'flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-semibold transition hover:shadow-xs active:scale-[0.98] cursor-pointer text-xs',
            b.delayed_count > 0
              ? 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          )}
        >
          <span className="truncate max-w-[120px] font-medium">{b.bay_name}</span>
          {b.delayed_count > 0 ? (
            <span className="rounded-full bg-red-600 px-1.5 text-[9px] font-extrabold text-white">
              {b.delayed_count} delay
            </span>
          ) : (
            <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-bold text-slate-600">
              {b.in_progress_count > 0 ? `${b.in_progress_count} WIP` : 'Free'}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

