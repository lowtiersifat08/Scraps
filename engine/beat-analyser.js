/* ============================================================
   beat-analyser.js — Pink Skies Engine (CREATOR-SIDE TOOL ONLY)

   Analyses a decoded audio buffer and returns:
     - bpm, beatOffset, beat grid (with half/quarter subdivisions)
     - per-beat energy level (0-3) from smoothed RMS
     - per-beat percussion activity (high/mid band spectral flux)
     - onset list with strength (for manual inspection in the editor)

   This is a straight port of the analysis approach used to produce
   the chart shipped with stage-001 (there run offline in Python for
   speed; here it runs in the browser via Web Audio so creators can
   analyse NEW songs with no backend, no build step, nothing but a
   browser). It is intentionally a from-scratch FFT/onset/tempo
   implementation (no external DSP library) so the whole engine stays
   dependency-free and works inside Acode/Android WebViews.

   IMPORTANT: per the design brief, this module must never run during
   normal gameplay — only from tools/chart-generator.html.
   ============================================================ */

(function (global) {
  const N_FFT = 2048;
  const HOP = 512;

  // ---- minimal iterative radix-2 FFT (in-place, real+imag arrays) ----
  function fftInPlace(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let curWr = 1, curWi = 0;
        for (let j = 0; j < len / 2; j++) {
          const ur = re[i + j], ui = im[i + j];
          const vr = re[i + j + len / 2] * curWr - im[i + j + len / 2] * curWi;
          const vi = re[i + j + len / 2] * curWi + im[i + j + len / 2] * curWr;
          re[i + j] = ur + vr; im[i + j] = ui + vi;
          re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
          const nwr = curWr * wr - curWi * wi;
          const nwi = curWr * wi + curWi * wr;
          curWr = nwr; curWi = nwi;
        }
      }
    }
  }

  function hannWindow(n) {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    return w;
  }

  async function decodeToMono(arrayBuffer, targetSr) {
    const AC = global.AudioContext || global.webkitAudioContext;
    const ctx = new AC();
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    let samples;
    if (decoded.numberOfChannels > 1) {
      const a = decoded.getChannelData(0), b = decoded.getChannelData(1);
      samples = new Float32Array(a.length);
      for (let i = 0; i < a.length; i++) samples[i] = (a[i] + b[i]) / 2;
    } else {
      samples = decoded.getChannelData(0).slice();
    }
    const srcSr = decoded.sampleRate;
    ctx.close && ctx.close();
    if (!targetSr || targetSr === srcSr) return { samples, sr: srcSr };
    // simple linear-interpolation resample (good enough for analysis purposes)
    const ratio = targetSr / srcSr;
    const outLen = Math.floor(samples.length * ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const srcPos = i / ratio;
      const i0 = Math.floor(srcPos), i1 = Math.min(samples.length - 1, i0 + 1);
      const frac = srcPos - i0;
      out[i] = samples[i0] * (1 - frac) + samples[i1] * frac;
    }
    return { samples: out, sr: targetSr };
  }

  function analyseSamples(samples, sr, progressCb) {
    const window = hannWindow(N_FFT);
    const nFrames = 1 + Math.floor((samples.length - N_FFT) / HOP);
    const frameTimes = new Float64Array(nFrames);
    const rms = new Float64Array(nFrames);
    const fluxFull = new Float64Array(nFrames);
    const fluxLow = new Float64Array(nFrames);
    const fluxMid = new Float64Array(nFrames);
    const fluxHigh = new Float64Array(nFrames);

    const freqs = new Float64Array(N_FFT / 2 + 1);
    for (let k = 0; k <= N_FFT / 2; k++) freqs[k] = (k * sr) / N_FFT;
    const lowIdx = [], midIdx = [], highIdx = [];
    for (let k = 0; k <= N_FFT / 2; k++) {
      if (freqs[k] >= 20 && freqs[k] < 150) lowIdx.push(k);
      else if (freqs[k] >= 150 && freqs[k] < 2000) midIdx.push(k);
      else if (freqs[k] >= 2000 && freqs[k] < 9000) highIdx.push(k);
    }

    let prevMag = new Float64Array(N_FFT / 2 + 1);
    const re = new Float64Array(N_FFT), im = new Float64Array(N_FFT);

    for (let f = 0; f < nFrames; f++) {
      const start = f * HOP;
      let sumsq = 0;
      for (let i = 0; i < N_FFT; i++) {
        const s = samples[start + i] || 0;
        sumsq += s * s;
        re[i] = s * window[i];
        im[i] = 0;
      }
      rms[f] = Math.sqrt(sumsq / N_FFT);
      frameTimes[f] = (start + N_FFT / 2) / sr;

      fftInPlace(re, im);
      const mags = new Float64Array(N_FFT / 2 + 1);
      for (let k = 0; k <= N_FFT / 2; k++) mags[k] = Math.hypot(re[k], im[k]);

      let fFull = 0, fLow = 0, fMid = 0, fHigh = 0;
      for (let k = 0; k <= N_FFT / 2; k++) {
        const d = mags[k] - prevMag[k];
        if (d > 0) fFull += d;
      }
      for (const k of lowIdx) { const d = mags[k] - prevMag[k]; if (d > 0) fLow += d; }
      for (const k of midIdx) { const d = mags[k] - prevMag[k]; if (d > 0) fMid += d; }
      for (const k of highIdx) { const d = mags[k] - prevMag[k]; if (d > 0) fHigh += d; }

      fluxFull[f] = fFull; fluxLow[f] = fLow; fluxMid[f] = fMid; fluxHigh[f] = fHigh;
      prevMag = mags;
      if (progressCb && f % 200 === 0) progressCb(f / nFrames);
    }

    function normalize(arr) {
      let min = Infinity, max = -Infinity;
      for (const v of arr) { if (v < min) min = v; if (v > max) max = v; }
      const range = max - min || 1;
      const out = new Float64Array(arr.length);
      for (let i = 0; i < arr.length; i++) out[i] = (arr[i] - min) / range;
      return out;
    }

    const onsetEnv = normalize(fluxFull);
    const frameDt = HOP / sr;

    // ---- onset peak picking ----
    const onsets = [];
    const winFrames = 8, delta = 0.08, minGap = 0.08;
    let lastT = -999;
    for (let i = 0; i < onsetEnv.length; i++) {
      const lo = Math.max(0, i - winFrames), hi = Math.min(onsetEnv.length, i + winFrames + 1);
      let localMean = 0, localMax = -Infinity;
      for (let j = lo; j < hi; j++) { localMean += onsetEnv[j]; if (onsetEnv[j] > localMax) localMax = onsetEnv[j]; }
      localMean /= (hi - lo);
      if (onsetEnv[i] > localMean + delta && onsetEnv[i] === localMax) {
        if (frameTimes[i] - lastT >= minGap) {
          onsets.push({ time: frameTimes[i], strength: onsetEnv[i] });
          lastT = frameTimes[i];
        }
      }
    }

    // ---- tempo via autocorrelation of onset envelope ----
    const minBpm = 70, maxBpm = 190;
    const minLag = Math.floor((60 / maxBpm) / frameDt);
    const maxLag = Math.ceil((60 / minBpm) / frameDt);
    let bestLag = minLag, bestScore = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0;
      for (let i = 0; i + lag < onsetEnv.length; i++) s += onsetEnv[i] * onsetEnv[i + lag];
      if (s > bestScore) { bestScore = s; bestLag = lag; }
    }
    let bpm = 60 / (bestLag * frameDt);
    // fold into a plausible range, preferring something near typical pop/dance tempos
    const candidates = [bpm, bpm * 2, bpm / 2].filter(b => b >= 70 && b <= 190);
    if (candidates.length) {
      candidates.sort((a, b) => Math.abs(a - 128) - Math.abs(b - 128));
      bpm = candidates[0];
    }
    const beatPeriod = 60 / bpm;

    // ---- beat phase offset ----
    function scoreOffset(offset) {
      let s = 0;
      for (let t = offset; t < nFrames * frameDt; t += beatPeriod) {
        const idx = Math.min(onsetEnv.length - 1, Math.max(0, Math.round(t / frameDt)));
        s += onsetEnv[idx];
      }
      return s;
    }
    let bestOffset = 0, bestOffsetScore = -Infinity;
    for (let i = 0; i < 100; i++) {
      const offset = (i / 100) * beatPeriod;
      const s = scoreOffset(offset);
      if (s > bestOffsetScore) { bestOffsetScore = s; bestOffset = offset; }
    }

    const duration = samples.length / sr;
    const beatTimes = [];
    for (let t = bestOffset; t < duration - 0.05; t += beatPeriod) beatTimes.push(t);

    // ---- smoothed energy for section classification ----
    const barPeriod = beatPeriod * 4;
    const smoothWinFrames = Math.max(1, Math.round((barPeriod * 2) / frameDt));
    const energySmooth = movingAverage(rms, smoothWinFrames);

    function energyAt(t) {
      const i = Math.min(energySmooth.length - 1, Math.max(0, Math.round(t / frameDt)));
      return energySmooth[i];
    }
    function percussionAt(t) {
      const halfWin = 0.15;
      const i0 = Math.max(0, Math.round((t - halfWin) / frameDt));
      const i1 = Math.min(fluxHigh.length, Math.round((t + halfWin) / frameDt));
      if (i1 <= i0) return 0;
      let sh = 0, sm = 0;
      for (let i = i0; i < i1; i++) { sh += fluxHigh[i]; sm += fluxMid[i]; }
      const n = i1 - i0;
      return (sh / n) + 0.5 * (sm / n);
    }

    const beatEnergyRaw = beatTimes.map(energyAt);
    const sorted = beatEnergyRaw.slice().sort((a, b) => a - b);
    const pct = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
    const eLo = pct(0.20), eHi = pct(0.95);
    function levelOf(e) {
      if (eHi <= eLo) return 1;
      const v = (e - eLo) / (eHi - eLo);
      if (v < 0.25) return 0;
      if (v < 0.55) return 1;
      if (v < 0.8) return 2;
      return 3;
    }

    const beats = beatTimes.map((t, i) => ({
      time: t,
      energy: beatEnergyRaw[i],
      level: levelOf(beatEnergyRaw[i]),
      percussion: percussionAt(t),
    }));

    return { duration, bpm, beatOffset: bestOffset, beats, onsets };
  }

  function movingAverage(arr, win) {
    const out = new Float64Array(arr.length);
    let acc = 0;
    const half = Math.floor(win / 2);
    for (let i = 0; i < arr.length; i++) {
      const lo = Math.max(0, i - half), hi = Math.min(arr.length, i + half + 1);
      let s = 0;
      for (let j = lo; j < hi; j++) s += arr[j];
      out[i] = s / (hi - lo);
    }
    return out;
  }

  async function analyseFile(file, opts) {
    opts = opts || {};
    const targetSr = opts.targetSr || 22050;
    const buf = await file.arrayBuffer();
    const { samples, sr } = await decodeToMono(buf, targetSr);
    return analyseSamples(samples, sr, opts.onProgress);
  }

  global.PinkBeatAnalyser = { analyseFile, analyseSamples, decodeToMono };
})(window);
