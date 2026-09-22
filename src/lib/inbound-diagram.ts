/* ==========================================================================
   Kutlerri redesign · Section 3 · Inbound, one channel at a time
   --------------------------------------------------------------------------
   The phone is the whole story, so everything comes out of it. One agent card
   at a time is thrown from the phone's screen to the reading position on the
   left, works its conversation through, and is drawn back in — and the moment
   it lands, the order it captured appears in Today.

   Three channels, in turn:

     0 – 14.7    the call
     14.7 – 29.4 email and SMS, on the same order
     29.4 – 44.1 the website chat, inside the restaurant's own page
     44.1 – 47.3 Today holds, full, then clears back to what it started with

   The flight out is a spring (spring.ts), so the card leaves with real
   velocity and settles rather than easing; the flight back accelerates away
   instead, because it is being taken rather than thrown. update(t) is a pure
   function of one clock, so the card clicks, the hold on hover and the loop
   all run through the same path.
   ========================================================================== */

import { face, icon, mix, p, put, span, type Moving } from './motion-engine';
import { springDuration, springProgress, type Spring } from './spring';

/** Thrown out of the phone: leaves fast, overshoots its mark, settles. */
const FLIGHT: Spring = { stiffness: 100, damping: 14, mass: 1, velocity: 1.0 };

/** How small a card is while it is still inside the phone's screen, chosen so
    it reads as one of the request tiles in the list it came from. */
const TUCKED = 0.28;

/** One customer -> agent branch and every part of it that moves. */
interface Branch {
  el: HTMLElement;
  card: Moving;
  node: Moving | null;
  body: HTMLElement;
  state: HTMLElement;
  stateText: HTMLElement;
  sum: Moving;
  hint: Moving | null;
  turns: Moving[];
  thread: HTMLElement;
  inner: HTMLElement | null;
  bars: HTMLElement;
  timer: HTMLElement | null;
  /** The height the card shrinks to once it is holding only its summary. */
  hDone: number;
  /** How far the transcript travels to keep message n at the foot of the pane. */
  steps: number[];
  /** The transcript height needed to hold messages 0..n, capped at the pane. */
  need: number[];
  /** The tallest the transcript pane gets, with the card fully open. */
  paneMax: number;
  /** The state chip currently shown: 0 ready, 1 live, 2 captured. */
  st?: number;
  _tf?: string;
  _h?: string;
  _si?: string;
}

/** One channel's turn: when it flies, and what happens while it is out. */
interface Beat {
  /** When the card is thrown from the phone. */
  out: number;
  /** Message times, counted from the moment the card lands. */
  turns: number[];
  /** When the conversation gives way to the summary, from landing. */
  capture: number;
  /** When the card starts back, from landing. */
  back: number;
  /** What the state chip reads while it is working. */
  live: string;
}

/** A request waiting in the phone's Today list. */
interface Request {
  at: number;
  /** Already waiting when the loop starts. */
  base?: boolean;
}

interface Measures {
  /** Where a card sits when it has landed, within the flow. */
  slotY: number;
  /** From a landed card's centre to the phone's screen, in card coordinates. */
  flyX: number;
  flyY: number;
  /** The expanded card height, from the stylesheet. */
  exp: number;
  /** One Figma unit in pixels on the app screen. */
  u: number;
  invH: number[];
  listH: number;
}

declare global {
  interface Window {
    KInbound?: {
      LOOP: number;
      B: Beat[];
      INV: Request[];
      RESET: number;
      seek: (ms: number) => void;
      pause: () => void;
      play: () => void;
      time: () => number;
      pose: () => void;
    };
  }
}

/* The diagram writes to the same handful of style properties every frame, and
   most of them do not change on most frames. This cache remembers the last
   value written so the redundant writes never reach the DOM. */
const styleCache = new WeakMap<Element, Map<string, string>>();

type Cached = 'opacity' | 'display' | 'pointerEvents';

function setS(el: HTMLElement, name: Cached, v: string): void {
  let c = styleCache.get(el);
  if (!c) styleCache.set(el, (c = new Map()));
  if (c.get(name) === v) return;
  c.set(name, v);
  el.style[name] = v;
}

/** Drops a remembered value, so the next frame writes it again. */
function forget(el: HTMLElement, name: Cached): void {
  styleCache.get(el)?.delete(name);
}

export function init(): void {
  const found = document.querySelector<HTMLElement>('.ib');
  if (!found) return;
  const sec: HTMLElement = found;

  const reduce = !!(
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  const q = <T extends Element = HTMLElement>(s: string, r?: ParentNode): T | null =>
    (r ?? sec).querySelector<T>(s);
  const qa = <T extends Element = HTMLElement>(s: string, r?: ParentNode): T[] =>
    Array.from((r ?? sec).querySelectorAll<T>(s));
  const num = (name: string): number =>
    parseFloat(getComputedStyle(sec).getPropertyValue(name)) || 0;

  /* --- the parts ---------------------------------------------------------- */

  const flow = q('[data-flow]')!;
  const invCards = qa<Moving>('[data-inv]');
  const needs = qa<Moving>('[data-need]');
  const list = q('[data-list]')!;
  const actions = q('[data-actions]');
  const screen = q('.phone__screen')!;

  const branches: Branch[] = qa('.ib-branch').map((el) => ({
    el,
    card: q<Moving>('[data-card]', el)!,
    node: q<Moving>('.ib-node', el),
    body: q('.ib-body', el)!,
    state: q('[data-state]', el)!,
    stateText: q('[data-statetext]', el)!,
    sum: q<Moving>('[data-sum]', el)!,
    hint: q<Moving>('[data-hint]', el),
    turns: qa<Moving>('[data-turn]', el),
    thread: q('[data-thread]', el)!,
    inner: q('[data-threadin]', el),
    bars: q('[data-bars]', el)!,
    timer: q('[data-timer]', el),
    hDone: 0,
    steps: [],
    need: [],
    paneMax: 0,
  }));

  qa<HTMLElement>('[data-face] img').forEach((img) => {
    (img as HTMLImageElement).src = face(
      Number((img.parentNode as HTMLElement).getAttribute('data-face')) || 4,
    );
  });

  /* Icons the app screen needs that the shared set does not carry. */
  const ICON: Record<string, string> = {
    cell: '<svg viewBox="0 0 17 11" aria-hidden="true"><rect y="7.4" width="3" height="3.6" rx="1"/><rect x="4.7" y="5" width="3" height="6" rx="1"/><rect x="9.4" y="2.5" width="3" height="8.5" rx="1"/><rect x="14.1" width="3" height="11" rx="1"/></svg>',
    wifi: '<svg viewBox="0 0 16 11" aria-hidden="true"><path d="M8 10.9 5.5 8.2a3.6 3.6 0 0 1 5 0L8 10.9Z"/><path d="M8 4.4c1.8 0 3.5.7 4.8 1.9l1.5-1.6A9.3 9.3 0 0 0 8 2.2a9.3 9.3 0 0 0-6.3 2.5l1.5 1.6A7 7 0 0 1 8 4.4Z"/></svg>',
    batt: '<svg viewBox="0 0 25 12" aria-hidden="true"><rect x=".5" y=".5" width="21" height="11" rx="3.4" opacity=".28"/><rect x="2.1" y="2.1" width="17.8" height="7.8" rx="2.1"/><path d="M23.1 4.1a2 2 0 0 1 0 3.8V4.1Z" opacity=".35"/></svg>',
    person:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.4" r="3.7"/><path d="M5 20c.7-3.7 3.5-6 7-6s6.3 2.3 7 6"/></svg>',
    spark:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.6c.9 5 4.5 8.6 9.5 9.5-5 .9-8.6 4.5-9.5 9.5-.9-5-4.5-8.6-9.5-9.5 5-.9 8.6-4.5 9.5-9.5Z"/></svg>',
    chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 15 7-7 7 7"/></svg>',
    reply:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5"/><path d="M4 12h9a7 7 0 0 1 7 7"/></svg>',
  };
  qa('[data-ico]').forEach((el) => {
    const n = el.getAttribute('data-ico')!;
    el.innerHTML = ICON[n] ?? icon(n);
  });

  /* The live waveform in the call bar: one strip, sized to the bar it sits in. */
  const BARS = 32;
  const bars: Moving[] = [];
  let lastAmp = -1;
  {
    const host = branches[0].bars;
    for (let i = 0; i < BARS; i++) {
      const b = document.createElement('i') as Moving;
      if (i > BARS * 0.62 && i < BARS * 0.78) b.style.background = '#C79BE8';
      host.appendChild(b);
      bars.push(b);
    }
  }

  /* --- the timeline -------------------------------------------------------- */

  const FLY = springDuration(FLIGHT); // thrown out and settled
  const RETURN = 460; // drawn back in
  const GAP = 300; // a beat between one card leaving and the next arriving
  const GROW = 420; // the card closing down onto its summary

  /* Each channel keeps its own rhythm, counted from the moment it lands. */
  const SCRIPT: Array<Omit<Beat, 'out'>> = [
    {
      turns: [620, 2500, 4600, 7000, 9600, 10700],
      capture: 12100,
      back: 13100,
      live: 'Call connected',
    },
    {
      turns: [620, 2500, 4800, 6200, 7900, 9700],
      capture: 11100,
      back: 12100,
      live: 'Replying',
    },
    {
      turns: [620, 2400, 4400, 6600, 8800, 9800],
      capture: 11200,
      back: 12200,
      live: 'Chat open',
    },
  ];

  /* One channel's whole turn: out, held while it works, and back. */
  const STEP = SCRIPT.map((s) => FLY + s.back + RETURN + GAP);
  const B: Beat[] = SCRIPT.map((s, i) => ({
    ...s,
    out: STEP.slice(0, i).reduce((a, b) => a + b, 0),
  }));

  /** When channel i is home again, which is when its order lands in Today. */
  const home = (i: number): number => B[i].out + FLY + B[i].back + RETURN;

  const FINALE = 3000; // Today, full, held before it clears
  const RESET = home(2) + FINALE;
  const LOOP = RESET + 1900;

  /* Requests land right through the loop. Three of them are the conversations
     on the left, arriving exactly as their card is drawn back in; the rest are
     the same agents working off-screen. The count only ever climbs. */
  const INV: Request[] = [
    { at: -1, base: true }, // already waiting when the loop starts
    { at: -1, base: true },
    { at: 4200 },
    { at: 9000 },
    { at: home(0) },
    { at: 21500 },
    { at: home(1) },
    { at: 36000 },
    { at: home(2) },
  ].sort((a, b) => a.at - b.at);
  const BASE = INV.filter((c) => c.base).length;

  const SCROLL = 360; // the transcript makes room before the message lands

  /* --- measurements -------------------------------------------------------- */

  const M = {} as Measures;

  function measure(): void {
    M.exp = num('--h-exp');

    const flowBox = flow.getBoundingClientRect();
    // The one card that is out sits in the middle of the column, and the slot
    // is measured from the expanded height so it never shifts when the card
    // closes down onto its summary.
    M.slotY = Math.max(0, (flowBox.height - M.exp) / 2);

    /* Every card is laid out in the same slot, so one measurement serves all
       three: from the card's landed centre to the middle of the phone's
       screen, which is where it is thrown from and taken back to. */
    const b0 = branches[0];
    const h0 = b0.card.style.height;
    const t0 = b0.card.style.transform;
    b0.card.style.transform = 'none';
    b0.card.style.height = M.exp + 'px';
    const cardBox = b0.card.getBoundingClientRect();
    const screenBox = screen.getBoundingClientRect();
    M.flyX = screenBox.left + screenBox.width / 2 - (cardBox.left + cardBox.width / 2);
    M.flyY = screenBox.top + screenBox.height / 2 - (cardBox.top + cardBox.height / 2);

    /* How far the transcript must travel to bring each message to the bottom
       of the pane. offsetTop and offsetHeight are layout values: unlike
       getBoundingClientRect they ignore the transcript's own transform, so
       re-measuring mid-sequence cannot drift. The column hangs from the
       bottom, so the offset is how far to push it down — zero for the last. */
    branches.forEach((b) => {
      /* A hidden branch measures as nothing, and update() hides every channel
         but the one that is out, so each is shown again for its measurement
         and the remembered value dropped so the next frame re-asserts it. */
      const keepD = b.el.style.display;
      const keepO = b.body.style.opacity;
      const keepH = b.card.style.height;
      const keepT = b.card.style.transform;
      b.el.style.display = '';
      b.card.style.transform = 'none';
      b.card.style.height = M.exp + 'px';
      b.body.style.opacity = '1';
      const innerH = b.inner ? b.inner.offsetHeight : 0;
      b.paneMax = b.thread.clientHeight;
      const top0 = b.turns.length ? b.turns[0].offsetTop : 0;
      // The column hangs from the bottom, so this is how far to push it down to
      // bring message n to the foot of the pane — the way a chat behaves.
      b.steps = b.turns.map((el) => innerH - (el.offsetTop + el.offsetHeight));
      // And this is how much room messages 0..n actually take, so the card can
      // be only as tall as the conversation it is holding.
      b.need = b.turns.map((el) =>
        Math.min(b.paneMax, el.offsetTop + el.offsetHeight - top0),
      );
      b.hDone = b.card.querySelector<HTMLElement>('.ib-card__head')!.offsetHeight + b.sum.offsetHeight;
      b.card.style.height = keepH;
      b.card.style.transform = keepT;
      b.body.style.opacity = keepO;
      b.el.style.display = keepD;
      forget(b.el, 'display');
      forget(b.body, 'opacity');
    });
    b0.card.style.height = h0;
    b0.card.style.transform = t0;

    // The app screen is laid out in the Figma frame's units; one unit in pixels:
    M.u = screen.offsetWidth / 402;
    invCards.forEach((el) => {
      el.style.display = '';
      el._d = '';
    });
    M.invH = invCards.map((el) => el.offsetHeight);
    M.listH = list.clientHeight;
  }

  /* --- the flight ---------------------------------------------------------- */

  /**
   * How far channel i has come out of the phone at time t: 0 tucked inside the
   * screen, 1 landed in its slot, briefly past 1 on the overshoot.
   */
  function reach(i: number, t: number): number {
    const c = B[i];
    const land = c.out + FLY;
    const leave = land + c.back;
    if (t < c.out) return 0;
    if (t < land) return springProgress(FLIGHT, t - c.out, FLY);
    if (t < leave) return 1;
    // Taken back rather than thrown: it accelerates away instead of settling.
    return 1 - p(t, leave, leave + RETURN, 'leave');
  }

  function amp(t: number): number {
    // Quiet while the customer speaks, fuller while Kutlerri answers.
    const c = B[0];
    const land = c.out + FLY;
    let a = 0.1;
    [1, 3, 5].forEach((k) => {
      const at = land + c.turns[k];
      a += 0.72 * span(t, at - 250, at + 150, at + 1250, at + 1600, 'fade');
    });
    [0, 2, 4].forEach((k) => {
      const at = land + c.turns[k];
      a += 0.16 * span(t, at - 200, at + 150, at + 1100, at + 1400, 'fade');
    });
    return Math.min(1, a);
  }

  function update(t: number): void {
    branches.forEach((b, i) => {
      const c = B[i];
      const land = c.out + FLY;
      const k = reach(i, t);

      /* The flight. At k = 0 the card's centre sits on the middle of the
         phone's screen, shrunk to a tile and behind the phone; at k = 1 it is
         full size in its slot. The scale is about the card's own middle, so
         the centre is all that has to be carried. */
      const scale = Math.min(1.035, mix(TUCKED, 1, k));
      const tf =
        'translate3d(' +
        (M.flyX * (1 - k)).toFixed(1) +
        'px,' +
        mix(M.flyY, M.slotY, k).toFixed(1) +
        'px,0) scale(' +
        scale.toFixed(4) +
        ')';
      if (b._tf !== tf) {
        b.card.style.transform = tf;
        b._tf = tf;
      }

      // It fades up out of the screen as it leaves and dissolves as it returns.
      const lit =
        p(t, c.out, c.out + 200, 'fade') *
        (1 - p(t, land + c.back + RETURN * 0.45, land + c.back + RETURN, 'fade'));
      setS(b.card, 'opacity', lit.toFixed(3));
      setS(b.card, 'pointerEvents', k > 0.9 ? 'auto' : 'none');
      // Nothing is drawn at all outside this channel's turn.
      setS(b.el, 'display', lit < 0.004 ? 'none' : '');
      if (lit < 0.004) return;

      /* The card holds the conversation it has, and no more. It opens just
         far enough for the first message and grows a little ahead of each one
         after it, reaching full height only once the transcript has filled —
         so there is never an empty rectangle waiting to be filled. */
      let want = M.exp - (b.paneMax - (b.need[0] ?? b.paneMax));
      b.need.forEach((n, i) => {
        const at = c.turns[i];
        if (at == null || !i) return;
        want = mix(want, M.exp - (b.paneMax - n), p(t, land + at - 140, land + at + 260, 'glide'));
      });

      /* Folded down to its summary while it is inside the phone, opened out as
         it lands, and closed again before it is taken back. */
      const opened = Math.max(0, Math.min(1, k));
      let h = mix(b.hDone, want, opened);
      h = mix(h, b.hDone, p(t, land + c.capture, land + c.capture + GROW, 'glide'));
      const ch = h.toFixed(1) + 'px';
      if (b._h !== ch) {
        b.card.style.height = ch;
        b._h = ch;
      }

      /* The customer only appears once the agent has landed and is listening,
         and leaves before the card is taken back. It is laid out at the top of
         the row, so it takes the same drop as the card to sit beside its head. */
      if (b.node) {
        put(b.node, {
          y: M.slotY,
          o:
            p(t, land - 120, land + 220, 'fade') *
            (1 - p(t, land + c.capture, land + c.capture + 260, 'fade')),
        });
      }

      const open =
        p(t, land - 60, land + 220, 'fade') *
        (1 - p(t, land + c.capture, land + c.capture + 260, 'fade'));
      b.el.classList.toggle('is-live', t >= land && t < land + c.capture + 200);
      setS(b.body, 'opacity', open.toFixed(3));

      // The state chip: ready, in progress, then captured.
      const st = t >= land + c.capture ? 2 : t >= c.out ? 1 : 0;
      if (b.st !== st) {
        b.st = st;
        b.stateText.textContent = st === 1 ? c.live : st === 2 ? 'Captured' : 'Ready';
        b.state.classList.toggle('is-live', st === 1);
        b.state.classList.toggle('is-done', st === 2);
      }

      /* The transcript makes room first (the space is already reserved, the
         message is still invisible), and the message fades in once the scroll
         has settled, so no message is ever shown cut in half. */
      let sc = b.steps.length ? b.steps[0] : 0;
      b.steps.forEach((s, n) => {
        const at = c.turns[n];
        if (at == null || !n) return;
        sc = mix(sc, s, p(t, land + at, land + at + SCROLL, 'glide'));
      });
      if (b.inner) {
        const si = 'translate3d(0,' + sc.toFixed(1) + 'px,0)';
        if (b._si !== si) {
          b.inner.style.transform = si;
          b._si = si;
        }
      }

      /* A message rises the last few pixels into place as it comes in, which
         is what separates it arriving from it simply being switched on. */
      c.turns.forEach((at, n) => {
        const el = b.turns[n];
        if (!el) return;
        const a = p(t, land + at, land + at + 420, 'settle');
        put(el, {
          y: (1 - a) * 14,
          s: mix(0.972, 1, a),
          o: p(t, land + at, land + at + 240, 'fade'),
        });
      });

      // The compact summary the card carries home.
      const sumO = p(t, land + c.capture + 200, land + c.capture + 520, 'fade');
      put(b.sum, { o: sumO });
      /* The idle line shares the row with both the conversation and the
         summary, so it clears for whichever of them is showing. */
      if (b.hint) put(b.hint, { o: Math.max(0, 1 - Math.max(open, sumO) * 1.8) });
    });

    /* The waveform and the call timer, only while the call is on screen and
       scaled rather than resized so the bars never trigger layout. */
    const call = B[0];
    const callLand = call.out + FLY;
    const a = t < callLand + call.capture + 400 ? amp(t) : 0;
    if (a !== lastAmp) {
      lastAmp = a;
      bars.forEach((bar, k) => {
        const wob = 0.34 + 0.66 * Math.abs(Math.sin(k * 0.82 + t / 128));
        // 18.1px is the bar height in the CSS
        const sy = Math.max(0.18, (3.4 + 14.6 * a * wob) / 18.1);
        const tf = 'scaleY(' + sy.toFixed(3) + ')';
        if (bar._tf !== tf) {
          bar.style.transform = tf;
          bar._tf = tf;
        }
        const op = (0.26 + 0.62 * a * wob).toFixed(3);
        if (bar._op !== op) {
          bar.style.opacity = op;
          bar._op = op;
        }
      });
    }
    const tmr = branches[0].timer;
    if (tmr) {
      const el = Math.max(0, Math.min(callLand + call.capture, t) - callLand) / 1000;
      const mm = Math.floor(el / 60);
      const ss = Math.floor(el % 60);
      const label = (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
      if (tmr.textContent !== label) tmr.textContent = label;
    }

    /* --- the phone -------------------------------------------------------- */
    /* The reset swaps the list back to its two standing requests behind a
       short fade. Collapsing the stack in view instead would slide seven
       cards through each other on the way out. */
    const swap = Math.min(
      1,
      1 - p(t, RESET, RESET + 220, 'fade') + p(t, RESET + 430, RESET + 780, 'fade'),
    );
    const clear = t >= RESET + 240 ? 0 : 1;
    setS(list, 'opacity', swap.toFixed(3));
    const gapPx = 16 * M.u;
    const landed = INV.map((c) => (c.base ? 1 : p(t, c.at, c.at + 520, 'settle') * clear));

    // A new request takes the top of the list and pushes the rest down.
    invCards.forEach((el, a2) => {
      let cy = 0;
      for (let b = a2 + 1; b < INV.length; b++) cy += (M.invH[b] + gapPx) * landed[b];
      // A card on its way off the bottom dissolves rather than being sliced
      // by the edge of the list.
      const out = Math.max(0, Math.min(1, (cy - (M.listH - M.invH[a2])) / (M.invH[a2] * 0.5)));
      const live = INV[a2].base ? 1 : p(t, INV[a2].at, INV[a2].at + 360, 'fade') * clear;
      // a standing request never leaves
      if (INV[a2].base) cy = Math.min(cy, M.listH - M.invH[a2]);
      const vis = live * (1 - out);
      const off = vis < 0.004 ? 'none' : '';
      if (el._d !== off) {
        el.style.display = off;
        el._d = off;
      }
      if (off) return;
      put(el, { y: cy - (1 - landed[a2]) * 16 * M.u, o: vis });
    });

    /* "Needs your approval", and the actions counter beside it. Both step back
       to their opening values while they are faded out on the reset, so neither
       is ever seen counting down. */
    let n = landed.reduce((s, x) => s + x, 0);
    if (t >= RESET + 240) n = BASE;
    const roll = 29 * M.u;
    needs.forEach((el, k) => {
      put(el, { y: (k - n) * roll, o: Math.max(0, 1 - 1.8 * Math.abs(k - n)) * swap });
    });
    if (actions) {
      const acts = 12 + Math.round((25 * (n - BASE)) / (INV.length - BASE));
      if (actions.textContent !== String(acts)) actions.textContent = String(acts);
      actions.style.opacity = swap.toFixed(3);
    }
  }

  /* The still for reduced motion: the last channel landed, Today filled. */
  function pose(): void {
    measure();
    update(B[2].out + FLY + B[2].turns[B[2].turns.length - 1] + 400);
  }

  /* --- the clock ----------------------------------------------------------- */

  let t = 0;
  let last = 0;
  let playing = false;
  let held = false;
  let onScreen = false;

  const vh = (): number => window.innerHeight || document.documentElement.clientHeight;

  function look(): void {
    const r = sec.getBoundingClientRect();
    onScreen = r.bottom > vh() * 0.12 && r.top < vh() * 0.88;
  }

  function tick(now: number): void {
    requestAnimationFrame(tick);
    const dt = Math.min(64, now - last);
    last = now;
    if (!(playing && onScreen && !held)) return; // paused, held or out of view
    t = (t + dt) % LOOP;
    update(t);
  }

  const setPlaying = (on: boolean): void => {
    playing = on;
  };

  /** Jump to the moment channel i is thrown out. */
  function go(i: number): void {
    t = Math.max(0, B[i].out - 120);
    if (!reduce) setPlaying(true);
    measure();
    update(t);
  }

  branches.forEach((b, k) => {
    b.card.addEventListener('click', () => go(k));
    b.card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go(k);
      }
    });
    // Reading a conversation holds the sequence where it is.
    b.card.addEventListener('pointerenter', () => {
      held = true;
    });
    b.card.addEventListener('pointerleave', () => {
      held = false;
    });
  });
  window.addEventListener('resize', () => {
    measure();
    update(t);
  });
  document.addEventListener('scroll', look, { passive: true, capture: true });

  measure();
  if (reduce) {
    pose();
  } else {
    look();
    setPlaying(true);
    last = performance.now();
    requestAnimationFrame(tick);
  }
  if (document.fonts && document.fonts.ready) {
    void document.fonts.ready.then(() => {
      measure();
      if (reduce) pose();
      else update(t);
    });
  }

  window.KInbound = {
    LOOP,
    B,
    INV,
    RESET,
    seek(ms: number) {
      t = ((ms % LOOP) + LOOP) % LOOP;
      measure();
      update(t);
    },
    pause() {
      setPlaying(false);
    },
    play() {
      setPlaying(true);
    },
    time() {
      return t;
    },
    pose,
  };
}
