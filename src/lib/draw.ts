import type { Stroke } from './storage';

export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const p = s.pts;
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (p.length === 1) {
    ctx.beginPath();
    ctx.arc(p[0][0], p[0][1], s.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // quadratic smoothing through segment midpoints; width follows pressure per segment
  for (let i = 1; i < p.length; i++) {
    const a = i === 1 ? p[0] : mid(p[i - 2], p[i - 1]);
    const b = i === p.length - 1 ? p[i] : mid(p[i - 1], p[i]);
    ctx.lineWidth = s.width * (0.5 + 0.8 * p[i][2]);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(p[i - 1][0], p[i - 1][1], b[0], b[1]);
    ctx.stroke();
  }
}

const mid = (a: number[], b: number[]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** distance from point to segment, used by the stroke eraser */
export function hits(s: Stroke, x: number, y: number, r: number): boolean {
  const p = s.pts;
  const rr = r + s.width / 2;
  if (p.length === 1) return Math.hypot(p[0][0] - x, p[0][1] - y) <= rr;
  for (let i = 1; i < p.length; i++) {
    const [x1, y1] = p[i - 1];
    const [x2, y2] = p[i];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2)) : 0;
    if (Math.hypot(x1 + t * dx - x, y1 + t * dy - y) <= rr) return true;
  }
  return false;
}
