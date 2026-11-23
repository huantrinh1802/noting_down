<script lang="ts">
  import { onMount } from 'svelte';
  import Canvas from './lib/Canvas.svelte';
  import { PalmFilter, defaultOptions } from './lib/palm';
  import { exportPng, loadNote, saveNote, type Stroke } from './lib/storage';

  const NOTE = 'default';
  const colors = ['#111111', '#1d4ed8', '#dc2626', '#15803d', '#a16207'];

  let strokes = $state.raw<Stroke[]>([]);
  let undo = $state.raw<Stroke[][]>([]);
  let redo = $state.raw<Stroke[][]>([]);
  let tool = $state<'pen' | 'eraser'>('pen');
  let color = $state(colors[0]);
  let width = $state(3);
  let canvas = $state<HTMLCanvasElement>();
  let toast = $state('');
  let showPalm = $state(false);

  // palm rejection settings
  let penMax = $state(defaultOptions.penMax);
  let palmMin = $state(defaultOptions.palmMin);
  let useSize = $state(true);
  let penOnly = $state(false);
  let lastSize = $state(0);
  const filter = new PalmFilter();
  $effect(() => {
    Object.assign(filter.opts, { penMax, palmMin, useSize, penOnly });
  });

  let saveTimer: ReturnType<typeof setTimeout>;
  let prev: Stroke[] = [];

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveNote(NOTE, strokes), 400);
  }
  function changed() {
    if (strokes === prev) return; // e.g. eraser touched nothing
    undo = [...undo, prev];
    prev = strokes;
    redo = [];
    persist();
  }
  function doUndo() {
    if (!undo.length) return;
    redo = [...redo, strokes];
    strokes = prev = undo[undo.length - 1];
    undo = undo.slice(0, -1);
    persist();
  }
  function doRedo() {
    if (!redo.length) return;
    undo = [...undo, strokes];
    strokes = prev = redo[redo.length - 1];
    redo = redo.slice(0, -1);
    persist();
  }
  function clearAll() {
    if (!strokes.length) return;
    undo = [...undo, strokes];
    redo = [];
    strokes = prev = [];
    persist();
  }
  async function doExport() {
    toast = 'Saved to ' + (await exportPng(NOTE + '-' + Date.now(), canvas!));
    setTimeout(() => (toast = ''), 4000);
  }
  function key(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === 'z') (e.preventDefault(), e.shiftKey ? doRedo() : doUndo());
    if (e.key === 'y') (e.preventDefault(), doRedo());
  }

  onMount(async () => {
    strokes = prev = await loadNote(NOTE);
  });
</script>

<svelte:window onkeydown={key} />

<main>
  <header>
    <button class:on={tool === 'pen'} onclick={() => (tool = 'pen')}>✏️ Pen</button>
    <button class:on={tool === 'eraser'} onclick={() => (tool = 'eraser')}>🧽 Erase</button>
    <span class="sep"></span>
    {#each colors as c}
      <button class="swatch" class:on={color === c && tool === 'pen'} style:background={c}
        aria-label={c} onclick={() => ((color = c), (tool = 'pen'))}></button>
    {/each}
    <input type="range" min="1" max="12" bind:value={width} aria-label="Pen width" />
    <span class="sep"></span>
    <button onclick={doUndo} disabled={!undo.length} aria-label="Undo">↶</button>
    <button onclick={doRedo} aria-label="Redo" disabled={!redo.length}>↷</button>
    <button onclick={clearAll}>Clear</button>
    <button onclick={doExport}>Export PNG</button>
    <span class="grow"></span>
    <button class:on={showPalm} onclick={() => (showPalm = !showPalm)}>🖐 Palm</button>
  </header>

  {#if showPalm}
    <section class="palm">
      <label>
        <input type="checkbox" bind:checked={useSize} /> Use contact size
        <small>(off → topmost touch is the pen)</small>
      </label>
      <label>Pen ≤ <input type="range" min="1" max="60" bind:value={penMax} /> {penMax}px</label>
      <label>Palm ≥ <input type="range" min="10" max="200" bind:value={palmMin} /> {palmMin}px</label>
      <label><input type="checkbox" bind:checked={penOnly} /> Pen only</label>
      <span>Last touch size: <b>{lastSize.toFixed(0)}px</b>
        {#if lastSize <= 1}<small>(≤1 → this webview reports no size; switch off "Use contact size")</small>{/if}
      </span>
    </section>
  {/if}

  <div class="board">
    <Canvas bind:strokes bind:canvas {tool} {color} {width} {filter}
      onchange={changed} onsize={(p) => (lastSize = p)} />
  </div>

  {#if toast}<div class="toast">{toast}</div>{/if}
</main>

<style>
  :global(html, body, #app) { height: 100%; margin: 0; }
  :global(body) { font: 14px system-ui, sans-serif; background: #e9e7df; overscroll-behavior: none; }
  main { display: flex; flex-direction: column; height: 100%; }
  header, .palm { display: flex; gap: 6px; align-items: center; padding: 6px 10px; background: #2b2b2b; color: #eee; flex-wrap: wrap; }
  .palm { background: #3a3a3a; gap: 14px; font-size: 13px; }
  .palm label { display: flex; gap: 6px; align-items: center; }
  .palm small { opacity: .7; }
  .grow { flex: 1; }
  .sep { width: 1px; height: 22px; background: #555; margin: 0 4px; }
  button { background: #444; color: #eee; border: 1px solid #555; border-radius: 6px; padding: 7px 12px; font: inherit; min-height: 36px; }
  button.on { background: #5b7cfa; border-color: #8aa2ff; }
  button:disabled { opacity: .4; }
  .swatch { width: 30px; height: 30px; min-height: 0; padding: 0; border-radius: 50%; }
  .swatch.on { outline: 2px solid #fff; outline-offset: 2px; }
  .board { flex: 1; min-height: 0; }
  .toast { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: #222; color: #fff; padding: 8px 14px; border-radius: 8px; }
</style>
