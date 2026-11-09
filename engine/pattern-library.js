/* ============================================================
   pattern-library.js — Pink Skies Engine
   Reusable, independent note-pattern families (Sets A-F from the
   design brief). This module is used by engine/chart-generator.js
   when auto-generating a chart, and its metadata is used by
   tools/chart-editor.html to label notes meaningfully.

   A "pattern" is a small function that takes a beat time `t` and a
   PatternContext (lane/corner pickers + note-adding callbacks) and
   appends zero or more notes. Each family has several *variants* so
   the generator can rotate through different shapes instead of
   repeating the same one throughout the song (brief: "do not
   repeatedly use the same pattern throughout the song").

   Lanes are 0..3 (four columns). Note types:
     tap      — single instantaneous hit
     hold     — press-and-hold for `duration` seconds
     diagonal — enters from a screen corner ("ul","ur","dl","dr")
                and sweeps diagonally into its lane before the hit line
   ============================================================ */

(function (global) {
  const LANES = [0, 1, 2, 3];
  const CORNERS = ['ul', 'ur', 'dl', 'dr'];

  function makeContext(beatSeconds, rng) {
    rng = rng || Math.random;
    let lastLane = -1;
    let lastCorner = -1;

    function pickLane(opts) {
      opts = opts || {};
      let pool = LANES.filter(l => l !== lastLane);
      if (opts.avoid !== undefined) pool = pool.filter(l => l !== opts.avoid);
      if (opts.avoidSet) pool = pool.filter(l => !opts.avoidSet.has(l));
      if (pool.length === 0) pool = LANES.slice();
      const lane = pool[Math.floor(rng() * pool.length)];
      lastLane = lane;
      return lane;
    }

    function pickCorner() {
      const pool = CORNERS.filter(c => c !== lastCorner);
      const c = pool[Math.floor(rng() * pool.length)];
      lastCorner = c;
      return c;
    }

    const notes = [];
    function tap(t, lane) { notes.push({ time: t, lane, type: 'tap' }); }
    function hold(t, lane, dur) { notes.push({ time: t, lane, type: 'hold', duration: dur }); }
    function diagonal(t, lane, corner) { notes.push({ time: t, lane, type: 'diagonal', corner }); }

    return { beatSeconds, pickLane, pickCorner, tap, hold, diagonal, notes };
  }

  // ---- SET A: basic notes ----
  function setA(variant, t, ctx) {
    const lane = ctx.pickLane();
    ctx.tap(t, lane); // isolated single tap; rests/alternation are handled by caller spacing + lane rotation
  }

  // ---- SET B: rapid succession ----
  function setB(variant, t, ctx) {
    const beat = ctx.beatSeconds, half = beat / 2, quarter = beat / 4;
    if (variant === 0) {
      const l1 = ctx.pickLane(); ctx.tap(t, l1);
      const l2 = ctx.pickLane({ avoid: l1 }); ctx.tap(t + half, l2);
    } else if (variant === 1) {
      const l1 = ctx.pickLane(); ctx.tap(t, l1);
      const l2 = ctx.pickLane({ avoid: l1 }); ctx.tap(t + half, l2);
      const l3 = ctx.pickLane({ avoid: l2 }); ctx.tap(t + beat, l3);
    } else if (variant === 2) {
      let lane = ctx.pickLane();
      for (let i = 0; i < 4; i++) {
        ctx.tap(t + i * quarter, lane);
        lane = ctx.pickLane({ avoid: lane });
      }
    } else {
      const l1 = ctx.pickLane(); const l2 = ctx.pickLane({ avoid: l1 });
      ctx.tap(t, l1); ctx.tap(t + half, l2);
    }
  }

  // ---- SET C: basic + hold ----
  function setC(variant, t, ctx) {
    const beat = ctx.beatSeconds;
    if (variant === 0) {
      const l1 = ctx.pickLane(); ctx.tap(t, l1);
      const l2 = ctx.pickLane({ avoid: l1 }); ctx.hold(t + beat / 2, l2, beat);
    } else if (variant === 1) {
      const l1 = ctx.pickLane(); ctx.hold(t, l1, beat * 0.75);
      const l2 = ctx.pickLane({ avoid: l1 }); ctx.tap(t + beat, l2);
    } else if (variant === 2) {
      const l1 = ctx.pickLane(); ctx.hold(t, l1, beat * 1.5);
      const l2 = ctx.pickLane({ avoid: l1 }); ctx.tap(t + beat * 0.5, l2);
    } else {
      const l1 = ctx.pickLane(); ctx.hold(t, l1, beat * 2.0);
    }
  }

  // ---- SET D: slow basic notes (caller decides beat skipping) ----
  function setD(variant, t, ctx) {
    const lane = ctx.pickLane();
    ctx.tap(t, lane);
  }

  // ---- SET E: diagonal notes ----
  function setE(variant, t, ctx) {
    const beat = ctx.beatSeconds;
    if (variant === 0) {
      ctx.diagonal(t, ctx.pickLane(), ctx.pickCorner());
    } else if (variant === 1) {
      const l1 = ctx.pickLane(); ctx.diagonal(t, l1, ctx.pickCorner());
      const l2 = ctx.pickLane({ avoid: l1 }); ctx.diagonal(t + beat / 2, l2, ctx.pickCorner());
    } else {
      const l1 = ctx.pickLane(); ctx.diagonal(t, l1, ctx.pickCorner());
      const l2 = ctx.pickLane({ avoid: l1 }); ctx.diagonal(t + beat / 4, l2, ctx.pickCorner());
    }
  }

  // ---- SET F: combined patterns ----
  function setF(variant, t, ctx) {
    const beat = ctx.beatSeconds;
    if (variant === 0) {
      const l1 = ctx.pickLane(); ctx.tap(t, l1);
      const l2 = ctx.pickLane({ avoid: l1 }); ctx.hold(t + beat * 0.25, l2, beat * 1.25);
      const l3 = ctx.pickLane({ avoidSet: new Set([l1, l2]) }); ctx.diagonal(t + beat * 0.75, l3, ctx.pickCorner());
    } else if (variant === 1) {
      const l1 = ctx.pickLane(); ctx.hold(t, l1, beat);
      const l2 = ctx.pickLane({ avoid: l1 }); ctx.diagonal(t + beat * 0.5, l2, ctx.pickCorner());
    } else if (variant === 2) {
      const l1 = ctx.pickLane(); ctx.tap(t, l1);
      const l2 = ctx.pickLane({ avoid: l1 }); ctx.tap(t + beat / 2, l2);
      const l3 = ctx.pickLane({ avoid: l2 }); ctx.diagonal(t + beat * 0.75, l3, ctx.pickCorner());
    } else {
      const l1 = ctx.pickLane(); ctx.tap(t, l1);
      const l2 = ctx.pickLane({ avoid: l1 }); ctx.diagonal(t + beat / 4, l2, ctx.pickCorner());
      const l3 = ctx.pickLane({ avoid: l2 }); ctx.tap(t + beat / 2, l3);
    }
  }

  const FAMILIES = {
    A: { fn: setA, variants: 3, label: 'Basic notes' },
    B: { fn: setB, variants: 4, label: 'Rapid succession' },
    C: { fn: setC, variants: 4, label: 'Basic + hold' },
    D: { fn: setD, variants: 1, label: 'Slow basic notes' },
    E: { fn: setE, variants: 3, label: 'Diagonal' },
    F: { fn: setF, variants: 4, label: 'Combined' },
  };

  global.PinkPatterns = { makeContext, FAMILIES, LANES, CORNERS };
})(window);
