import React, { createContext, useContext, useMemo, useState } from 'react';
import { Role, RuleIssue } from '../domain/types';
import { istDate } from '../domain/time';

export interface CreateChipIntent {
  jobCardId: string;
  bayId: string;
  startMinutes: number;
  mode: 'create' | 'edit';
}

export interface ToastItem {
  id: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  title: string;
  detail?: string;
}

export interface ConfirmItem {
  title: string;
  detail: string;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
  resolve: (ok: boolean) => void;
}

interface AppContextValue {
  divisionId: string | null;
  setDivisionId: (id: string | null) => void;
  date: string;
  setDate: (date: string) => void;
  today: string;
  isPast: boolean;
  isFuture: boolean;
  role: Role;
  setRole: (role: Role) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  actionChipId: string | null;
  openActions: (chipId: string | null) => void;
  createIntent: CreateChipIntent | null;
  openCreate: (intent: CreateChipIntent) => void;
  closeCreate: () => void;
  detailsJobCardId: string | null;
  openDetails: (jcId: string | null) => void;
  // Overlays
  toasts: ToastItem[];
  toast: (t: Omit<ToastItem, 'id'>) => void;
  errorIssues: RuleIssue[] | null;
  showError: (issues: RuleIssue[] | null) => void;
  confirmReq: ConfirmItem | null;
  askConfirm: (opts: { title: string; detail: string; confirmLabel?: string; tone?: 'default' | 'danger' }) => Promise<boolean>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const today = useMemo(() => istDate(Date.now()), []);
  const [divisionId, setDivisionId] = useState<string | null>('div-1');
  const [date, setDate] = useState<string>(today);
  const [role, setRole] = useState<Role>('JOB_CONTROLLER');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionChipId, setActionChipId] = useState<string | null>(null);
  const [createIntent, setCreateIntent] = useState<CreateChipIntent | null>(null);
  const [detailsJobCardId, setDetailsJobCardId] = useState<string | null>(null);

  // Overlays
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [errorIssues, setErrorIssues] = useState<RuleIssue[] | null>(null);
  const [confirmReq, setConfirmReq] = useState<ConfirmItem | null>(null);

  const toast = (t: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  };

  const askConfirm = (opts: { title: string; detail: string; confirmLabel?: string; tone?: 'default' | 'danger' }): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmReq({ ...opts, resolve: (res) => { setConfirmReq(null); resolve(res); } });
    });
  };

  const isPast = date < today;
  const isFuture = date > today;

  return (
    <AppContext.Provider
      value={{
        divisionId,
        setDivisionId,
        date,
        setDate,
        today,
        isPast,
        isFuture,
        role,
        setRole,
        searchQuery,
        setSearchQuery,
        actionChipId,
        openActions: setActionChipId,
        createIntent,
        openCreate: setCreateIntent,
        closeCreate: () => setCreateIntent(null),
        detailsJobCardId,
        openDetails: setDetailsJobCardId,
        toasts,
        toast,
        errorIssues,
        showError: setErrorIssues,
        confirmReq,
        askConfirm,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppStateProvider');
  return ctx;
}
