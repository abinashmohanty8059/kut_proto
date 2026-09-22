/* ==========================================================================
   Kutlerri redesign · RASA customer story, the encore (plate retraction)
   --------------------------------------------------------------------------
   The closing page carries the same picture and the same words as section 3,
   and deliberately not the same transition:

     section 3   the picture dissolves from the bottom up and the quote fades
                 in under it, as one block.
     the encore  the picture starts full bleed and retracts into a rounded
                 plate, counter-zooming so the storefront keeps its size,
                 and the quote lands one word at a time out of a blur. The
                 attribution slides in from the left once the words are down.

   One scroll clock drives all of it. The module writes custom properties, so
   the geometry itself stays in the stylesheet.
   ========================================================================== */

/* The plate's end frame. Vertical values are fractions of the viewport
   height, the horizontal one of its width, so the framing holds at any size.
   The bottom one is a floor: the plate always gives up at least as much room
   as the quote needs, so the words never land on the picture. */
const END = { top: .035, side: .045, bottom: .44, radius: 26, bottomMax: .66 };
const START_SCALE = 1.14;
const VEIL = { from: .34, to: .08 };

/* Where each part of the transition sits on the clock. The words wait for the
   plate to be framed; until then there is nowhere for them to land. */
const PLATE_DONE = .46;       // the plate is framed by here
const WORDS_FROM = .43;       // the first word starts to arrive
const WORDS_SPAN = .45;       // the last one has arrived by WORDS_FROM + this
const WORD_DUR = .13;         // how long one word takes
const SIG_FROM = .89;
const SIG_DUR = .11;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const smooth = (n: number): number => n * n * (3 - 2 * n);

/* Each word becomes a span carrying its own clock value. The spans are
   inline-block, so the spaces between them have to stay outside. */
function splitWords(p: HTMLElement): HTMLElement[] {
  const words = (p.textContent ?? '').trim().split(/\s+/);
  const frag = document.createDocumentFragment();
  const spans: HTMLElement[] = [];
  words.forEach((word, i) => {
    const span = document.createElement('span');
    span.className = 'encore__w';
    span.textContent = word;
    frag.append(span);
    if (i < words.length - 1) frag.append(document.createTextNode(' '));
    spans.push(span);
  });
  p.replaceChildren(frag);
  return spans;
}

export function init(): void {
  const encore = document.getElementById('encore');
  if (!encore) return;

  const words = encore.querySelector<HTMLElement>('.encore__words');
  const sign = encore.querySelector<HTMLElement>('.encore__attribution');
  if (!words || !sign) return;

  const body = encore.querySelector<HTMLElement>('.encore__body');
  if (!body) return;

  const spans = splitWords(words);
  const last = new Array<number>(spans.length).fill(-1);

  /* How far up the frame the plate has to stop. Measured, not guessed: the
     quote's height moves with the viewport, the font and the wrap. */
  let clearance = 0;
  const measure = (): void => {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    clearance = Math.min(vh * END.bottomMax, Math.max(vh * END.bottom, body.offsetHeight + 20));
  };

  const setPlate = (t: number, x: number, b: number, r: number, lift: number, scale: number, veil: number): void => {
    const s = encore.style;
    s.setProperty('--plate-t', t.toFixed(1) + 'px');
    s.setProperty('--plate-x', x.toFixed(1) + 'px');
    s.setProperty('--plate-b', b.toFixed(1) + 'px');
    s.setProperty('--plate-r', r.toFixed(1) + 'px');
    s.setProperty('--plate-lift', lift.toFixed(3));
    s.setProperty('--img-scale', scale.toFixed(4));
    s.setProperty('--veil', veil.toFixed(3));
  };

  /* No scrubbing under reduced motion: the plate is already framed, the words
     are already down. The stylesheet unpins the section to match. */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    measure();
    setPlate(vh * END.top, vw * END.side, clearance, END.radius, 1, 1, VEIL.to);
    spans.forEach((span) => span.style.setProperty('--w', '1'));
    sign.style.setProperty('--sig', '1');
    return;
  }

  let ticking = false;

  function update(): void {
    ticking = false;
    const rect = encore!.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.bottom <= 0 || rect.top >= vh) return;

    const scrollable = rect.height - vh;
    if (scrollable <= 0) return;
    const p = clamp01(-rect.top / scrollable);
    const vw = window.innerWidth || document.documentElement.clientWidth;

    /* The plate retracts. */
    const plate = smooth(clamp01(p / PLATE_DONE));
    setPlate(
      plate * END.top * vh,
      plate * END.side * vw,
      plate * clearance,
      plate * END.radius,
      plate,
      START_SCALE - plate * (START_SCALE - 1),
      VEIL.from - plate * (VEIL.from - VEIL.to),
    );

    /* The words land, staggered across WORDS_SPAN. */
    const step = spans.length > 1 ? (WORDS_SPAN - WORD_DUR) / (spans.length - 1) : 0;
    for (let i = 0; i < spans.length; i++) {
      const w = smooth(clamp01((p - (WORDS_FROM + i * step)) / WORD_DUR));
      /* Two decimals is finer than the eye reads, and it keeps the settled
         words out of the write path entirely. */
      const q = Math.round(w * 100) / 100;
      if (q !== last[i]) {
        spans[i].style.setProperty('--w', String(q));
        last[i] = q;
      }
    }

    sign!.style.setProperty('--sig', smooth(clamp01((p - SIG_FROM) / SIG_DUR)).toFixed(3));
  }

  function onScroll(): void {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  function onResize(): void {
    measure();
    onScroll();
  }

  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
  window.addEventListener('resize', onResize, { passive: true });
  /* The quote is set in a web font; its height is only final once that lands. */
  document.fonts?.ready.then(onResize);

  measure();
  update();
}
