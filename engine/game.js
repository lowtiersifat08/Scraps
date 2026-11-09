/* ============================================================
   game.js — Pink Skies Engine
   The main playable stage: loads a stage's stage.json + chart.json,
   drives note spawning/positioning off the audio clock (audio.js),
   handles input (input.js), feedback (effects.js) and persistence
   (storage.js).

   Layout / anti-cropping contract (see design brief §9):
     - The play field's own element height IS the travel distance.
       A note's y-position is purely a function of
       (songTime, note.time, travelSeconds, fieldHeight) recomputed
       every frame — never cached — so a resize/orientation change
       takes effect on the very next frame with no jump or reset.
     - hitY is a FRACTION of field height (not a fixed pixel value),
       so portrait vs. landscape automatically rescales.
     - A note is only ever added to the DOM once its spawn time has
       arrived (time - travelSeconds <= songTime); at that instant its
       computed y is exactly the top of the field (y=0), i.e. it is
       never already partway down when first seen. Hold ribbons whose
       tail is still above y=0 are clipped by the field's own
       overflow:hidden — that is the *tail* waiting to scroll into
       view, not a rendering bug.
     - Rotating the device recalculates pixel geometry only; it never
       touches chart timestamps, the audio element, the score, or the
       combo.
   ============================================================ */

(function (global) {
  const LANES = 4;
  const TRAVEL_OPTIONS = [2.6, 2.1, 1.7, 1.35, 1.05]; // seconds, slow -> fast
  const SPEED_NAMES = ['VERY SLOW', 'SLOW', 'NORMAL', 'FAST', 'VERY FAST'];
  const HIT_Y_FRACTION = 0.80; // hit line sits at 80% down the field
  const JUDGE = { PERFECT: 0.055, GREAT: 0.11, GOOD: 0.18 };
  const MISS_WINDOW = 0.22;
  const NOTE_W_FRACTION = 0.72; // of one lane's width

  function fmtTime(t) {
    t = Math.max(0, Math.floor(t));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }

  function createGame(root, opts) {
    const settings = Object.assign({}, PinkStorage.getSettings(), opts.settings || {});
    const field = root.querySelector('[data-field]');
    const notesLayer = root.querySelector('[data-notes]');
    const audioEl = root.querySelector('[data-audio]');
    const hud = {
      score: root.querySelector('[data-score]'),
      combo: root.querySelector('[data-combo]'),
      judge: root.querySelector('[data-judge]'),
      progressFill: root.querySelector('[data-progress-fill]'),
      progressText: root.querySelector('[data-progress-text]'),
    };

    const clock = PinkAudio.createAudioClock(audioEl);
    const fx = PinkEffects.createEffectsLayer(root.querySelector('[data-fx-host]'));
    const input = PinkInput.attach(field, LANES);

    let chart = null, stage = null;
    let travelSeconds = TRAVEL_OPTIONS[settings.noteSpeedIndex] || TRAVEL_OPTIONS[2];
    let notes = [];       // active note view-models: { ...chartNote, el, done, holding, missed }
    let chartIndex = 0;
    let active = false, paused = false;
    let score = 0, combo = 0, maxCombo = 0, hits = 0, misses = 0, judged = 0;
    let rafHandle = 0;
    let activeHolds = new Map(); // lane -> note being held

    const listeners = {};
    function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
    function emit(evt, payload) { (listeners[evt] || []).forEach(fn => fn(payload)); }

    function fieldGeometry() {
      const h = field.clientHeight || 1;
      const w = field.clientWidth || 1;
      const hitYpx = h * HIT_Y_FRACTION;
      const pxPerSec = hitYpx / travelSeconds;
      const laneW = w / LANES;
      return { h, w, hitYpx, pxPerSec, laneW };
    }

    async function loadStage(stageFolder) {
      const [stageRes, chartRes] = await Promise.all([
        fetch(stageFolder + '/stage.json').then(r => r.json()),
        fetch(stageFolder + '/chart.json').then(r => r.json()),
      ]);
      stage = stageRes;
      chart = chartRes;
      audioEl.src = stageFolder + '/' + (stage.audio || 'song.mp3');
      return { stage, chart };
    }

    function applyNoteSpeed(index) {
      travelSeconds = TRAVEL_OPTIONS[index] != null ? TRAVEL_OPTIONS[index] : travelSeconds;
      PinkStorage.setSetting('noteSpeedIndex', index);
      emit('speedchange', { index, label: SPEED_NAMES[index] });
    }

    function clearNotes() {
      for (const n of notes) n.el && n.el.remove();
      notes = [];
      activeHolds.clear();
    }

    function buildNoteEl(data) {
      const el = document.createElement('div');
      el.className = 'note note-' + data.type;
      if (data.type === 'hold') {
        const head = document.createElement('i'); head.className = 'note-hold-head';
        const tail = document.createElement('i'); tail.className = 'note-hold-tail';
        const body = document.createElement('i'); body.className = 'note-hold-body';
        el.appendChild(tail); el.appendChild(body); el.appendChild(head);
      } else if (data.type === 'diagonal') {
        const arrow = document.createElement('span'); arrow.className = 'note-arrow';
        arrow.textContent = { ul: '↖', ur: '↗', dl: '↙', dr: '↘' }[data.corner] || '◆';
        el.appendChild(arrow);
      }
      notesLayer.appendChild(el);
      return el;
    }

    function start(stageFolder) {
      return loadStage(stageFolder).then(() => {
        clearNotes();
        chartIndex = 0;
        score = 0; combo = 0; maxCombo = 0; hits = 0; misses = 0; judged = 0;
        active = true; paused = false;
        updateHud();
        clock.reset(travelSeconds);
        audioEl.volume = settings.volume != null ? settings.volume : 0.8;
        cancelAnimationFrame(rafHandle);
        loop();
      });
    }

    function retry() {
      cancelAnimationFrame(rafHandle);
      clearNotes();
      chartIndex = 0;
      score = 0; combo = 0; maxCombo = 0; hits = 0; misses = 0; judged = 0;
      active = true; paused = false;
      updateHud();
      clock.reset(travelSeconds);
      loop();
    }

    function spawnDueNotes(songTime) {
      const spawnLimit = songTime + travelSeconds;
      while (chartIndex < chart.notes.length && chart.notes[chartIndex].time <= spawnLimit) {
        const data = chart.notes[chartIndex++];
        const el = buildNoteEl(data);
        notes.push(Object.assign({}, data, { el, done: false, holding: false }));
      }
    }

    function positionNote(n, songTime, geo) {
      const delta = n.time - songTime; // seconds until the note should be hit
      const y = geo.hitYpx - delta * geo.pxPerSec;
      const laneCenterX = geo.laneW * (n.lane + 0.5);
      const noteW = geo.laneW * NOTE_W_FRACTION;

      if (n.type === 'hold') {
        const tailDelta = n.time + n.duration - songTime;
        const tailY = geo.hitYpx - tailDelta * geo.pxPerSec;
        const top = Math.min(tailY, y);
        const height = Math.max(20, Math.abs(y - tailY));
        n.el.style.left = (laneCenterX - noteW / 2) + 'px';
        n.el.style.width = noteW + 'px';
        n.el.style.top = top + 'px';
        n.el.style.height = height + 'px';
      } else if (n.type === 'diagonal') {
        // sweep in from a screen corner toward the lane's hit column
        const progress = Math.max(0, Math.min(1, 1 - delta / travelSeconds));
        const cornerX = { ul: 0, dl: 0, ur: geo.w, dr: geo.w }[n.corner];
        const cornerYOffset = { ul: -geo.h * 0.5, ur: -geo.h * 0.5, dl: geo.h * 0.5, dr: geo.h * 0.5 }[n.corner];
        const startX = cornerX, startY = y + cornerYOffset;
        const x = startX + (laneCenterX - startX) * progress;
        const yy = startY + (y - startY) * progress;
        n.el.style.left = (x - noteW / 2) + 'px';
        n.el.style.top = yy + 'px';
        n.el.style.width = noteW + 'px';
        n.el.style.height = noteW + 'px';
      } else {
        n.el.style.left = (laneCenterX - noteW / 2) + 'px';
        n.el.style.top = (y - noteW / 2) + 'px';
        n.el.style.width = noteW + 'px';
        n.el.style.height = noteW + 'px';
      }
    }

    function judgeLabel(absDelta) {
      if (absDelta <= JUDGE.PERFECT) return 'PERFECT';
      if (absDelta <= JUDGE.GREAT) return 'GREAT';
      return 'GOOD';
    }
    function judgeScore(label) {
      return label === 'PERFECT' ? 1000 : label === 'GREAT' ? 700 : 400;
    }

    function showJudge(text) {
      hud.judge.textContent = text;
      clearTimeout(showJudge._t);
      showJudge._t = setTimeout(() => { hud.judge.textContent = ''; }, 380);
    }

    function updateHud() {
      hud.score.textContent = String(score).padStart(6, '0');
      hud.combo.textContent = String(combo);
    }

    function registerHit(n, absDelta, x, y) {
      n.done = true;
      n.el.classList.add('hit');
      setTimeout(() => n.el.remove(), 110);
      hits++; judged++; combo++; maxCombo = Math.max(maxCombo, combo);
      const label = judgeLabel(absDelta);
      score += judgeScore(label);
      updateHud();
      showJudge(label);
      if (settings.effects !== false) {
        fx.hitSpark(x, y, null);
        fx.laneFlash(field, n.lane, LANES);
      }
    }

    function registerMiss(n) {
      if (n.done) return;
      n.done = true;
      n.el.remove();
      misses++; judged++; combo = 0;
      updateHud();
      showJudge('MISS');
      if (settings.effects !== false) {
        fx.missFlash(root);
        fx.screenShake(root, 0.6);
      }
    }

    function completeHold(n, x, y) {
      n.done = true;
      n.el.remove();
      hits++; judged++; combo++; maxCombo = Math.max(maxCombo, combo);
      score += 1400;
      updateHud();
      showJudge('HOLD COMPLETE');
      if (settings.effects !== false) fx.hitSpark(x, y, null);
      activeHolds.delete(n.lane);
    }

    function nearestNote(lane, time, types) {
      let best = null, bestDist = Infinity;
      for (const n of notes) {
        if (n.done || n.lane !== lane || !types.includes(n.type)) continue;
        const d = Math.abs(n.time - time);
        if (d < bestDist) { bestDist = d; best = n; }
      }
      return best;
    }

    input.on('down', ({ lane, x, y }) => {
      if (!active || paused) return;
      const time = clock.getSongTime();
      const n = nearestNote(lane, time, ['tap', 'hold', 'diagonal']);
      if (n && Math.abs(n.time - time) <= MISS_WINDOW) {
        if (n.type === 'hold') {
          n.holding = true;
          activeHolds.set(lane, n);
          showJudge('HOLD');
        } else {
          registerHit(n, Math.abs(n.time - time), x, y);
        }
      }
    });

    input.on('up', ({ lane }) => {
      if (!active || paused) return;
      const n = activeHolds.get(lane);
      if (n && n.holding) {
        const now = clock.getSongTime();
        const releaseTarget = n.time + n.duration;
        if (now < releaseTarget - 0.08) {
          // released too early
          registerMiss(n);
          activeHolds.delete(lane);
        }
      }
    });

    function finishStage() {
      active = false; paused = false;
      cancelAnimationFrame(rafHandle);
      audioEl.pause();
      for (const n of notes) { if (!n.done) { n.done = true; n.el.remove(); misses++; judged++; } }
      notes = [];
      const total = chart.notes.length;
      const accuracy = total ? (hits / total) * 100 : 0;
      const rank = accuracy >= 95 ? 'S' : accuracy >= 85 ? 'A' : accuracy >= 70 ? 'B' : accuracy >= 50 ? 'C' : 'D';
      const record = { score, accuracy, maxCombo, rank, hits, misses, at: Date.now() };
      const isNewBest = PinkStorage.setBestScoreIfHigher(stage.id, record);
      emit('finish', Object.assign({ isNewBest }, record));
    }

    function loop() {
      if (!active || paused) return;
      const songTime = clock.tick();
      if (clock.isAwaitingPlay()) { rafHandle = requestAnimationFrame(loop); return; }

      const geo = fieldGeometry();
      spawnDueNotes(songTime);

      for (const n of notes) {
        if (n.done) continue;
        positionNote(n, songTime, geo);
        if (n.type === 'hold') {
          if (n.holding && songTime >= n.time + n.duration) {
            const rect = n.el.getBoundingClientRect();
            completeHold(n, rect.left + rect.width / 2, geo.hitYpx);
          } else if (!n.holding && songTime - n.time > MISS_WINDOW) {
            registerMiss(n);
          }
        } else if (songTime - n.time > MISS_WINDOW) {
          registerMiss(n);
        }
      }
      notes = notes.filter(n => !n.done);

      if (clock.hasStarted()) {
        const d = Number.isFinite(audioEl.duration) ? audioEl.duration : chart.duration;
        const pct = Math.min(100, (audioEl.currentTime / d) * 100);
        hud.progressFill.style.width = pct + '%';
        hud.progressText.textContent = fmtTime(audioEl.currentTime) + ' / ' + fmtTime(d);
        if (audioEl.ended || audioEl.currentTime >= d - 0.03) { finishStage(); return; }
      } else {
        hud.progressText.textContent = 'READY \u00b7 ' + fmtTime(chart.duration);
      }

      rafHandle = requestAnimationFrame(loop);
    }

    function pause() {
      if (!active || paused) return;
      paused = true;
      clock.pause();
      cancelAnimationFrame(rafHandle);
      emit('pause');
    }
    function resume() {
      if (!paused) return;
      paused = false;
      clock.resume();
      emit('resume');
      loop();
    }

    // Orientation / resize: geometry is recomputed every frame from
    // field.clientHeight/Width, so there is nothing to "fix" here —
    // we simply must NOT touch songTime, score, chart index, or the
    // audio element. This handler exists only to document that
    // contract and to notify the UI layer (e.g. to relabel a
    // landscape-only hint) — it performs no gameplay mutation.
    function notifyOrientationChanged() { emit('orientationchange'); }

    function destroy() {
      cancelAnimationFrame(rafHandle);
      input.destroy();
      fx.destroy();
    }

    return {
      on, start, retry, pause, resume, destroy,
      applyNoteSpeed, notifyOrientationChanged,
      get settings() { return settings; },
      setSettings(partial) { Object.assign(settings, partial); PinkStorage.setSettings(partial); },
      TRAVEL_OPTIONS, SPEED_NAMES,
    };
  }

  global.PinkGame = { createGame, LANES, TRAVEL_OPTIONS, SPEED_NAMES };
})(window);
