import { expect, it } from 'vitest';
import { hits } from './draw';

it('eraser hit test', () => {
  const s = { id: 1, color: '#000', width: 2, pts: [[0, 0, 1], [100, 0, 1]] as [number, number, number][] };
  expect(hits(s, 50, 5, 6)).toBe(true);
  expect(hits(s, 50, 30, 6)).toBe(false);
});
