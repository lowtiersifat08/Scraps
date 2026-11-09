/* ============================================================
   audio.js — Pink Skies Engine
   Owns the single <audio> element used for gameplay and exposes a
   drift-free "song clock":

     - Before the browser actually starts playback, the clock is
       derived from performance.now() (pre-roll phase), so notes can
       be visible and traveling toward the hit line before time 0.
     - The instant audio playback begins, the clock switches to
       audio.currentTime, which is the browser's own authoritative
       media clock — this is what prevents long-run drift between the
       chart and the music (a pure JS timer would slowly diverge).
     - Pause/resume/retry/visibility-change are all funneled through
       here so game.js never touches audio.currentTime directly
       except to seek on retry.

   This module does not know about notes, lanes or scoring — it is
   pure transport.
   ============================================================ */

(function (global) {
  function createAudioClock(audioEl) {
    const state = {
      travelSeconds: 1.8,   // how long before t=0 the clock starts counting (pre-roll)
      preRollStartedAt: 0,  // performance.now() value when pre-roll began
      started: false,       // true once audio.play() has actually begun
      starting: false,
      paused: false,
      pausedSongTime: 0,
      onStarted: null,
      onPlayFailed: null,
    };

    function reset(travelSeconds) {
      state.travelSeconds = travelSeconds;
      state.started = false;
      state.starting = false;
      state.paused = false;
      state.pausedSongTime = 0;
      try { audioEl.pause(); } catch (e) {}
      try { audioEl.currentTime = 0; } catch (e) {}
      state.preRollStartedAt = performance.now();
    }

    // Called every animation frame by game.js. Starts real playback once
    // the pre-roll window has elapsed, and returns the current song time
    // (which may be negative during pre-roll).
    function tick() {
      if (state.paused) return state.pausedSongTime;
      const now = performance.now();
      if (state.started) {
        return audioEl.currentTime;
      }
      const elapsed = (now - state.preRollStartedAt) / 1000;
      const songTime = elapsed - state.travelSeconds;
      if (elapsed >= state.travelSeconds && !state.starting) {
        state.starting = true;
        audioEl.currentTime = 0;
        const p = audioEl.play();
        if (p && p.then) {
          p.then(() => {
            state.started = true;
            state.starting = false;
            // Re-anchor pre-roll so any time spent awaiting play() doesn't
            // introduce a jump — audio.currentTime is now authoritative.
            if (state.onStarted) state.onStarted();
          }).catch((err) => {
            state.starting = false;
            if (state.onPlayFailed) state.onPlayFailed(err);
          });
        } else {
          // Very old browsers without a Promise-returning play().
          state.started = true;
          state.starting = false;
        }
      }
      return songTime;
    }

    function isAwaitingPlay() { return state.starting; }

    function pause() {
      if (state.paused) return;
      state.pausedSongTime = state.started ? audioEl.currentTime : tick();
      state.paused = true;
      try { audioEl.pause(); } catch (e) {}
    }

    function resume() {
      if (!state.paused) return;
      state.paused = false;
      if (state.started) {
        audioEl.play().catch(() => {});
      } else {
        // still in pre-roll: re-anchor so elapsed time resumes correctly
        state.preRollStartedAt = performance.now() - (state.pausedSongTime + state.travelSeconds) * 1000;
      }
    }

    function getSongTime() {
      if (state.paused) return state.pausedSongTime;
      return state.started ? audioEl.currentTime : tick();
    }

    function hasStarted() { return state.started; }

    return {
      reset, tick, pause, resume, getSongTime, hasStarted, isAwaitingPlay,
      state,
    };
  }

  // Handle page visibility changes: auto-pause when the tab/app is
  // backgrounded so the chart never silently races ahead of a muted
  // or throttled audio element, and so progress isn't lost.
  function bindVisibilityAutoPause(onHide, onShowResumeHint) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        onHide && onHide();
      } else {
        onShowResumeHint && onShowResumeHint();
      }
    });
  }

  global.PinkAudio = { createAudioClock, bindVisibilityAutoPause };
})(window);
