export interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Keeping these helpers in a separate module avoids ESLint Fast Refresh restrictions
// (this file can export non-React utilities freely).
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

  const r = toPx(rect);
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

