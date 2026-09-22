/* The Outbound film: plays while on screen (from the start the first time it
   is seen), pauses when it leaves. The button pauses and resumes it; a pause
   by hand holds until the viewer presses play again. Under reduced motion it
   waits on its poster until someone presses play. */

export function init(): void {
  const v = document.querySelector<HTMLVideoElement>('.nobody__vid');
  if (!v) return;

  const btn = document.querySelector<HTMLElement>('.nobody__pp')!;
  v.muted = true;
  const reduce = !!(
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  let held = reduce;
  let seen = false;
  let on = false;

  function mark(): void {
    const playing = !v!.paused;
    btn.setAttribute('aria-label', playing ? 'Pause the film' : 'Play the film');
    btn.querySelector<HTMLElement>('[data-pause]')!.hidden = !playing;
    btn.querySelector<HTMLElement>('[data-play]')!.hidden = playing;
  }

  function go(): void {
    const p = v!.play();
    if (p && p.catch) p.catch(() => {});
  }

  function update(): void {
    const r = v!.getBoundingClientRect();
    const h = window.innerHeight || document.documentElement.clientHeight;
    const vis = r.bottom > h * 0.15 && r.top < h * 0.85;
    if (vis === on) return;
    on = vis;
    if (on && !held) {
      if (!seen) {
        seen = true;
        try {
          v!.currentTime = 0;
        } catch {
          /* not seekable yet */
        }
      }
      go();
    } else if (!on) {
      v!.pause();
    }
  }

  btn.addEventListener('click', () => {
    if (v.paused) {
      held = false;
      seen = true;
      go();
    } else {
      held = true;
      v.pause();
    }
  });
  v.addEventListener('play', mark);
  v.addEventListener('pause', mark);
  document.addEventListener('scroll', update, { passive: true, capture: true });
  window.addEventListener('resize', update);
  mark();
  update();
}
