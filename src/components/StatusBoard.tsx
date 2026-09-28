import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Flag, Layers, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { useApp } from '../state/AppState';
import { useStatusBoard } from '../hooks/queries';
import { BucketKey, BoardTile } from '../domain/rules';
import { cx } from './ui';

export function StatusBoard() {
  const app = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const q = useStatusBoard(app.divisionId ?? undefined);
  const board = q.data;

  const buckets: Array<{
    key: BucketKey;
    label: string;
    icon: any;
    textColor: string;
    bgColor: string;
    badgeBg: string;
    badgeText: string;
  }> = [
    {
      key: 'JOB_STOP_PAUSED',
      label: 'Job Stop / Paused',
      icon: Wrench,
      textColor: 'text-fuchsia-800',
      bgColor: 'bg-fuchsia-50/80 border-fuchsia-200',
      badgeBg: 'bg-fuchsia-900',
      badgeText: 'text-white',
    },
    {
      key: 'QUALITY_CHECK',
      label: 'Quality Check',
      icon: ShieldCheck,
      textColor: 'text-amber-800',
      bgColor: 'bg-amber-50/80 border-amber-200',
      badgeBg: 'bg-amber-800',
      badgeText: 'text-white',
    },
    {
      key: 'REWORK',
      label: 'Rework Queue',
      icon: Wrench,
      textColor: 'text-red-800',
      bgColor: 'bg-red-50/80 border-red-200',
      badgeBg: 'bg-red-800',
      badgeText: 'text-white',
    },
    {
      key: 'WASHING',
      label: 'Washing',
      icon: Sparkles,
      textColor: 'text-sky-800',
      bgColor: 'bg-sky-50/80 border-sky-200',
      badgeBg: 'bg-sky-800',
      badgeText: 'text-white',
    },
    {
      key: 'READY_FOR_DELIVERY',
      label: 'Ready for Delivery',
      icon: Flag,
      textColor: 'text-emerald-800',
      bgColor: 'bg-emerald-50/80 border-emerald-200',
      badgeBg: 'bg-emerald-800',
      badgeText: 'text-white',
    },
  ];

  return (
    <div className="border-t border-slate-300 bg-slate-50 shadow-xl transition-all">
      <div className="flex h-9 items-center justify-between border-b border-slate-200 bg-white px-3 text-xs font-bold text-slate-800">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-brand-600" />
          <span className="tracking-tight">Workshop Post-Repair &amp; Staging Board</span>
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
        >
          <span>{collapsed ? 'Show Board' : 'Hide Board'}</span>
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 overflow-x-auto thin-scroll">
          {buckets.map((b) => {
            const tiles = board ? board[b.key] || [] : [];
            const Icon = b.icon;
            return (
              <div
                key={b.key}
                className={cx(
                  'flex items-center gap-2 rounded-lg border px-3 py-1.5 shadow-2xs transition hover:shadow-sm min-w-0 shrink-0',
                  b.bgColor
                )}
              >
                <div className="flex items-center gap-1.5">
                  <Icon className={cx('h-4 w-4 shrink-0', b.textColor)} />
                  <span className={cx('text-xs font-bold whitespace-nowrap', b.textColor)}>
                    {b.label}
                  </span>
                  <span
                    className={cx(
                      'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold shadow-2xs',
                      b.badgeBg,
                      b.badgeText
                    )}
                  >
                    {tiles.length}
                  </span>
                </div>

                {tiles.length > 0 && (
                  <div className="flex items-center gap-1 pl-1 border-l border-slate-300/60">
                    {tiles.map((t) => (
                      <button
                        key={t.job_card_id}
                        onClick={() => app.openDetails(t.job_card_id)}
                        className={cx(
                          'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-mono font-bold shadow-2xs transition hover:scale-105 cursor-pointer',
                          t.color === 'red' && 'bg-red-600 text-white',
                          t.color === 'magenta' && 'bg-fuchsia-600 text-white',
                          t.color === 'amber' && 'bg-amber-600 text-white',
                          t.color === 'sky' && 'bg-sky-600 text-white',
                          t.color === 'green' && 'bg-emerald-600 text-white',
                          t.color === 'grey' && 'bg-slate-700 text-white'
                        )}
                        title={`${t.registration_no} · ${t.stage_label}`}
                      >
                        <span>{t.last4}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

