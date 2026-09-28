import React, { useCallback, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Lock, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { AppStateProvider, useApp } from './state/AppState';
import { DragProvider } from './dnd/DragProvider';
import { BayStatusStrip, Header } from './components/Header';
import { UnassignedSidebar } from './components/UnassignedSidebar';
import { HOUR_PX, Timeline } from './components/Timeline';
import { ChipActionModal, ChipPopover } from './components/ChipActions';
import { CreateChipModal } from './components/CreateChipModal';
import { DetailsDrawer } from './components/DetailsDrawer';
import { SearchResults } from './components/SearchResults';
import { StatusBoard } from './components/StatusBoard';
import { ConfirmDialog, ErrorDialog, Toasts } from './components/Overlays';
import { AutoTestRunner } from './components/AutoTestRunner';
import { Button, cx, ErrorState, Spinner, STATUS_META } from './components/ui';
import { useCalendar } from './hooks/queries';
import type { ChipView } from './api';
import { fmtDateLabel } from './domain/time';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught render error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
          <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-6 max-w-md shadow-2xl backdrop-blur-md">
            <h2 className="text-lg font-bold text-red-400 mb-2">Application Error Caught</h2>
            <p className="text-xs text-slate-300 mb-4">{this.state.error?.message || "An unexpected rendering error occurred."}</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition cursor-pointer"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppStateProvider>
          <DragProvider pxPerHour={HOUR_PX}>
            <Console />
          </DragProvider>
        </AppStateProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

function Console() {
  const app = useApp();
  const cal = useCalendar(app.divisionId ?? undefined, app.date, app.date === app.today);
  const [popover, setPopover] = useState<{ chip: ChipView; rect: DOMRect } | null>(null);

  // Tablet optimization: On tablet (<1024px), sidebar defaults to closed so the timeline grid is not occluded
  const [sidebar, setSidebar] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true));

  // Keep popover/action modal bound to the freshest chip data
  const findChip = useCallback(
    (id: string) => {
      if (!id || !cal.data?.bays) return undefined;
      return cal.data.bays.flatMap((b) => b.job_chips).find((c) => c && c.job_chip_id === id);
    },
    [cal.data]
  );
  const actionChip = app.actionChipId ? findChip(app.actionChipId) : undefined;

  useEffect(() => {
    setPopover(null);
  }, [app.date, app.divisionId, app.searchQuery]);

  const jump = (bayId: string) => {
    const row = document.getElementById(`bay-row-${bayId}`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row?.animate(
      [{ backgroundColor: 'rgba(47,107,255,.18)' }, { backgroundColor: 'transparent' }],
      { duration: 1200 }
    );
  };

  return (
    <div className="flex h-screen w-full flex-col font-sans overflow-hidden bg-slate-100">
      <Header />
      {cal.data && !app.searchQuery && <BayStatusStrip summary={cal.data.summary} onJump={jump} />}

      {/* Control bar */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] shrink-0">
        <Button
          size="sm"
          tone="ghost"
          onClick={() => setSidebar((s) => !s)}
          aria-label="Toggle unassigned panel"
          className="cursor-pointer"
        >
          {sidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          {sidebar ? 'Hide queue' : 'Unassigned queue'}
        </Button>

        <span className="font-semibold text-slate-700">{fmtDateLabel(app.date)}</span>

        {app.isPast && (
          <span className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 font-semibold text-white">
            <Lock className="h-3 w-3" /> Historical · read-only
          </span>
        )}
        {app.isFuture && (
          <span className="rounded bg-sky-100 px-2 py-0.5 font-semibold text-sky-800">
            Planning ahead · Start/Pause/End locked
          </span>
        )}
        {cal.data?.operational_window.is_closed && (
          <span className="rounded bg-slate-200 px-2 py-0.5 font-semibold text-slate-700">
            Workshop closed
          </span>
        )}

        <div className="ml-auto hidden flex-wrap items-center gap-3 md:flex">
          {(['NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'DELAYED'] as const).map((s) => (
            <span key={s} className="flex items-center gap-1 text-slate-600">
              <span className={cx('h-3 w-5 rounded border', STATUS_META[s].chip)} />
              {STATUS_META[s].label}
            </span>
          ))}
          <span className="flex items-center gap-1 text-slate-600">
            <span className="hatch-overrun h-3 w-5 rounded border border-red-300" />
            Overrun
          </span>
          <span className="flex items-center gap-1 text-slate-600">
            <span className="nonop-band h-3 w-5 rounded" />
            Closed hours
          </span>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Unassigned Sidebar: Collapsible on tablets (<1024px) with semi-transparent backdrop overlay */}
        {sidebar && (
          <>
            {/* Backdrop overlay on tablet screens (<1024px) so it doesn't occlude timeline grid */}
            <div
              className="fixed inset-0 z-20 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity"
              onClick={() => setSidebar(false)}
              aria-label="Close unassigned sidebar backdrop"
            />
            <div className="absolute inset-y-0 left-0 z-30 w-[19rem] shadow-2xl lg:relative lg:z-auto lg:shadow-none animate-in slide-in-from-left duration-200">
              <UnassignedSidebar />
            </div>
          </>
        )}

        <main className="min-w-0 flex-1 h-full overflow-hidden bg-white">
          {app.searchQuery ? (
            <SearchResults query={app.searchQuery} />
          ) : (
            <>
              {cal.isLoading && <Spinner label="Loading bay timeline…" />}
              {cal.isError && <ErrorState message="Could not load the bay timeline." onRetry={() => cal.refetch()} />}
              {cal.data && cal.data.bays.length === 0 && (
                <ErrorState message="No bays configured in the Bay Master for this workshop." />
              )}
              {cal.data && cal.data.bays.length > 0 && (
                <Timeline
                  data={cal.data}
                  onChipClick={(chip, rect) => setPopover({ chip, rect })}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Bottom Status Board */}
      <StatusBoard />

      {/* Dynamic Popovers & Modals */}
      {popover && (
        <ChipPopover
          chip={findChip(popover.chip.job_chip_id) ?? popover.chip}
          rect={popover.rect}
          onClose={() => setPopover(null)}
        />
      )}
      {actionChip && <ChipActionModal chip={actionChip} onClose={() => app.openActions(null)} />}
      {app.createIntent && (
        <CreateChipModal
          key={`${app.createIntent.jobCardId}-${app.createIntent.bayId}-${app.createIntent.startMinutes}`}
          intent={app.createIntent}
        />
      )}
      {app.detailsJobCardId && (
        <DetailsDrawer jobCardId={app.detailsJobCardId} onClose={() => app.openDetails(null)} />
      )}
      <ErrorDialog />
      <ConfirmDialog />
      <Toasts />
      <AutoTestRunner />
    </div>
  );
}
