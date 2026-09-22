/* ==========================================================================
   Damped springs
   --------------------------------------------------------------------------
   The closed-form solution of a mass on a spring:

       m·x" + c·x' + k·x = 0

   where x is how far the thing still has to travel, measured as a fraction of
   the whole distance: x(0) = 1 at the start, x -> 0 at rest. An impact is an
   initial velocity toward the target, which is what makes the motion overshoot
   and come back rather than merely easing in.

   Solving it rather than integrating per frame means the curve can be sampled
   at any time, so a spring can be handed to the Web Animations API as
   keyframes. The entrance stays seekable and pausable, which the review
   board's scrubber depends on.
   ========================================================================== */

export interface Spring {
  /** k — how hard it pulls back. Higher is faster and tighter. */
  stiffness: number;
  /** c — how much it resists moving. Higher settles sooner with less bounce. */
  damping: number;
  /** m — inertia. Heavier overshoots further and takes longer. */
  mass: number;
  /**
   * How hard it is struck, in whole-distances per second, positive toward the
   * target. 0 is a spring merely released; anything above about 2 reads as a
   * knock rather than a glide.
   */
  velocity: number;
}

interface Solved {
  /** Displacement remaining at time t, in seconds. */
  at: (t: number) => number;
  /** Seconds until the motion is within `epsilon` of rest and stays there. */
  settles: number;
}

function solve(s: Spring, epsilon: number): Solved {
  const w0 = Math.sqrt(s.stiffness / s.mass); // undamped angular frequency
  const zeta = s.damping / (2 * Math.sqrt(s.stiffness * s.mass)); // damping ratio
  const x0 = 1; // starts a whole distance from rest
  const v0 = -s.velocity; // struck toward the target, so displacement shrinks

  if (zeta < 1) {
    // Underdamped: it overshoots and rings down. This is the interesting case.
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const b = (v0 + zeta * w0 * x0) / wd;
    const amplitude = Math.hypot(x0, b);
    return {
      at: (t) => Math.exp(-zeta * w0 * t) * (x0 * Math.cos(wd * t) + b * Math.sin(wd * t)),
      // The ringing lives inside an exponential envelope; it is spent when
      // that envelope drops below epsilon.
      settles: Math.log(amplitude / epsilon) / (zeta * w0),
    };
  }

  if (zeta === 1) {
    // Critically damped: the quickest approach that never crosses the target.
    const b = v0 + w0 * x0;
    return {
      at: (t) => (x0 + b * t) * Math.exp(-w0 * t),
      settles: Math.log((Math.abs(x0) + Math.abs(b)) / epsilon) / w0,
    };
  }

  // Overdamped: two decaying exponentials, the slower one setting the pace.
  const r = w0 * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * w0 + r;
  const r2 = -zeta * w0 - r;
  const c1 = (v0 - r2 * x0) / (r1 - r2);
  const c2 = x0 - c1;
  return {
    at: (t) => c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t),
    settles: Math.log((Math.abs(c1) + Math.abs(c2)) / epsilon) / Math.abs(r1),
  };
}

/** How long the spring takes to settle, in milliseconds. */
export function springDuration(s: Spring, epsilon = 0.0015): number {
  return Math.round(solve(s, epsilon).settles * 1000);
}

/**
 * Progress along the spring at time t (ms): 0 at the start, 1 at the target.
 * An underdamped spring passes 1 and comes back, which is the overshoot.
 */
export function springProgress(s: Spring, t: number, duration?: number): number {
  const solved = solve(s, 0.0015);
  const total = duration ?? solved.settles * 1000;
  if (t <= 0) return 0;
  if (t >= total) return 1;
  return 1 - solved.at(t / 1000);
}

/**
 * Samples the spring into keyframes. `frame(k)` receives the progress and
 * returns the properties for that moment, so the caller decides what the
 * spring actually drives.
 *
 * The samples are evenly spaced and joined linearly: with enough of them the
 * result is the curve itself, not an approximation of it by easing names.
 */
export function springKeyframes(
  s: Spring,
  frame: (k: number) => Keyframe,
  steps = 64,
): Keyframe[] {
  const solved = solve(s, 0.0015);
  const total = solved.settles;
  const out: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const offset = i / steps;
    const k = i === steps ? 1 : 1 - solved.at(offset * total);
    out.push({ ...frame(k), offset, easing: 'linear' });
  }
  return out;
}

/** The largest fraction by which a spring passes its target, for reference. */
export function springOvershoot(s: Spring, steps = 400): number {
  const solved = solve(s, 0.0015);
  let peak = 0;
  for (let i = 0; i <= steps; i++) {
    peak = Math.max(peak, 1 - solved.at((i / steps) * solved.settles) - 1);
  }
  return peak;
}
