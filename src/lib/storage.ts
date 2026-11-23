import { invoke } from '@tauri-apps/api/core';

export interface Stroke {
  id: number;
  color: string;
  width: number;
  pts: [number, number, number][]; // x, y, pressure(0..1)
}

const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function saveNote(name: string, strokes: Stroke[]): Promise<void> {
  const json = JSON.stringify({ version: 1, strokes });
  if (inTauri()) await invoke('save_note', { name, json });
  else localStorage.setItem('note:' + name, json);
}

export async function loadNote(name: string): Promise<Stroke[]> {
  const json = inTauri()
    ? await invoke<string | null>('load_note', { name })
    : localStorage.getItem('note:' + name);
  if (!json) return [];
  try {
    return (JSON.parse(json).strokes as Stroke[]) ?? [];
  } catch {
    return [];
  }
}

/** Returns where the PNG was written (or triggers a browser download). */
export async function exportPng(name: string, canvas: HTMLCanvasElement): Promise<string> {
  const dataUrl = canvas.toDataURL('image/png');
  if (inTauri()) return invoke<string>('export_png', { name, dataBase64: dataUrl.split(',')[1] });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name + '.png';
  a.click();
  return a.download;
}
