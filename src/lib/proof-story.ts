/* ==========================================================================
   Kutlerri redesign · RASA customer story (bottom-gradient dissolve transition)
   --------------------------------------------------------------------------
   Scroll-linked bottom-up gradient transition:
   - Full-screen RASA storefront image is prominent at the top.
   - On scroll, a vertical bottom fade creeps upward, dissolving the lower
     part of the image into the lavender page ground.
   - The top building/signage remains clearly visible.
   - The testimonial and Trey's CEO attribution emerge seamlessly in the
     revealed ground space.
   ========================================================================== */

export function init(): void {
  const proof = document.getElementById('proof');
  if (!proof) return;

  const bg = proof.querySelector<HTMLElement>('.proof__bg');
  const grad = proof.querySelector<HTMLElement>('.proof__grad');
  const body = proof.querySelector<HTMLElement>('.proof__body');
  if (!bg || !body) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    bg.style.setProperty('--mask-solid', '20%');
    bg.style.setProperty('--mask-fade', '60%');
    if (grad) {
      grad.style.setProperty('--grad-solid', '15%');
      grad.style.setProperty('--grad-mid', '45%');
      grad.style.setProperty('--grad-end', '70%');
    }
    body.style.opacity = '1';
    body.style.transform = 'none';
    return;
  }

  let ticking = false;

  function update(): void {
    ticking = false;
    const rect = proof!.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;

    if (rect.bottom <= 0 || rect.top >= vh) return;

    const totalScrollable = rect.height - vh;
    if (totalScrollable <= 0) return;

    const progress = Math.max(0, Math.min(1, -rect.top / totalScrollable));

    // Calculate gradient stops for bottom dissolve (creeps upward from bottom)
    // At progress 0: solid down to 85%, fades out by 100%
    // At progress 0.7+: solid down to 22%, fades out by 60% (top 22% remains 100% visible forever)
    const dissolveP = Math.max(0, Math.min(1, progress / 0.7));
    const smoothDissolve = dissolveP * dissolveP * (3 - 2 * dissolveP);

    const maskSolid = (85 - smoothDissolve * 63).toFixed(1) + '%';
    const maskFade = (100 - smoothDissolve * 38).toFixed(1) + '%';

    const gradSolid = (80 - smoothDissolve * 65).toFixed(1) + '%';
    const gradMid = (95 - smoothDissolve * 48).toFixed(1) + '%';
    const gradEnd = (100 - smoothDissolve * 28).toFixed(1) + '%';

    bg!.style.setProperty('--mask-solid', maskSolid);
    bg!.style.setProperty('--mask-fade', maskFade);

    if (grad) {
      grad.style.setProperty('--grad-solid', gradSolid);
      grad.style.setProperty('--grad-mid', gradMid);
      grad.style.setProperty('--grad-end', gradEnd);
    }

    // Testimonial reveal: begins around progress 0.18, fully crisp by 0.68
    const quoteP = Math.max(0, Math.min(1, (progress - 0.18) / 0.5));
    const smoothQuote = quoteP * quoteP * (3 - 2 * quoteP);
    const quoteY = (1 - smoothQuote) * 28;

    body!.style.opacity = smoothQuote.toFixed(4);
    body!.style.transform = 'translate3d(0, ' + quoteY.toFixed(2) + 'px, 0)';
  }

  function onScroll(): void {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
  window.addEventListener('resize', onScroll, { passive: true });

  update();
}
