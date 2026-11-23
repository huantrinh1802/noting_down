<script lang="ts">
  import { onMount } from 'svelte';
  import { PalmFilter, type Contact } from './palm';
  import { drawStroke, hits } from './draw';
  import type { Stroke } from './storage';

  let {
    strokes = $bindable([] as Stroke[]),
    tool = 'pen',
    color = '#111111',
    width = 3,
    filter,
    onchange,
    onsize,
    canvas = $bindable<HTMLCanvasElement | undefined>(undefined),
  }: {
    strokes: Stroke[];
    tool: 'pen' | 'eraser';
    color: string;
    width: number;
    filter: PalmFilter;
    onchange: () => void;
    onsize: (px: number) => void;
    canvas?: HTMLCanvasElement;
  } = $props();

  let ctx: CanvasRenderingContext2D;
  let nextId = 1;
  const contacts = new Map<number, Contact>();
  const active = new Map<number, Stroke>(); // pointerId -> stroke being drawn

  onMount(() => {
    ctx = canvas!.getContext('2d')!;
    const ro = new ResizeObserver(resize);
    ro.observe(canvas!);
    return () => ro.disconnect();
  });

  $effect(() => {
    strokes; // redraw when strokes are replaced (undo, load, clear)
    if (ctx) redraw();
  });

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas!.getBoundingClientRect();
    canvas!.width = Math.round(r.width * dpr);
    canvas!.height = Math.round(r.height * dpr);
    redraw();
  }

  function redraw() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fffef8';
    ctx.fillRect(0, 0, canvas!.width / dpr, canvas!.height / dpr);
    for (const s of strokes) drawStroke(ctx, s);
  }

  function pos(e: PointerEvent): [number, number] {
    const r = canvas!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  /** pen/mouse report 0 so the filter treats them as real pens; touch reports its contact size. */
  function sizeOf(e: PointerEvent) {
    if (e.pointerType !== 'touch') return 0;
    return Math.max(e.width, e.height, 1);
  }

  function sync(e: PointerEvent, down: boolean) {
    const [x, y] = pos(e);
    if (down) {
      contacts.set(e.pointerId, { id: e.pointerId, x, y, major: sizeOf(e) });
      if (e.pointerType === 'touch') onsize(Math.max(e.width, e.height));
    } else contacts.delete(e.pointerId);
    const allowed = filter.update(performance.now() / 1000, [...contacts.values()]);

    // cancel strokes whose contact was just reclassified as a palm
    for (const [pid, s] of [...active]) {
      if (!allowed.has(pid)) {
        strokes = strokes.filter((t) => t !== s);
        active.delete(pid);
      }
    }
    return allowed;
  }

  function down(e: PointerEvent) {
    canvas!.setPointerCapture(e.pointerId);
    const allowed = sync(e, true);
    if (!allowed.has(e.pointerId)) return;
    begin(e);
  }

  function begin(e: PointerEvent) {
    const [x, y] = pos(e);
    if (tool === 'eraser') {
      erase(x, y);
      active.set(e.pointerId, null as unknown as Stroke);
      return;
    }
    const p = e.pointerType === 'mouse' || e.pressure === 0 ? 0.5 : e.pressure;
    const s: Stroke = { id: nextId++, color, width, pts: [[x, y, p]] };
    active.set(e.pointerId, s);
    strokes = [...strokes, s];
  }

  function erase(x: number, y: number) {
    const keep = strokes.filter((s) => !hits(s, x, y, 10));
    if (keep.length !== strokes.length) {
      strokes = keep;
    }
  }

  function move(e: PointerEvent) {
    if (!contacts.has(e.pointerId)) return;
    const allowed = sync(e, true);
    if (!allowed.has(e.pointerId)) return;
    if (!active.has(e.pointerId)) {
      begin(e); // contact promoted (e.g. palm landed first, then lifted)
      return;
    }
    const s = active.get(e.pointerId);
    const [x, y] = pos(e);
    if (tool === 'eraser' || !s) return erase(x, y);
    const p = e.pointerType === 'mouse' || e.pressure === 0 ? 0.5 : e.pressure;
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ce of events.length ? events : [e]) {
      const [cx, cy] = pos(ce);
      s.pts.push([cx, cy, p]);
    }
    s.pts.push([x, y, p]);
    redrawLive();
  }

  let raf = 0;
  function redrawLive() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      redraw();
    });
  }

  function up(e: PointerEvent) {
    const had = active.has(e.pointerId);
    sync(e, false);
    active.delete(e.pointerId);
    if (had) {
      if (tool === 'pen') strokes = [...strokes];
      onchange();
    }
  }
</script>

<canvas
  bind:this={canvas}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  oncontextmenu={(e) => e.preventDefault()}
></canvas>

<style>
  canvas {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    user-select: none;
    cursor: crosshair;
  }
</style>
