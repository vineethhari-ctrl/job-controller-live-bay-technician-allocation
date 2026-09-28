import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export type DragPayload =
  | { kind: 'chip'; chipId: string; bayId: string; durationMin: number; grabOffsetMin: number; label: string }
  | { kind: 'jobcard'; jobCardId: string; label: string; durationMin?: number };

export interface DropHover {
  bayId: string;
  minutes: number;
}

interface ActiveDrag {
  payload: DragPayload;
  hover?: DropHover;
  x: number;
  y: number;
}

type DropHandler = (p: DragPayload, hover: DropHover) => void;

interface DragContextValue {
  active: ActiveDrag | null;
  begin: (e: React.PointerEvent, payload: DragPayload, onClickFallback?: () => void) => void;
  setDropHandler: (handler: DropHandler | null) => void;
}

const DragContext = createContext<DragContextValue | null>(null);

export function DragProvider({ children, pxPerHour = 96 }: { children: React.ReactNode; pxPerHour?: number }) {
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const dropHandlerRef = useRef<DropHandler | null>(null);
  const activeRef = useRef<ActiveDrag | null>(null);
  activeRef.current = active;

  const setDropHandler = useCallback((handler: DropHandler | null) => {
    dropHandlerRef.current = handler;
  }, []);

  const begin = useCallback((e: React.PointerEvent, payload: DragPayload, onClickFallback?: () => void) => {
    // Only primary button
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let isDragging = false;

    const findHover = (clientX: number, clientY: number): DropHover | undefined => {
      const el = document.elementFromPoint(clientX, clientY);
      const row = el?.closest('[data-bay-row]');
      if (!row) return undefined;
      const bayId = row.getAttribute('data-bay-id');
      if (!bayId) return undefined;
      const rect = row.getBoundingClientRect();
      const pxPerMin = pxPerHour / 60;
      const xInRow = Math.max(0, clientX - rect.left);
      const grabOffset = payload.kind === 'chip' ? payload.grabOffsetMin : 0;
      const rawMin = Math.round((xInRow / pxPerMin) - grabOffset);
      const snappedMin = Math.max(0, Math.min(1435, Math.round(rawMin / 5) * 5));
      return { bayId, minutes: snappedMin };
    };

    const onPointerMove = (moveEv: PointerEvent) => {
      const dx = moveEv.clientX - startX;
      const dy = moveEv.clientY - startY;
      if (!isDragging) {
        if (Math.hypot(dx, dy) > 8) {
          isDragging = true;
        } else {
          return;
        }
      }
      const hover = findHover(moveEv.clientX, moveEv.clientY);
      setActive({
        payload,
        hover,
        x: moveEv.clientX,
        y: moveEv.clientY,
      });
    };

    const onPointerUp = (upEv: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      if (!isDragging) {
        if (onClickFallback) onClickFallback();
        return;
      }

      const finalHover = findHover(upEv.clientX, upEv.clientY);
      setActive(null);

      if (finalHover && dropHandlerRef.current) {
        dropHandlerRef.current(payload, finalHover);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }, [pxPerHour]);

  return (
    <DragContext.Provider value={{ active, begin, setDropHandler }}>
      {children}
      {active && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-brand-500 bg-brand-600/90 px-2.5 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-xs -translate-x-1/2 -translate-y-1/2"
          style={{ left: active.x, top: active.y }}
        >
          {active.payload.label}
          {active.hover && <span className="ml-1.5 opacity-80">({Math.floor(active.hover.minutes / 60)}:{String(active.hover.minutes % 60).padStart(2, '0')})</span>}
        </div>
      )}
    </DragContext.Provider>
  );
}

export function useDrag() {
  const ctx = useContext(DragContext);
  if (!ctx) throw new Error('useDrag must be used inside DragProvider');
  return ctx;
}
