/* The stop-motion band before the footer: plays while any of it is on screen,
   pauses when it leaves, and under reduced motion stays on its poster frame. */

export function init(): void {
  const v = document.querySelector<HTMLVideoElement>('.spread__vid');
  if (!v) return;

  v.muted = true;
  const reduce = !!(
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  let on = false;

  function update(): void {
    const r = v!.getBoundingClientRect();
    const h = window.innerHeight || document.documentElement.clientHeight;
    const vis = !reduce && r.bottom > 0 && r.top < h;
    if (vis === on) return;
    on = vis;
    if (on) {
      const p = v!.play();
      if (p && p.catch) p.catch(() => {});
    } else {
      v!.pause();
    }
  }

  document.addEventListener('scroll', update, { passive: true, capture: true });
  window.addEventListener('resize', update);
  update();
}
