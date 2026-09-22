/* ==========================================================================
   Kutlerri redesign · "How it works", designs B and C
   --------------------------------------------------------------------------
   B (.dk)  a deck. The track is 100svh plus a step per capability; its stage
            is sticky. Scroll progress decides, for every card, whether it is
            still below, rising, or settled on the stack behind the front one.
   C (.tb)  a player. No pinning and no scroll hijack: the active tab runs for
            one loop (8 s) and hands over to the next, its progress drawn
            under the tab. Clicking a tab takes it. It only runs while the
            section is on screen, and never under reduced motion.
   Both read scroll position from a rect check on scroll, as home.js does
   (see Website/DESIGN.md: no IntersectionObserver).
   ========================================================================== */

const LOOP = 8000; // one motion loop

const reduce = (): boolean =>
  !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

const vh = (): number => window.innerHeight || document.documentElement.clientHeight;

function onScreen(el: HTMLElement, margin?: number): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > -(margin ?? 0) && r.top < vh() + (margin ?? 0);
}

function playOnly(
  vids: HTMLVideoElement[],
  i: number,
  live: boolean,
  restart?: boolean,
): void {
  vids.forEach((v, k) => {
    if (k !== i) {
      v.pause();
      return;
    }
    if (!live || reduce()) {
      v.pause();
      return;
    }
    if (restart) {
      try {
        v.currentTime = 0;
      } catch {
        /* not seekable yet */
      }
    }
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  });
}

/* --- B · the deck -------------------------------------------------------- */

function ease(x: number): number {
  // gentle start, soft landing
  return x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
}

function deck(): void {
  const sec = document.querySelector<HTMLElement>('.dk');
  if (!sec) return;

  const track = sec.querySelector<HTMLElement>('.dk__track')!;
  const cards = Array.from(sec.querySelectorAll<HTMLElement>('.dk__card'));
  const vids = cards.map((c) => c.querySelector<HTMLVideoElement>('video')!);
  const ticks = Array.from(sec.querySelectorAll<HTMLElement>('.dk__rail i'));
  const N = cards.length;
  let cur = -1;
  let live = false;

  vids.forEach((v) => {
    v.muted = true;
  });
  cards.forEach((c, k) => {
    c.style.zIndex = String(k + 1);
  });

  function update(): void {
    const r = track.getBoundingClientRect();
    const total = track.offsetHeight - vh();
    const p = total > 0 ? Math.min(N - 0.0001, Math.max(0, -r.top / total) * N) : 0;
    const h = cards[0].offsetHeight;

    cards.forEach((card, k) => {
      const rel = p - k; // < 0 below, 0 front, > 0 behind
      let y: number;
      let s: number;
      let o: number;
      if (rel <= -0.35) {
        y = h + 60;
        s = 1;
        o = rel < -0.36 ? 0 : 1;
      } else if (rel < 0) {
        // A card rests for the first two thirds of its step; the next one
        // rises over the last third. Most of the scroll is spent reading a
        // settled card rather than watching one move.
        y = (1 - ease((rel + 0.35) / 0.35)) * (h + 60);
        s = 1;
        o = 1;
      } else {
        const d = Math.min(rel, 3);
        y = -d * 22;
        s = 1 - d * 0.035;
        o = rel > 3.4 ? 0 : 1;
      }
      card.style.transform =
        'translate3d(0,' + y.toFixed(1) + 'px,0) scale(' + s.toFixed(4) + ')';
      card.style.opacity = String(o);
    });

    // the card that is mostly up
    const i = Math.min(N - 1, Math.max(0, Math.floor(p + 0.15)));
    const vis = r.bottom > 0 && r.top < vh();
    if (i !== cur || vis !== live) {
      const changed = i !== cur;
      cur = i;
      live = vis;
      ticks.forEach((t, k) => t.classList.toggle('is-on', k <= i));
      playOnly(vids, i, live, changed);
    }
  }

  document.addEventListener('scroll', update, { passive: true, capture: true });
  window.addEventListener('resize', update);
  update();
}

/* --- C · the player ------------------------------------------------------ */

function player(): void {
  const found = document.querySelector<HTMLElement>('.tb');
  if (!found) return;
  const sec: HTMLElement = found;

  const tabs = Array.from(sec.querySelectorAll<HTMLElement>('.tb__tab'));
  const vids = Array.from(sec.querySelectorAll<HTMLVideoElement>('.tb__panel video'));
  const copy = sec.querySelector<HTMLElement>('.tb__copy')!;
  const title = copy.querySelector('h3')!;
  const text = copy.querySelector('p')!;
  const N = tabs.length;
  let cur = -1;
  let t0 = 0;
  let held = false;
  const COPY: Array<[string | null, string | null]> = tabs.map((b) => [
    b.getAttribute('data-title'),
    b.getAttribute('data-desc'),
  ]);

  vids.forEach((v) => {
    v.muted = true;
  });

  function paint(p: number): void {
    tabs.forEach((b, k) => {
      b.querySelector<HTMLElement>('i')!.style.setProperty(
        '--p',
        String(k < cur ? 1 : k === cur ? p.toFixed(3) : 0),
      );
    });
  }

  function show(i: number, why?: string): void {
    if (i === cur) return;
    cur = i;
    t0 = performance.now();
    tabs.forEach((b, k) => b.setAttribute('aria-selected', k === i ? 'true' : 'false'));
    vids.forEach((v, k) => v.classList.toggle('is-on', k === i));
    playOnly(vids, i, onScreen(sec), true);
    // The copy swaps out, changes, and comes back, so the two never cross.
    copy.classList.add('is-swapping');
    setTimeout(
      () => {
        title.textContent = COPY[i][0];
        text.textContent = COPY[i][1];
        copy.classList.remove('is-swapping');
      },
      reduce() || why === 'init' ? 0 : 200,
    );
  }

  function tick(now: number): void {
    requestAnimationFrame(tick);
    const live = onScreen(sec, -80); // mostly on screen before it runs
    if (!live || held || reduce()) {
      t0 = now - Math.min(now - t0, LOOP * 0.98); // hold where it is
      if (!live) playOnly(vids, cur, false);
      else playOnly(vids, cur, true);
      return;
    }
    const p = (now - t0) / LOOP;
    if (p >= 1) {
      show((cur + 1) % N);
      return;
    }
    paint(p);
    const v = vids[cur];
    if (v && v.paused) playOnly(vids, cur, true);
  }

  tabs.forEach((b, k) => {
    b.addEventListener('click', () => {
      show(k, 'click');
      paint(0);
    });
  });
  sec.addEventListener('pointerenter', () => {
    held = true;
  });
  sec.addEventListener('pointerleave', () => {
    held = false;
    t0 = performance.now();
  });

  show(0, 'init');
  paint(0);
  if (!reduce()) requestAnimationFrame(tick);
}

export function init(): void {
  deck();
  player();
}
