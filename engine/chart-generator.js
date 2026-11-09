/* ============================================================
   chart-generator.js — Pink Skies Engine (CREATOR-SIDE TOOL ONLY)

   Consumes the output of beat-analyser.js (bpm, beat grid with energy
   levels + percussion activity) and produces a complete initial
   chart.json using engine/pattern-library.js. This mirrors the
   methodology used offline to produce the chart shipped with
   stage-001 (see tools/README inside the repo for details).

   Rules enforced here (straight from the design brief):
     - Loudness alone never decides density — `level` already blends
       smoothed RMS with percussion/onset activity upstream in
       beat-analyser.js.
     - Energy bands map to different pattern families (low -> basic/
       slow, low-med -> basic/short sequences, med-high -> rapid/
       diagonal, high -> combined patterns), with variant rotation so
       the same shape doesn't repeat back-to-back.
     - A safety pass afterwards removes any note that would create an
       impossible/overlapping input (same lane re-triggered while a
       hold is still active, or more than two concurrent inputs) and
       drops anything that would extend past the audio's own duration.

   This module must never run during normal gameplay — only from
   tools/chart-generator.html when a creator is building a new stage.
   ============================================================ */

(function (global) {
  const P = global.PinkPatterns;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generateChart(analysis, opts) {
    opts = opts || {};
    const songId = opts.songId || 'untitled-stage';
    const endMargin = opts.endMargin != null ? opts.endMargin : 0.35;
    const rng = mulberry32(opts.seed != null ? opts.seed : 42);

    const duration = analysis.duration;
    const beat = 60 / analysis.bpm;
    const ctx = P.makeContext(beat, rng);

    const rot = { A: 0, B: 0, C: 0, E: 0, F: 0 };
    function nextVariant(key) {
      const fam = P.FAMILIES[key];
      rot[key] = (rot[key] + 1) % fam.variants;
      return rot[key];
    }

    let skipBeat = false;
    let beatsSinceD = 0;

    for (let i = 0; i < analysis.beats.length; i++) {
      const b = analysis.beats[i];
      const t = b.time;
      if (t > duration - endMargin) break;

      if (skipBeat) { skipBeat = false; continue; }

      const level = b.level;
      const r = rng();

      if (level === 0) {
        beatsSinceD++;
        if (r < 0.45 && beatsSinceD >= 2) {
          P.FAMILIES.D.fn(0, t, ctx);
          skipBeat = true;
          beatsSinceD = 0;
        } else if (r < 0.75) {
          P.FAMILIES.A.fn(nextVariant('A'), t, ctx);
        } else {
          P.FAMILIES.C.fn(3, t, ctx);
        }
      } else if (level === 1) {
        if (r < 0.4) P.FAMILIES.A.fn(nextVariant('A'), t, ctx);
        else if (r < 0.75) P.FAMILIES.B.fn(0, t, ctx);
        else P.FAMILIES.C.fn(nextVariant('C'), t, ctx);
      } else if (level === 2) {
        if (r < 0.35) P.FAMILIES.B.fn(nextVariant('B'), t, ctx);
        else if (r < 0.65) P.FAMILIES.E.fn(nextVariant('E'), t, ctx);
        else P.FAMILIES.C.fn(2, t, ctx);
      } else {
        if (r < 0.5) P.FAMILIES.F.fn(nextVariant('F'), t, ctx);
        else if (r < 0.8) P.FAMILIES.B.fn(nextVariant('B'), t, ctx);
        else P.FAMILIES.E.fn(nextVariant('E'), t, ctx);
      }
    }

    let notes = ctx.notes
      .filter(n => n.time <= duration - endMargin)
      .sort((a, b) => a.time - b.time);

    // ---- safety pass: cap concurrency, forbid same-lane overlap, clip hold tails ----
    function noteEnd(n) { return n.time + (n.type === 'hold' ? n.duration : 0.18); }
    const cleaned = [];
    let active = [];
    for (const n of notes) {
      if (n.type === 'hold' && n.time + n.duration > duration - endMargin) {
        n.duration = Math.max(0.25, duration - endMargin - n.time);
      }
      active = active.filter(a => a.end > n.time + 1e-6);
      if (active.some(a => a.lane === n.lane)) continue;
      if (active.length >= 2) continue;
      cleaned.push(n);
      active.push({ lane: n.lane, end: noteEnd(n) });
    }

    cleaned.forEach((n, i) => { n.id = 'n' + String(i).padStart(4, '0'); });

    return {
      version: 1,
      songId,
      bpm: Math.round(analysis.bpm * 1000) / 1000,
      beatOffset: Math.round(analysis.beatOffset * 1000) / 1000,
      duration: Math.round(duration * 1000) / 1000,
      generated: 'hybrid-auto',
      notes: cleaned,
    };
  }

  global.PinkChartGenerator = { generateChart };
})(window);
