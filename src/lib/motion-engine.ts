/* ==========================================================================
   Kutlerri motion loops · engine
   --------------------------------------------------------------------------
   Every loop is a pure function of time: scene.update(t) sets every moving
   property for t in [0, 8000). Nothing accumulates between frames, so
     - update(8000) is update(0): the loop point is exact by construction,
     - the browser preview, the scrubber and the MP4 render (which calls
       update(t) once per frame) are the same frames.
   Scenes build their own DOM inside a 1080 x 1080 stage and animate
   transform, opacity and a few sizes. No CSS transitions or keyframes.

   Every loop shares one rhythm: the opening frame holds briefly, the story
   has finished moving by SETTLE (6.35 s), the last frame holds perfectly
   still until HOLD (7.3 s), and from HOLD to the end it returns to the
   opening frame.
   ========================================================================== */

export const LOOP = 8000;
export const SETTLE = 6350; // every story has finished moving by here...
export const HOLD = 7300; // ...holds still until here (0.95 s), then returns to the start

export type Easing = (x: number) => number;
export type EaseName = 'settle' | 'glide' | 'move' | 'fade' | 'leave' | 'lin';
export type Ease = EaseName | Easing;

export type Point = [number, number];

/** A scene's element, with the last values written to it remembered.
    Every frame writes to every element, and most are not moving on most
    frames, so the cached values keep the redundant writes out of style recalc. */
export interface Moving extends HTMLElement {
  _tf?: string;
  _op?: string;
  _d?: string;
}

export interface Pose {
  x?: number;
  y?: number;
  /** Scale; 1 is written as no scale at all. */
  s?: number;
  /** Opacity, clamped to [0, 1]. */
  o?: number;
}

/** A scene builds its DOM into the stage and returns its update function. */
export type Scene = (stage: HTMLElement) => (t: number) => void;

export interface Player {
  stage: HTMLElement;
  name: string;
  update: (t: number) => void;
  playing: boolean;
  t: number;
  t0: number | null;
  rate: number;
  onframe: ((t: number) => void) | null;
}

declare global {
  interface Window {
    /** Portraits the build inlines when the source files exist. */
    KMOTION_FACES?: Record<number, string>;
    KMotion?: typeof KMotion;
  }
}

/* A scene authored with its payoff settling at `end` plays it over
   [0, SETTLE], holds that frame until HOLD, and runs its reset on the
   real clock. update(story(T, end)) is still a pure function of T. */
export function story(T: number, end: number): number {
  if (T < SETTLE) return (T * end) / SETTLE;
  if (T < HOLD) return end;
  return T;
}

/* Cubic-bezier easing, solved the way browsers do. */
export function bezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return function (x: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    let e: number;
    let d: number;
    for (let i = 0; i < 8; i++) {
      // Newton first
      e = sx(t) - x;
      if (Math.abs(e) < 1e-6) return sy(t);
      d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0;
    let hi = 1; // bisection when Newton stalls
    t = x;
    for (let i = 0; i < 40; i++) {
      e = sx(t) - x;
      if (Math.abs(e) < 1e-6) break;
      if (e < 0) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

export const E: Record<EaseName, Easing> = {
  settle: bezier(0.22, 1, 0.36, 1), // arrives fast, lands gently: most entrances
  glide: bezier(0.65, 0, 0.35, 1), // travel between two resting places
  move: bezier(0.55, 0, 0.2, 1), // same curve as the hero's travel
  fade: bezier(0.4, 0, 0.2, 1),
  leave: bezier(0.5, 0, 0.75, 0), // accelerates away: exits only
  lin: (x: number) => x,
};

/* Progress of a segment [a, b] at time t, eased. */
export function p(t: number, a: number, b: number, ease?: Ease): number {
  if (t <= a) return 0;
  if (t >= b) return 1;
  const f = typeof ease === 'function' ? ease : E[ease ?? 'settle'];
  return f((t - a) / (b - a));
}

/* A value that rises over [a, b] and falls over [c, d]. */
export function span(
  t: number,
  a: number,
  b: number,
  c: number,
  d: number,
  easeIn?: Ease,
  easeOut?: Ease,
): number {
  return p(t, a, b, easeIn) * (1 - p(t, c, d, easeOut ?? easeIn));
}

export function mix(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

export function mixColor(a: string, b: string, k: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return (
    'rgb(' +
    Math.round(mix(x[0], y[0], k)) +
    ',' +
    Math.round(mix(x[1], y[1], k)) +
    ',' +
    Math.round(mix(x[2], y[2], k)) +
    ')'
  );
}

/* Point at distance d from a towards b. */
export function toward(a: Point, b: Point, d: number): Point {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.sqrt(dx * dx + dy * dy);
  return [a[0] + (dx / l) * d, a[1] + (dy / l) * d];
}

/* One pulse, 0 -> 1 -> 0, over [a, b]. */
export function pulse(t: number, a: number, b: number): number {
  if (t <= a || t >= b) return 0;
  return Math.sin((Math.PI * (t - a)) / (b - a));
}

/* Sets transform and opacity in one call. */
/* Writes only what changed. Scenes call this for every element every frame,
   and most of them are not moving on most frames; skipping the redundant
   writes keeps the style recalc off the critical path. */
export function put(el: Moving, o: Pose): void {
  let tf = '';
  if (o.x || o.y) {
    tf += 'translate(' + (o.x ?? 0).toFixed(2) + 'px,' + (o.y ?? 0).toFixed(2) + 'px) ';
  }
  if (o.s != null && o.s !== 1) tf += 'scale(' + o.s.toFixed(4) + ') ';
  tf = tf || 'none';
  if (el._tf !== tf) {
    el.style.transform = tf;
    el._tf = tf;
  }
  if (o.o != null) {
    const op = Math.max(0, Math.min(1, o.o)).toFixed(3);
    if (el._op !== op) {
      el.style.opacity = op;
      el._op = op;
    }
  }
}

export function q<T extends Element = HTMLElement>(root: ParentNode, sel: string): T | null {
  return root.querySelector<T>(sel);
}

export function qa<T extends Element = HTMLElement>(root: ParentNode, sel: string): T[] {
  return Array.from(root.querySelectorAll<T>(sel));
}

/* --- Faces --------------------------------------------------------------
   Seven portrait slots. The build inlines Website/redesign/motion/faces/
   face-N.(jpg|png|webp) into window.KMOTION_FACES when the file exists;
   otherwise the slot shows a neutral placeholder silhouette. */
const TINTS: Array<[string, string, string]> = [
  ['#ECE7F3', '#D9D1E6', '#C6BCD8'],
  ['#EFEAE4', '#DDD5CC', '#C9BFB4'],
  ['#E6EAF0', '#D2D9E3', '#BCC5D2'],
  ['#F0E8EC', '#DDD0D7', '#C8B8C1'],
  ['#EAE8F0', '#D5D2E0', '#C0BCCF'],
  ['#EEEBE6', '#DAD5CD', '#C5BFB5'],
  ['#E8E6EE', '#D4D0DD', '#BEB9CB'],
];

function placeholder(i: number): string {
  const c = TINTS[(i - 1) % TINTS.length];
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>" +
    "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>" +
    "<stop offset='0' stop-color='" +
    c[0] +
    "'/><stop offset='1' stop-color='" +
    c[1] +
    "'/></linearGradient></defs>" +
    "<rect width='100' height='100' fill='url(#g)'/>" +
    "<circle cx='50' cy='41' r='16.5' fill='" +
    c[2] +
    "'/>" +
    "<path d='M17 100c1.6-19.5 15.2-31 33-31s31.4 11.5 33 31z' fill='" +
    c[2] +
    "'/></svg>";
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

export function face(i: number): string {
  const f = window.KMOTION_FACES ?? {};
  return f[i] ?? placeholder(i);
}

export function isPlaceholder(i: number): boolean {
  return !(window.KMOTION_FACES ?? {})[i];
}

/* --- Icons (24 x 24 line icons, stroke = currentColor) --- */
const I = {
  cutlery: '<path d="M7 3v6a2 2 0 0 0 4 0V3M9 11v10M17 3c-1.8 1.4-2.8 4-2.8 7.5H17V21"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4 7.5 8 5.5 8-5.5"/>',
  phone:
    '<path d="M6.5 3.8h2.6l1.6 4.1-2 1.3a11.5 11.5 0 0 0 6.1 6.1l1.3-2 4.1 1.6v2.6a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 6a2 2 0 0 1 2-2.2z"/>',
  sms: '<path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v9a1.5 1.5 0 0 1-1.5 1.5h-9l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5z"/><path d="M8 10.5h8"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  spark:
    '<path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5z"/><path d="M18.5 16v4M16.5 18h4"/>',
  doc: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20V4a.5.5 0 0 1 .5-.5z"/><path d="M14 3.5V8h4M9 12.5h6M9 16h4"/>',
  receipt:
    '<path d="M6.5 3.5h11v17l-2.2-1.4-2.1 1.4-2.2-1.4-2.2 1.4-2.3-1.4z"/><path d="M9.5 8h5M9.5 11.5h5M9.5 15h3"/>',
  send: '<path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z"/>',
  users:
    '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.5-3.3 2.8-5.3 6-5.3s5.5 2 6 5.3M15.5 5.6a3.2 3.2 0 0 1 0 6M17.5 14.4c2 .6 3.2 2.3 3.5 5.1"/>',
  refresh:
    '<path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L20 9.4M20 4.5v4.9h-4.9M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4 14.6M4 19.5v-4.9h4.9"/>',
} satisfies Record<string, string>;

export type IconName = keyof typeof I;

export function icon(name: IconName | string, cls?: string): string {
  return (
    '<svg class="km-ico' +
    (cls ? ' ' + cls : '') +
    '" viewBox="0 0 24 24" aria-hidden="true">' +
    (I[name as IconName] ?? '') +
    '</svg>'
  );
}

/* The payoff every loop ends on: a purple pill with a white check,
   centred on (x, y), in the same place in every scene. */
export function done(text: string, cls: string, x: number, y: number): string {
  return (
    '<div class="km-at ' +
    cls +
    '" style="left:' +
    x +
    'px;top:' +
    y +
    'px;z-index:20"><div class="km-done">' +
    '<span class="km-done__ico">' +
    icon('check') +
    '</span>' +
    text +
    '</div></div>'
  );
}

/* Its motion: in at a, out as the reset begins. */
export function showDone(el: Moving, t: number, a: number): void {
  const k = p(t, a, a + 420, 'settle');
  put(el, {
    y: (1 - k) * 14,
    s: mix(0.92, 1, k),
    o: p(t, a, a + 200, 'fade') * (1 - p(t, HOLD, HOLD + 220, 'fade')),
  });
}

export const CURSOR =
  '<svg class="km-cursor" viewBox="0 0 28 36" aria-hidden="true"><path d="M3 2.5v26.2l7.1-6.4 4.5 10.6 4.9-2.1-4.5-10.4 9.6-.5z" fill="#19171D" stroke="#FFFFFF" stroke-width="2.2" stroke-linejoin="round"/></svg>';

/* --- Players -------------------------------------------------------------- */

export const scenes: Record<string, Scene> = {};
export const players: Player[] = [];
let raf = 0;

export function mount(stage: HTMLElement, name: string): Player {
  stage.classList.add('km-stage');
  stage.innerHTML = '';
  const update = scenes[name](stage);
  const pl: Player = {
    stage,
    name,
    update,
    playing: true,
    t: 0,
    t0: null,
    rate: 1,
    onframe: null,
  };
  players.push(pl);
  update(0);
  if (!raf) raf = requestAnimationFrame(tick);
  return pl;
}

function tick(now: number): void {
  players.forEach((pl) => {
    if (!pl.playing) return;
    if (pl.t0 == null) pl.t0 = now - pl.t / pl.rate;
    pl.t = ((now - pl.t0) * pl.rate) % LOOP;
    pl.update(pl.t);
    if (pl.onframe) pl.onframe(pl.t);
  });
  raf = requestAnimationFrame(tick);
}

export function seek(pl: Player, t: number): void {
  pl.playing = false;
  pl.t = ((t % LOOP) + LOOP) % LOOP;
  pl.t0 = null;
  pl.update(pl.t);
  if (pl.onframe) pl.onframe(pl.t);
}

export function play(pl: Player): void {
  pl.playing = true;
  pl.t0 = null;
}

export function pause(pl: Player): void {
  pl.playing = false;
}

export function setRate(pl: Player, r: number): void {
  pl.t0 = null;
  pl.rate = r;
}

/* Waits for the faces the loops use. */
export function fontsReady(): Promise<unknown> {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const faces = ['700 44px Fraunces', '400 26px Inter', '500 26px Inter', '600 26px Inter'];
  const loaded = Promise.all(faces.map((f) => document.fonts.load(f)));
  return Promise.race([
    loaded,
    new Promise((r) => {
      setTimeout(r, 2500);
    }),
  ]).catch(() => {});
}

/* The scrubber, the preview board and the MP4 render reach the engine
   through this global, so it stays published alongside the module exports. */
export const KMotion = {
  LOOP,
  SETTLE,
  HOLD,
  story,
  E,
  bezier,
  done,
  showDone,
  p,
  span,
  mix,
  mixColor,
  toward,
  pulse,
  put,
  q,
  qa,
  face,
  isPlaceholder,
  icon,
  CURSOR,
  scenes,
  players,
  mount,
  seek,
  play,
  pause,
  setRate,
  fontsReady,
};

window.KMotion = KMotion;
