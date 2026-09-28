import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flag,
  Info,
  PauseCircle,
  Play,
  PlayCircle,
  StopCircle,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { ChipView } from '../api';
import { useApp } from '../state/AppState';
import { useChipAction, useMasters } from '../hooks/queries';
import { availableActions } from '../domain/rules';
import { fmtDateTime, fmtTime, toMs } from '../domain/time';
import { ChipAction, VENDOR_OPTIONS } from '../domain/types';
import { Button, cx, Field, inputCls, Modal, Pill, STATUS_META, StatusBadge } from './ui';

export function ChipPopover({
  chip,
  rect,
  onClose,
}: {
  chip: ChipView;
  rect: DOMRect;
  onClose: () => void;
}) {
  const app = useApp();
  const meta = STATUS_META[chip.is_delayed ? 'DELAYED' : chip.status];

  // Calculate coordinates to keep within screen
  const top = Math.min(window.innerHeight - 280, Math.max(10, rect.bottom + 8));
  const left = Math.min(window.innerWidth - 330, Math.max(10, rect.left));

  const getActionConfig = () => {
    switch (chip.status) {
      case 'NOT_STARTED':
        return { label: 'Start Work', icon: Play };
      case 'IN_PROGRESS':
        return { label: 'Pause / End', icon: PauseCircle };
      case 'ON_HOLD':
        return { label: 'Resume Work', icon: PlayCircle };
      case 'COMPLETED':
      default:
        return { label: 'Completed (Audit)', icon: CheckCircle2 };
    }
  };

  const actionCfg = getActionConfig();
  const Icon = actionCfg.icon;

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ top, left }}
        className="absolute z-50 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-100"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm font-bold text-slate-900">
                {chip.registration_no}
              </span>
              <span className="text-[10px] text-slate-400 font-semibold">{chip.jc_short}</span>
            </div>
            <p className="text-xs text-slate-500 font-medium">{chip.model}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
          <span className="text-slate-500 font-medium">Work Status:</span>
          <StatusBadge status={chip.status} />
        </div>

        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-medium">Scheduled Window:</span>
          <span className="font-semibold text-slate-800">
            {fmtTime(chip.planned_start)} – {fmtTime(chip.planned_end)}
          </span>
        </div>

        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-medium">Promised Delivery:</span>
          <span className="font-bold text-brand-700">{fmtDateTime(chip.ptd)}</span>
        </div>

        {chip.status === 'ON_HOLD' && chip.pause_reason_code && (
          <div className="mt-2 rounded-lg bg-fuchsia-50 p-2 text-xs text-fuchsia-900 border border-fuchsia-200">
            <span className="font-bold">Hold Reason: </span>
            {chip.pause_reason_code}
            {chip.pause_reference && ` (${chip.pause_reference})`}
          </div>
        )}

        <div className="mt-3.5 grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-100">
          <Button
            size="md"
            tone="default"
            className="w-full min-h-[40px] h-[40px] text-xs font-semibold"
            onClick={() => {
              onClose();
              app.openDetails(chip.job_card_id);
            }}
          >
            View Job Card
          </Button>

          <button
            onClick={() => {
              onClose();
              app.openActions(chip.job_chip_id);
            }}
            className="w-full min-h-[40px] h-[40px] px-2.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-500 text-slate-950 font-extrabold text-xs shadow-md border border-amber-500 flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
          >
            <Icon className="h-4 w-4 shrink-0 text-slate-950" />
            <span className="truncate">{actionCfg.label}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChipActionModal({
  chip,
  onClose,
}: {
  chip: ChipView;
  onClose: () => void;
}) {
  const app = useApp();
  const masters = useMasters(app.divisionId ?? undefined);
  const actionMut = useChipAction();
  const now = Date.now();

  const [selectedAction, setSelectedAction] = useState<ChipAction | null>(null);
  const [pauseReason, setPauseReason] = useState('');
  const [selectedPart, setSelectedPart] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [delayReason, setDelayReason] = useState('');

  const allowed = availableActions(chip as any, app.role, now);

  const selectedReasonObj = masters.data?.pauseReasons.find((r) => r.code === pauseReason);

  const handleExecute = (action: ChipAction) => {
    let pausePayload: any = undefined;
    if (action === 'PAUSE') {
      if (!pauseReason) {
        app.toast({ tone: 'warning', title: 'Select a pause reason' });
        return;
      }
      pausePayload = {
        reason_code: pauseReason,
        part_nos: selectedPart ? [selectedPart] : undefined,
        vendor: selectedVendor || undefined,
      };
    }

    actionMut.mutate(
      {
        chipId: chip.job_chip_id,
        action,
        body: {
          pause: pausePayload,
          delay_reason: delayReason || undefined,
        },
      },
      {
        onSuccess: (res: any) => {
          app.toast({
            tone: 'success',
            title: `Action: ${action} succeeded`,
            detail: res.late_end ? 'Marked as completed past planned end (overrun logged)' : undefined,
          });
          onClose();
        },
        onError: (err: any) => {
          app.showError(
            err.issues || [{ code: 'ERR', title: 'Action failed', detail: err.message, severity: 'error' }]
          );
        },
      }
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-xl"
      title={
        <div className="flex items-center gap-2">
          <span>Manage Chip Work</span>
          <span className="font-mono text-xs text-slate-500">· {chip.registration_no}</span>
        </div>
      }
      subtitle={`Current Bay execution controls for ${app.role.replace('_', ' ')}`}
    >
      <div className="p-4 space-y-4">
        {/* Chip status card */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">{chip.registration_no}</span>
              <StatusBadge status={chip.status} />
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Plan: {fmtTime(chip.planned_start)} – {fmtTime(chip.planned_end)} · Advisor: {chip.service_advisor}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">PTD</span>
            <div className="text-xs font-bold text-brand-700">{fmtDateTime(chip.ptd)}</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Available Operations
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Button
              tone={allowed.START ? 'primary' : 'default'}
              disabled={!allowed.START}
              onClick={() => handleExecute('START')}
              className="h-10 flex-col gap-0.5 text-xs"
            >
              <Play className="h-4 w-4" />
              <span>Start Work</span>
            </Button>

            <Button
              tone={allowed.PAUSE ? 'secondary' : 'default'}
              disabled={!allowed.PAUSE}
              onClick={() => setSelectedAction(selectedAction === 'PAUSE' ? null : 'PAUSE')}
              className={cx('h-10 flex-col gap-0.5 text-xs', selectedAction === 'PAUSE' && 'ring-2 ring-brand-600')}
            >
              <PauseCircle className="h-4 w-4 text-fuchsia-600" />
              <span>Pause / Hold</span>
            </Button>

            <Button
              tone={allowed.RESUME ? 'primary' : 'default'}
              disabled={!allowed.RESUME}
              onClick={() => handleExecute('RESUME')}
              className="h-10 flex-col gap-0.5 text-xs"
            >
              <PlayCircle className="h-4 w-4 text-emerald-600" />
              <span>Resume Work</span>
            </Button>

            <Button
              tone={allowed.END ? 'danger' : 'default'}
              disabled={!allowed.END}
              onClick={() => setSelectedAction(selectedAction === 'END' ? null : 'END')}
              className={cx('h-10 flex-col gap-0.5 text-xs', selectedAction === 'END' && 'ring-2 ring-red-600')}
            >
              <StopCircle className="h-4 w-4" />
              <span>End (Bulk)</span>
            </Button>
          </div>
        </div>

        {/* Pause configuration form */}
        {selectedAction === 'PAUSE' && (
          <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50/50 p-3.5 space-y-3 animate-in fade-in">
            <div className="flex items-center gap-1.5 text-xs font-bold text-fuchsia-900">
              <PauseCircle className="h-4 w-4" /> Pause Reason &amp; Reference Verification
            </div>

            <Field label="Pause Reason" required>
              <select
                className={inputCls}
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
              >
                <option value="">Select reason…</option>
                {masters.data?.pauseReasons.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>

            {selectedReasonObj?.dependency_type === 'MR_PARTS' && (
              <Field label="Missing Material Request (MR) Part" required hint="Select unavailable part from open MR">
                <select
                  className={inputCls}
                  value={selectedPart}
                  onChange={(e) => setSelectedPart(e.target.value)}
                >
                  <option value="">Select part…</option>
                  <option value="542450100142">542450100142 - RH Sunroof Guide Slider</option>
                  <option value="287109200119">287109200119 - Synthetic Track Grease</option>
                </select>
              </Field>
            )}

            {selectedReasonObj?.dependency_type === 'VENDOR_SELECT' && (
              <Field label="Vendor Specialty" required>
                <select
                  className={inputCls}
                  value={selectedVendor}
                  onChange={(e) => setSelectedVendor(e.target.value)}
                >
                  <option value="">Select vendor…</option>
                  {VENDOR_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <div className="flex justify-end pt-1">
              <Button
                tone="primary"
                loading={actionMut.isPending}
                onClick={() => handleExecute('PAUSE')}
              >
                Confirm Pause
              </Button>
            </div>
          </div>
        )}

        {/* End configuration form */}
        {selectedAction === 'END' && (
          <div className="rounded-xl border border-red-200 bg-red-50/40 p-3.5 space-y-3 animate-in fade-in">
            <div className="flex items-center gap-1.5 text-xs font-bold text-red-900">
              <AlertTriangle className="h-4 w-4" /> Bulk Force-Complete Confirmation
            </div>
            <p className="text-xs text-slate-600">
              Ending this chip will force-complete all remaining complaint codes and stamp actual completion times.
            </p>

            {now > toMs(chip.planned_end) && (
              <Field label="Overrun Delay Justification" required hint="Required since planned end time has passed">
                <input
                  type="text"
                  placeholder="e.g. Extra rust cleaning required on disc rotor"
                  value={delayReason}
                  onChange={(e) => setDelayReason(e.target.value)}
                  className={inputCls}
                />
              </Field>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button tone="ghost" onClick={() => setSelectedAction(null)}>
                Cancel
              </Button>
              <Button
                tone="danger"
                loading={actionMut.isPending}
                onClick={() => handleExecute('END')}
              >
                Confirm Bulk End
              </Button>
            </div>
          </div>
        )}

        {/* Complaint lines status in chip */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Complaint Codes in this Chip ({(chip.complaint_codes || []).length})
          </h4>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {(chip.complaint_codes || []).map((cc) => (
              <div key={cc.id} className="flex items-center justify-between p-2.5 text-xs bg-white">
                <div>
                  <span className="font-bold text-slate-800">{cc.code}</span>
                  <span className="text-slate-500 ml-2">{cc.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={cc.status} />
                  {cc.status !== 'COMPLETED' && (
                    <Button
                      size="xs"
                      tone="default"
                      onClick={() => handleExecute('COMPLETE')}
                    >
                      Complete
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
