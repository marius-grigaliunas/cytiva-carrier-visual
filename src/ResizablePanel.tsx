import { useCallback, useRef, useState } from 'react';

export interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ResizablePanelProps {
  id: string;
  rect: PanelRect;
  title: string;
  onMove: (dx: number, dy: number) => void;
  onResize: (edge: 'e' | 's' | 'se', dx: number, dy: number) => void;
  children: React.ReactNode;
  className?: string;
}

const RESIZE_HANDLE_SIZE = 8;

export function ResizablePanel({ id, rect, title, onMove, onResize, children, className = '' }: ResizablePanelProps) {
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
      className={`absolute flex flex-col rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-800 overflow-hidden ${className}`}
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
        className="flex items-center justify-between shrink-0 px-3 py-2 cursor-grab active:cursor-grabbing bg-slate-100 dark:bg-slate-700/80 border-b border-slate-200 dark:border-slate-600 select-none touch-none"
        aria-label={`Move panel: ${title}`}
      >
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</span>
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

export function clampRectToBounds(
  rect: PanelRect,
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
): PanelRect {
  let { x, y, w, h } = rect;
  if (x < bounds.minX) {
    w += x - bounds.minX;
    x = bounds.minX;
  }
  if (y < bounds.minY) {
    h += y - bounds.minY;
    y = bounds.minY;
  }
  if (x + w > bounds.maxX) w = bounds.maxX - x;
  if (y + h > bounds.maxY) h = bounds.maxY - y;
  w = Math.max(5, w);
  h = Math.max(5, h);
  return { x, y, w, h };
}

export function clampRectNoOverlap(
  rect: PanelRect,
  others: PanelRect[],
  containerW: number,
  containerH: number
): PanelRect {
  const pxPerPctX = containerW / 100;
  const pxPerPctY = containerH / 100;
  const toPx = (r: PanelRect) => ({
    left: r.x * pxPerPctX,
    top: r.y * pxPerPctY,
    right: (r.x + r.w) * pxPerPctX,
    bottom: (r.y + r.h) * pxPerPctY,
  });
  const toPct = (left: number, top: number, right: number, bottom: number): PanelRect => ({
    x: (left / containerW) * 100,
    y: (top / containerH) * 100,
    w: ((right - left) / containerW) * 100,
    h: ((bottom - top) / containerH) * 100,
  });

  let r = toPx(rect);
  const minW = 80;
  const minH = 60;

  for (const other of others) {
    const o = toPx(other);
    if (r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top) {
      const overlapLeft = o.right - r.left;
      const overlapRight = r.right - o.left;
      const overlapTop = o.bottom - r.top;
      const overlapBottom = r.bottom - o.top;
      const minOverlapX = Math.min(overlapLeft, overlapRight);
      const minOverlapY = Math.min(overlapTop, overlapBottom);
      if (minOverlapX <= minOverlapY && overlapLeft < overlapRight) {
        r.left = o.right;
      } else if (minOverlapX <= minOverlapY) {
        r.right = o.left;
      } else if (overlapTop < overlapBottom) {
        r.top = o.bottom;
      } else {
        r.bottom = o.top;
      }
    }
  }

  if (r.right - r.left < minW) r.right = r.left + minW;
  if (r.bottom - r.top < minH) r.bottom = r.top + minH;
  r.left = Math.max(0, r.left);
  r.top = Math.max(0, r.top);
  r.right = Math.min(containerW, r.right);
  r.bottom = Math.min(containerH, r.bottom);
  if (r.right - r.left < minW) r.left = r.right - minW;
  if (r.bottom - r.top < minH) r.top = r.bottom - minH;

  return toPct(r.left, r.top, r.right, r.bottom);
}
