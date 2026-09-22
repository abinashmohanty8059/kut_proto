/* ==========================================================================
   Kutlerri redesign · home page · "How it works" scroll story
   --------------------------------------------------------------------------
   The section's track is 100svh plus one step per capability. Its stage is
   sticky, so it holds still while the page scrolls through the track, and
   scroll progress picks the active capability:
     - its title turns purple and its description opens beneath it
     - the dot slides to it and the progress bar fills to it
     - its loop plays from the start in the dark panel
   Driven by scroll events with a rect check each time, not
   IntersectionObserver (see Website/DESIGN.md). Clicking a title scrolls to
   that step. Videos only play while the section is on screen, and never
   under reduced motion, where each shows its poster frame instead.
   ========================================================================== */

export function init(): void {
  const sec = document.querySelector<HTMLElement>('.cap');
  if (!sec) return;

  const track = sec.querySelector<HTMLElement>('.cap__track')!;
  const items = Array.from(sec.querySelectorAll<HTMLElement>('.cap__item'));
  const titles = items.map((it) => it.querySelector<HTMLElement>('.cap__title')!);
  const vids = Array.from(sec.querySelectorAll<HTMLVideoElement>('.cap__vid'));
  const dot = sec.querySelector<HTMLElement>('.cap__dot')!;
  const ticks = Array.from(sec.querySelectorAll<HTMLElement>('.cap__progress i'));
  const N = items.length;
  let cur = -1;
  let visible = false;
  const reduce = !!(
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  vids.forEach((v) => {
    v.muted = true;
  });

  const vh = (): number => window.innerHeight || document.documentElement.clientHeight;

  /* Where title i will sit once the change settles. Every item above it is
     collapsed to just its title (the description's row goes to 0fr and its
     child clips, so it adds nothing), and titles can differ in height when
     one wraps, so add them up rather than assuming they are all equal. */
  function titleCentre(i: number): number {
    let y = 0;
    for (let k = 0; k < i; k++) y += titles[k].offsetHeight;
    return y + titles[i].offsetHeight / 2;
  }

  function play(restart: boolean): void {
    const v = vids[cur];
    if (!v) return;
    if (reduce || !visible) {
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
  }

  function show(i: number, force?: boolean): void {
    if (i === cur && !force) return;
    cur = i;
    items.forEach((it, k) => {
      it.classList.toggle('is-on', k === i);
      if (k === i) titles[k].setAttribute('aria-current', 'step');
      else titles[k].removeAttribute('aria-current');
    });
    ticks.forEach((t, k) => t.classList.toggle('is-done', k <= i));
    dot.style.transform =
      'translateY(' + (titleCentre(i) - dot.offsetHeight / 2).toFixed(1) + 'px)';
    vids.forEach((v, k) => {
      v.classList.toggle('is-on', k === i);
      if (k !== i) v.pause();
    });
    play(true);
  }

  function update(): void {
    const r = track.getBoundingClientRect();
    const total = track.offsetHeight - vh();
    const p = total > 0 ? Math.min(0.9999, Math.max(0, -r.top / total)) : 0;
    const i = Math.min(N - 1, Math.floor(p * N));
    const vis = r.bottom > 0 && r.top < vh();
    if (vis !== visible) {
      visible = vis;
      if (cur >= 0 && i === cur) {
        if (visible) play(true);
        else vids[cur].pause();
      }
    }
    show(i);
  }

  titles.forEach((b, k) => {
    b.addEventListener('click', () => {
      const total = track.offsetHeight - vh();
      const y = window.scrollY + track.getBoundingClientRect().top + (total * (k + 0.5)) / N;
      window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    });
  });

  document.addEventListener('scroll', update, { passive: true, capture: true });
  window.addEventListener('resize', () => {
    show(cur, true);
    update();
  });
  update();

  // Title heights settle when the brand fonts arrive; re-place the dot.
  if (document.fonts && document.fonts.ready) {
    void document.fonts.ready.then(() => show(cur, true));
  }
}
