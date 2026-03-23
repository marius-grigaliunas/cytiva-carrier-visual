import { useCallback, useRef, useState } from 'react';
import type { PanelRect } from './utils/panelLayout';

interface ResizablePanelProps {
  id: string;
  rect: PanelRect;
  title: string;
  onMove: (dx: number, dy: number) => void;
  onResize: (edge: 'e' | 's' | 'se', dx: number, dy: number) => void;
  onMinimize?: () => void;
  children: React.ReactNode;
  className?: string;
}

const RESIZE_HANDLE_SIZE = 8;

export function ResizablePanel({ id, rect, title, onMove, onResize, onMinimize, children, className = '' }: ResizablePanelProps) {
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState<'e' | 's' | 'se' | null>(null);
  const lastPointer = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const handlePointerDownMove = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      lastPointer.current = { x: e.clientX, y: e.clientY };
      setDragging(true);
      panelRef.current?.setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerDownResize = useCallback(
    (edge: 'e' | 's' | 'se') => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      lastPointer.current = { x: e.clientX, y: e.clientY };
      setResizing(edge);
      panelRef.current?.setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };

      if (dragging) {
        onMove(dx, dy);
      } else if (resizing) {
        onResize(resizing, dx, dy);
      }
    },
    [dragging, resizing, onMove, onResize]
  );

  const handlePointerUp = useCallback(() => {
    setDragging(false);
    setResizing(null);
  }, []);

  return (
    <div
      ref={panelRef}
      id={id}
      className={`absolute flex flex-col rounded border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-800 overflow-hidden ${className}`}
      style={{
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.w}%`,
        height: `${rect.h}%`,
        minWidth: 120,
        minHeight: 100,
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div
        role="button"
        tabIndex={0}
        onPointerDown={handlePointerDownMove}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click();
        }}
        className="flex items-center justify-between shrink-0 px-2 py-1 cursor-grab active:cursor-grabbing bg-slate-100 dark:bg-slate-700/80 border-b border-slate-200 dark:border-slate-600 select-none touch-none"
        aria-label={`Move panel: ${title}`}
      >
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</span>
        {onMinimize && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onMinimize(); }}
            className="shrink-0 p-1 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            aria-label="Remove from dashboard"
            title="Turn off — show again from sidebar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>

      {/* Resize handles */}
      <div
        aria-label="Resize panel right"
        onPointerDown={handlePointerDownResize('e')}
        className="absolute top-0 right-0 w-2 h-full cursor-ew-resize touch-none group"
        style={{ right: -RESIZE_HANDLE_SIZE / 2 }}
      >
        <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-12 rounded-full bg-slate-300 dark:bg-slate-600 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      </div>
      <div
        aria-label="Resize panel down"
        onPointerDown={handlePointerDownResize('s')}
        className="absolute bottom-0 left-0 h-2 w-full cursor-ns-resize touch-none group"
        style={{ bottom: -RESIZE_HANDLE_SIZE / 2 }}
      >
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-1 w-12 rounded-full bg-slate-300 dark:bg-slate-600 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      </div>
      <div
        aria-label="Resize panel corner"
        onPointerDown={handlePointerDownResize('se')}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize touch-none"
        style={{ bottom: -2, right: -2 }}
      >
        <span className="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-slate-400 dark:border-slate-500 rounded-sm opacity-60" />
      </div>
    </div>
  );
}

// Note: layout helper functions were moved to `src/utils/panelLayout.ts`
// to satisfy ESLint Fast Refresh rules.
