/**
 * In-app palm rejection for a passive stylus (which arrives as pointerType "touch").
 *
 * Two strategies:
 *  - size: classify each contact by its reported size (PointerEvent width/height).
 *          small = pen, medium = finger, large = palm.
 *  - geometry (fallback when the webview reports no contact size): the topmost
 *          contact is the pen, everything lower is the resting hand.
 *
 * In both, a rejected contact stays rejected until it lifts, and non-pen contacts
 * are blocked while the pen is down and for `hold` seconds after it lifts.
 */
export type Cls = 'pen' | 'finger' | 'palm';

export interface Contact {
  id: number;
  x: number;
  y: number;
  /** contact size in CSS px; 0 for real pens / mice */
  major: number;
}

export interface PalmOptions {
  penMax: number;
  palmMin: number;
  hold: number; // seconds
  penOnly: boolean;
  /** true: use size; false: use geometry */
  useSize: boolean;
  /** px a newcomer must be above the current pen to take over (geometry mode) */
  stealMargin: number;
}

export const defaultOptions: PalmOptions = {
  penMax: 14,
  palmMin: 60,
  hold: 0.35,
  penOnly: false,
  useSize: true,
  stealMargin: 30,
};

export class PalmFilter {
  opts: PalmOptions;
  private cls = new Map<number, Cls>();
  private penUntil = 0;
  private winner: number | null = null; // geometry mode

  constructor(opts: Partial<PalmOptions> = {}) {
    this.opts = { ...defaultOptions, ...opts };
  }

  classOf(id: number): Cls | undefined {
    return this.cls.get(id);
  }

  /** Feed every currently-down contact; returns ids that may draw. */
  update(now: number, contacts: Contact[]): Set<number> {
    const live = new Map(contacts.map((c) => [c.id, c]));

    for (const [id, c] of [...this.cls]) {
      if (!live.has(id)) {
        this.cls.delete(id);
        if (c === 'pen') this.penUntil = now + this.opts.hold;
        if (id === this.winner) this.winner = null;
      }
    }

    return this.opts.useSize ? this.bySize(now, live) : this.byGeometry(now, live);
  }

  private bySize(now: number, live: Map<number, Contact>): Set<number> {
    const { penMax, palmMin } = this.opts;
    const fresh = [...live.values()]
      .filter((c) => !this.cls.has(c.id))
      .sort((a, b) => Number(a.major > penMax) - Number(b.major > penMax));
    for (const c of fresh) {
      this.cls.set(c.id, c.major >= palmMin ? 'palm' : c.major <= penMax ? 'pen' : 'finger');
    }
    for (const [id, k] of this.cls) {
      if (k === 'finger' && live.get(id)!.major >= palmMin) this.cls.set(id, 'palm');
    }
    const penDown = [...this.cls.values()].includes('pen');
    if (penDown || now < this.penUntil || this.opts.penOnly) {
      for (const [id, k] of this.cls) if (k === 'finger') this.cls.set(id, 'palm');
    }
    return this.allowed();
  }

  private byGeometry(now: number, live: Map<number, Contact>): Set<number> {
    const blocked = now < this.penUntil;
    const realPen = [...live.values()].some((c) => c.major === 0);

    for (const c of live.values()) {
      if (c.major === 0) this.cls.set(c.id, 'pen'); // real pen / mouse
      else if (!this.cls.has(c.id)) this.cls.set(c.id, blocked || realPen ? 'palm' : 'finger');
      else if (realPen) this.cls.set(c.id, 'palm');
    }

    const touches = [...live.values()].filter((c) => c.major !== 0 && this.cls.get(c.id) !== 'palm');
    if (!touches.length) {
      this.winner = null;
      return this.allowed();
    }
    const top = touches.reduce((a, b) => (b.y < a.y ? b : a));
    const incumbent = this.winner !== null ? live.get(this.winner) : undefined;
    if (!incumbent || this.cls.get(incumbent.id) === 'palm') {
      this.winner = top.id;
    } else if (top.id !== incumbent.id && top.y < incumbent.y - this.opts.stealMargin) {
      this.cls.set(incumbent.id, 'palm'); // palm landed first, pen is clearly above it
      this.winner = top.id;
    }
    for (const c of touches) this.cls.set(c.id, c.id === this.winner ? 'pen' : 'palm');
    return this.allowed();
  }

  private allowed(): Set<number> {
    const out = new Set<number>();
    for (const [id, k] of this.cls) if (k !== 'palm') out.add(id);
    return out;
  }
}
