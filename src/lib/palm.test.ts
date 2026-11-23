import { describe, expect, it } from 'vitest';
import { PalmFilter, type Contact } from './palm';

const c = (id: number, major: number, y = 100, x = 100): Contact => ({ id, major, x, y });
const size = () => new PalmFilter({ penMax: 10, palmMin: 40, hold: 0.3, useSize: true });
const geo = () => new PalmFilter({ hold: 0.3, useSize: false, stealMargin: 30 });
const ids = (s: Set<number>) => [...s].sort();

describe('size mode', () => {
  it('allows pen, rejects palm', () => {
    const f = size();
    expect(ids(f.update(0, [c(1, 5)]))).toEqual([1]);
    expect(ids(f.update(0.1, [c(1, 5), c(2, 80)]))).toEqual([1]);
    expect(ids(f.update(0.2, [c(2, 80)]))).toEqual([]);
  });
  it('palm first, then pen', () => {
    const f = size();
    expect(ids(f.update(0, [c(1, 80)]))).toEqual([]);
    expect(ids(f.update(0.1, [c(1, 80), c(2, 5)]))).toEqual([2]);
  });
  it('finger during pen is latched as palm', () => {
    const f = size();
    f.update(0, [c(1, 5)]);
    expect(ids(f.update(0.1, [c(1, 5), c(2, 25)]))).toEqual([1]);
    expect(ids(f.update(2, [c(2, 25)]))).toEqual([]);
  });
  it('existing finger dropped when pen lands', () => {
    const f = size();
    expect(ids(f.update(0, [c(1, 25)]))).toEqual([1]);
    expect(ids(f.update(0.1, [c(1, 25), c(2, 5)]))).toEqual([2]);
  });
  it('hold blocks fingers right after pen lifts', () => {
    const f = size();
    f.update(0, [c(1, 5)]);
    f.update(0.1, []);
    expect(ids(f.update(0.2, [c(2, 25)]))).toEqual([]);
    f.update(0.3, []);
    expect(ids(f.update(1, [c(3, 25)]))).toEqual([3]);
  });
  it('finger growing into palm', () => {
    const f = size();
    f.update(0, [c(1, 25)]);
    expect(ids(f.update(0.1, [c(1, 60)]))).toEqual([]);
  });
});

describe('geometry mode', () => {
  it('lone contact draws, lower contact is palm', () => {
    const f = geo();
    expect(ids(f.update(0, [c(1, 1, 100)]))).toEqual([1]);
    expect(ids(f.update(0.1, [c(1, 1, 100), c(2, 1, 300)]))).toEqual([1]);
    expect(ids(f.update(1, [c(2, 1, 300)]))).toEqual([]); // stays palm
  });
  it('palm first, pen clearly above steals', () => {
    const f = geo();
    expect(ids(f.update(0, [c(1, 1, 300)]))).toEqual([1]);
    expect(ids(f.update(0.1, [c(1, 1, 300), c(2, 1, 100)]))).toEqual([2]);
  });
  it('small difference does not steal', () => {
    const f = geo();
    f.update(0, [c(1, 1, 300)]);
    expect(ids(f.update(0.1, [c(1, 1, 300), c(2, 1, 290)]))).toEqual([1]);
  });
  it('real pen (major 0) beats touch', () => {
    const f = geo();
    f.update(0, [c(1, 1, 100)]);
    expect(ids(f.update(0.1, [c(1, 1, 100), c(2, 0, 400)]))).toEqual([2]);
  });
  it('hold after lift', () => {
    const f = geo();
    f.update(0, [c(1, 1)]);
    f.update(0.1, []);
    expect(ids(f.update(0.2, [c(2, 1)]))).toEqual([]);
  });
});
