/* ==========================================================================
   Kutlerri redesign · Managed service · the cursor light
   --------------------------------------------------------------------------
   The people card carries no purple of its own. While the pointer is over it,
   a purple light follows the cursor behind the glass, and it is confined to
   that card: the layer it lives on (.managed__cards::before) is given that
   card's box, so the light cannot spill onto the section or the other card.

   Only custom properties are written, one set per frame; the geometry is in
   home.css.
   ========================================================================== */

export function init(): void {
  const cards = document.querySelector<HTMLElement>('.managed__cards');
  const card = cards?.querySelector<HTMLElement>('.mcard--human');
  if (!cards || !card) return;

  /* No pointer to follow on a touch screen, and the stylesheet drops the
     layer there too. */
  if (!window.matchMedia('(hover: hover)').matches) return;

  /* The layer takes the card's box. offsetLeft/Top are already relative to
     the grid, which is the card's positioned ancestor. */
  function place(): void {
    cards!.style.setProperty('--glow-l', card!.offsetLeft + 'px');
    cards!.style.setProperty('--glow-t', card!.offsetTop + 'px');
    cards!.style.setProperty('--glow-w', card!.offsetWidth + 'px');
    cards!.style.setProperty('--glow-h', card!.offsetHeight + 'px');
  }

  function aim(event: PointerEvent): void {
    const box = card!.getBoundingClientRect();
    cards!.style.setProperty('--glow-x', (event.clientX - box.left).toFixed(1) + 'px');
    cards!.style.setProperty('--glow-y', (event.clientY - box.top).toFixed(1) + 'px');
  }

  let frame = 0;
  let latest: PointerEvent | null = null;

  /* The four lobes ride two slow sines in quadrature, so the light keeps
     rolling instead of sitting there as a disc. Periods are ~7s and ~10s and
     deliberately not multiples of each other, so the shape never repeats on a
     beat the eye can catch. */
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let drifting = 0;

  function drift(now: number): void {
    const t = now / 1000;
    cards!.style.setProperty('--glow-dx1', (Math.sin(t * 0.9) * 15).toFixed(1) + 'px');
    cards!.style.setProperty('--glow-dy1', (Math.cos(t * 0.62) * 12).toFixed(1) + 'px');
    cards!.style.setProperty('--glow-dx2', (Math.cos(t * 0.74) * -16).toFixed(1) + 'px');
    cards!.style.setProperty('--glow-dy2', (Math.sin(t * 1.05) * 13).toFixed(1) + 'px');
    drifting = requestAnimationFrame(drift);
  }

  card.addEventListener('pointerenter', (event) => {
    /* Aimed before it is lit, so it never fades up at the last position. */
    place();
    aim(event);
    cards.style.setProperty('--glow', '1');
    if (!still && !drifting) drifting = requestAnimationFrame(drift);
  });

  card.addEventListener('pointermove', (event) => {
    latest = event;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (latest) aim(latest);
    });
  }, { passive: true });

  card.addEventListener('pointerleave', () => {
    cards.style.setProperty('--glow', '0');
    /* Let it keep rolling through the fade, then stop: no frames are spent
       on a light nobody is looking at. */
    window.setTimeout(() => {
      if (cards.style.getPropertyValue('--glow') === '0' && drifting) {
        cancelAnimationFrame(drifting);
        drifting = 0;
      }
    }, 320);
  });

  window.addEventListener('resize', place, { passive: true });
}
