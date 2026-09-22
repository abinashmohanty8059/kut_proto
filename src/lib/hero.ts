/* ==========================================================================
   Kutlerri redesign · hero entrance
   --------------------------------------------------------------------------
   One timeline, measured from the moment the copy is ready (brand fonts
   loaded, tab visible):

     0 – 320      copy fades in, already centred
     320 – 1320   hold: the centred composition, fully visible, for 1000 ms
     1320         the phone starts its swing in from the right
     1410         it reaches the copy and knocks it aside
     1410 – 2230  the copy flies to its column, overshoots and rings back

   Desktop never re-wraps a line. The layout is always the final two-column
   grid; the centred state is that same layout with every row shifted onto
   the page axis. Each row (pretext, each headline line, each wrapped line
   of the paragraph, the button row) gets its own offset, so centred
   alignment resolves into left alignment during the move instead of
   snapping. Only transform and opacity animate, so the nav and hero never
   change size.

   A hero marked data-reflow (the home page) wraps differently in the two
   states, two lines of headline centred and three on the left, so rows
   cannot simply slide. There the centred composition is a copy of the
   text laid out centred; during the move the copy and the real text
   travel along the same path and cross-fade in its fastest part, and the
   button row, the same shape in both, slides as one piece.

   The travel is not eased, it is sprung. The phone swings in from the right
   and knocks the copy out of its way: the copy leaves fast, overshoots its
   column and rings back, and the phone, being the heavier body, only rebounds
   a little. Both curves come from the closed-form damped spring in spring.ts,
   sampled into keyframes.

   Web Animations API rather than CSS transitions: one clock, and every
   animation can be paused and seeked, which the review board uses to scrub.
   ========================================================================== */

import { springDuration, springKeyframes, type Spring } from './spring';

/**
 * The springs the entrance is built on. The phone is the heavier body: it
 * swings in, strikes the copy, and barely rebounds, while the copy is light
 * enough to be thrown past its mark and ring back.
 */
export const SPRING = {
  /** The copy, knocked aside. Overshoots about 11% of its travel. */
  copy: { stiffness: 210, damping: 17, mass: 1, velocity: 3.6 },
  /** The phone, swinging in. Heavier, so it rebounds about 5%. */
  phone: { stiffness: 165, damping: 19, mass: 1.1, velocity: 3.9 },
  /** The phone rising into a stacked layout, where it strikes nothing. */
  rise: { stiffness: 140, damping: 20, mass: 1, velocity: 1.2 },
} satisfies Record<string, Spring>;

/**
 * How long each row waits to feel the blow. The copy is not a rigid slab, so
 * the headline goes first and the rows below it follow a beat later.
 */
const ROW_LAG = [0, 26, 48];

/** The entrance timeline, in milliseconds. */
export interface Timeline {
  /** Copy opacity 0 -> 1. */
  fade: number;
  /** The centred composition, held still. */
  hold: number;
  /** The phone's swing before it makes contact. */
  approach: number;
  /** When the phone starts moving. */
  reveal: number;
  /** When it strikes the copy. */
  impact: number;
  /** The copy's spring, start to rest. */
  copy: number;
  /** The phone's spring, start to rest. */
  phone: number;
  /** The stacked phone's spring. */
  rise: number;
  phoneFade: number;
  /** How far the phone travels: sideways on desktop, up when stacked. */
  slide: number;
  lift: number;
  /** The cross-fade between the centred copy and the real one. */
  swap: number;
  /** The halo blooming behind the phone as it lands. */
  wash: number;
  end: number;
}

const fade = 320;
const hold = 1000;
const approach = 90;
const reveal = fade + hold;
const impact = reveal + approach;
const copy = springDuration(SPRING.copy);
const phone = springDuration(SPRING.phone);
const rise = springDuration(SPRING.rise);
const wash = 620;

export const T: Timeline = {
  fade,
  hold,
  approach,
  reveal,
  impact,
  copy,
  phone,
  rise,
  phoneFade: 260,
  slide: 120,
  lift: 44,
  swap: 360,
  wash,
  end: Math.max(
    reveal + Math.max(phone, rise),
    impact + copy + ROW_LAG[ROW_LAG.length - 1],
    impact + wash,
  ),
};

export const EASE_MOVE = 'cubic-bezier(0.55, 0, 0.2, 1)'; // gentle start, long soft landing
export const EASE_FADE = 'cubic-bezier(0.4, 0, 0.2, 1)';

const canAnimate = typeof Element !== 'undefined' && 'animate' in Element.prototype;

export function reducedMotion(): boolean {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* Resolves once the faces the hero uses are loaded, or after a
   timeout, so a font failure degrades to the fallback stack instead of
   hiding the hero. */
export function fontsReady(timeout?: number): Promise<unknown> {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const faces = [
    '700 80px Fraunces',
    '700 40px Fraunces',
    '600 60px Fraunces',
    '400 18px Inter',
    '500 16px Inter',
    '700 20px Inter',
  ];
  const loaded = Promise.all(faces.map((f) => document.fonts.load(f))).then(
    () => document.fonts.ready,
  );
  const cap = new Promise((resolve) => {
    setTimeout(resolve, timeout ?? 2500);
  });
  return Promise.race([loaded, cap]).catch(() => {});
}

/* A tab opened in the background would otherwise finish its entrance
   before anyone sees it. */
function whenVisible(): Promise<void> {
  if (!document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener('visibilitychange', function on() {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', on);
      resolve();
    });
  });
}

function splitWords(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Node[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const frag = document.createDocumentFragment();
    (node.nodeValue ?? '').split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
        return;
      }
      const w = document.createElement('span');
      w.className = 'w';
      w.textContent = part;
      frag.appendChild(w);
    });
    node.parentNode?.replaceChild(frag, node);
  });
}

/** A row of copy and how far it moves to sit on the page axis. */
interface Unit {
  el: HTMLElement;
  dx: number;
}

interface Offset {
  x: number;
  y: number;
}

export type HeroState = 'idle' | 'playing' | 'paused' | 'settled';

function shift(d: Offset, k: number): string {
  return 'translate(' + (d.x * k).toFixed(2) + 'px, ' + (d.y * k).toFixed(2) + 'px)';
}

export class Hero {
  readonly site: HTMLElement;
  readonly hero: HTMLElement;
  readonly inner: HTMLElement;
  readonly copy: HTMLElement;
  readonly phone: HTMLElement;
  readonly wash: HTMLElement | null;
  readonly flows: HTMLElement[];
  private readonly flowHTML: string[];
  anims: Animation[] = [];
  rate = 1;
  state: HeroState = 'idle';
  private run = 0;
  private ghost: HTMLElement | null = null;

  constructor(site: HTMLElement) {
    this.site = site;
    this.hero = site.querySelector<HTMLElement>('.hero')!;
    this.inner = this.hero.querySelector<HTMLElement>('.hero__in')!;
    this.copy = this.hero.querySelector<HTMLElement>('.hero__copy')!;
    this.phone = this.hero.querySelector<HTMLElement>('.hero__phone')!;
    this.wash = this.hero.querySelector<HTMLElement>('.hero__wash');
    this.flows = Array.from(this.hero.querySelectorAll<HTMLElement>('[data-flow]'));
    this.flowHTML = this.flows.map((p) => p.innerHTML);
  }

  layout(): string {
    return getComputedStyle(this.hero).getPropertyValue('--layout').trim() || 'split';
  }

  /* Horizontal offset that puts each row's centre on the page axis. Read
     from the final layout with no transforms applied. Divided by the scale
     so it also works inside the board's scaled frames. */
  units(): Unit[] {
    const scale = this.site.getBoundingClientRect().width / this.site.offsetWidth || 1;
    const box = this.inner.getBoundingClientRect();
    const axis = box.left + box.width / 2;
    const out: Unit[] = [];

    const push = (el: HTMLElement, left: number, right: number): void => {
      out.push({ el, dx: (axis - (left + right) / 2) / scale });
    };

    this.hero.querySelectorAll<HTMLElement>('[data-row]').forEach((el) => {
      const b = el.getBoundingClientRect();
      push(el, b.left, b.right);
    });

    this.flows.forEach((p) => {
      const lines: Array<{ top: number; left: number; right: number; words: HTMLElement[] }> = [];
      p.querySelectorAll<HTMLElement>('.w').forEach((w) => {
        const b = w.getBoundingClientRect();
        let line = null as (typeof lines)[number] | null;
        for (let i = 0; i < lines.length; i++) {
          if (Math.abs(lines[i].top - b.top) < 4 * scale) {
            line = lines[i];
            break;
          }
        }
        if (!line) {
          line = { top: b.top, left: b.left, right: b.right, words: [] };
          lines.push(line);
        }
        line.left = Math.min(line.left, b.left);
        line.right = Math.max(line.right, b.right);
        line.words.push(w);
      });
      lines.forEach((line) => {
        line.words.forEach((w) => push(w, line.left, line.right));
      });
    });

    return out;
  }

  clear(): void {
    this.run++;
    this.anims.forEach((a) => a.cancel());
    this.anims = [];
    const html = this.flowHTML;
    this.flows.forEach((p, i) => {
      if (p.querySelector('.w')) p.innerHTML = html[i];
    });
    if (this.ghost) {
      this.ghost.parentNode?.removeChild(this.ghost);
      this.ghost = null;
    }
  }

  /* The centred composition for a data-reflow hero: a copy of the text,
     hidden from assistive tech and from the pointer. The stylesheet lays
     it out (.hero__copy.is-intro); its button row only holds the space. */
  intro(): HTMLElement {
    const ghost = this.copy.cloneNode(true) as HTMLElement;
    ghost.classList.add('is-intro');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('inert', '');
    ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    this.copy.parentNode?.insertBefore(ghost, this.copy.nextSibling);
    this.ghost = ghost;
    return ghost;
  }

  /* Offset from an element's final place to its place in the centred
     composition, measured with no transforms applied. */
  offset(from: Element, to: Element): Offset {
    const scale = this.site.getBoundingClientRect().width / this.site.offsetWidth || 1;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    return {
      x: (a.left + a.width / 2 - b.left - b.width / 2) / scale,
      y: (a.top + a.height / 2 - b.top - b.height / 2) / scale,
    };
  }

  build(): Animation[] {
    this.clear();
    const stacked = this.layout() === 'stack';
    const reflow = !stacked && this.hero.hasAttribute('data-reflow');
    const A: Animation[] = [];
    const fill = 'both' as const;

    /* One blow, felt by every row: the same spring, offset by how long that
       row takes to feel it. k runs 0 -> 1 and past 1 on the overshoot. */
    const shove = (el: Element, at: (k: number) => string, lag: number): Animation =>
      el.animate(
        springKeyframes(SPRING.copy, (k) => ({ transform: at(k) })),
        { delay: T.impact + lag, duration: T.copy, fill },
      );

    if (!stacked && !reflow) this.flows.forEach(splitWords);
    const units = stacked || reflow ? [] : this.units();

    A.push(
      this.copy.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: T.fade,
        easing: EASE_FADE,
        fill,
      }),
    );

    units.forEach((u) => {
      A.push(shove(u.el, (k) => 'translateX(' + (u.dx * (1 - k)).toFixed(2) + 'px)', 0));
    });

    if (reflow) {
      const ghost = this.intro();
      A.push(
        ghost.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: T.fade,
          easing: EASE_FADE,
          fill,
        }),
      );
      ['.hero__title', '.hero__lede'].forEach((sel, row) => {
        const lag = ROW_LAG[row];
        const from = ghost.querySelector<HTMLElement>(sel)!;
        const to = this.copy.querySelector<HTMLElement>(sel)!;
        const d = this.offset(from, to);
        // Both travel the same path; the swap happens while it is fastest,
        // one out before the other comes in, so the two never show at once.
        A.push(shove(from, (k) => shift(d, -k), lag));
        A.push(shove(to, (k) => shift(d, 1 - k), lag));
        const swap: KeyframeAnimationOptions = { delay: T.impact + lag, duration: T.swap, fill };
        A.push(
          from.animate(
            [
              { opacity: 1 },
              { opacity: 1, offset: 0.1 },
              { opacity: 0, offset: 0.46 },
              { opacity: 0 },
            ],
            swap,
          ),
        );
        A.push(
          to.animate(
            [
              { opacity: 0 },
              { opacity: 0, offset: 0.46 },
              { opacity: 1, offset: 0.8 },
              { opacity: 1 },
            ],
            swap,
          ),
        );
      });
      const ctas = this.copy.querySelector<HTMLElement>('.hero__ctas');
      if (ctas) {
        const dc = this.offset(ghost.querySelector('.hero__ctas')!, ctas);
        A.push(shove(ctas, (k) => shift(dc, 1 - k), ROW_LAG[2]));
      }
    }

    /* The phone is the body doing the shoving, so it is already moving before
       the impact and all but home by the time the copy gives way. Stacked,
       there is nothing in its path, so it simply rises and settles. */
    if (stacked) {
      A.push(
        this.phone.animate(
          springKeyframes(SPRING.rise, (k) => ({
            transform: 'translateY(' + (T.lift * (1 - k)).toFixed(2) + 'px)',
          })),
          { delay: T.reveal, duration: T.rise, fill },
        ),
      );
    } else {
      A.push(
        this.phone.animate(
          springKeyframes(SPRING.phone, (k) => ({
            transform: 'translateX(' + (T.slide * (1 - k)).toFixed(2) + 'px)',
          })),
          { delay: T.reveal, duration: T.phone, fill },
        ),
      );
    }
    // It fades in over the first part of its swing: the blow has to be seen
    // coming, so the phone cannot still be arriving in opacity when it lands.
    A.push(
      this.phone.animate([{ opacity: 0 }, { opacity: 1 }], {
        delay: T.reveal,
        duration: T.phoneFade,
        easing: EASE_FADE,
        fill,
      }),
    );

    if (this.wash) {
      A.push(
        this.wash.animate([{ opacity: 0 }, { opacity: 1 }], {
          delay: T.impact,
          duration: T.wash,
          easing: EASE_FADE,
          fill,
        }),
      );
    }

    this.anims = A;
    this.hero.setAttribute('data-ready', '');
    return A;
  }

  play(): this {
    if (!canAnimate) return this.settle();
    this.build();
    const run = this.run;
    this.anims.forEach((a) => {
      a.playbackRate = this.rate;
      a.play();
    });
    this.state = 'playing';
    Promise.all(this.anims.map((a) => a.finished))
      .then(() => {
        if (this.run === run) this.settle();
      })
      .catch(() => {});
    return this;
  }

  /* Freeze at any moment of the timeline (the board's scrubber and its
     static "initial" frames). */
  seek(ms: number): this {
    if (!canAnimate) return this.settle();
    if (!this.anims.length) this.build();
    this.anims.forEach((a) => {
      a.pause();
      a.currentTime = ms;
    });
    this.state = 'paused';
    return this;
  }

  time(): number {
    const a = this.anims[0];
    return a && a.currentTime != null ? (a.currentTime as number) : T.end;
  }

  setRate(r: number): this {
    this.rate = r;
    this.anims.forEach((a) => {
      if (a.updatePlaybackRate) a.updatePlaybackRate(r);
      else a.playbackRate = r;
    });
    return this;
  }

  /* The final composition, with nothing left running. */
  settle(): this {
    this.clear();
    this.hero.setAttribute('data-ready', '');
    this.state = 'settled';
    return this;
  }
}

/* Page-load entrance. Plays once; never loops, never scroll-driven. */
export function autoplay(site: HTMLElement): Hero {
  const hero = new Hero(site);
  if (!canAnimate || reducedMotion()) return hero.settle();

  let width = site.offsetWidth;
  window.addEventListener('resize', () => {
    // A resize mid-entrance would leave the centring offsets stale.
    if (hero.state === 'playing' && site.offsetWidth !== width) hero.settle();
  });

  void fontsReady()
    .then(whenVisible)
    .then(() => {
      width = site.offsetWidth;
      hero.play();
    });
  return hero;
}

export const KHero = {
  T,
  EASE_MOVE,
  EASE_FADE,
  Hero,
  autoplay,
  fontsReady,
  reducedMotion,
};

declare global {
  interface Window {
    KHero?: typeof KHero;
  }
}

/** Starts the entrance on every hero the page marks for it. */
export function init(): void {
  window.KHero = KHero;
  document.querySelectorAll<HTMLElement>('[data-hero-autoplay]').forEach(autoplay);
}
