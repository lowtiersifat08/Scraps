/* ============================================================
   input.js — Pink Skies Engine
   Pointer/touch handling, decoupled from scoring and rendering.

   Exposes a tiny event-driven API:
     attach(fieldEl, laneCount) -> controller
     controller.on('down', ({lane, x, y, pointerId, clientTime}) => ...)
     controller.on('up',   ({lane, x, y, pointerId, clientTime}) => ...)
     controller.laneAt(clientX) -> lane index

   game.js decides what a "down"/"up" means musically (tap hit, hold
   start/release, diagonal catch); this module only turns raw pointer
   events into lane-relative coordinates, using pointer events so a
   single code path covers touch, mouse and pen.
   ============================================================ */

(function (global) {
  function attach(fieldEl, laneCount) {
    const listeners = { down: [], up: [], move: [] };
    function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
    function emit(evt, payload) { (listeners[evt] || []).forEach(fn => fn(payload)); }

    function laneAt(clientX) {
      const r = fieldEl.getBoundingClientRect();
      const lane = Math.floor(((clientX - r.left) / r.width) * laneCount);
      return Math.max(0, Math.min(laneCount - 1, lane));
    }

    const activePointers = new Map();

    function onDown(e) {
      fieldEl.setPointerCapture && (() => { try { fieldEl.setPointerCapture(e.pointerId); } catch (err) {} })();
      const lane = laneAt(e.clientX);
      const payload = { lane, x: e.clientX, y: e.clientY, pointerId: e.pointerId, clientTime: performance.now() };
      activePointers.set(e.pointerId, payload);
      emit('down', payload);
    }
    function onMove(e) {
      if (!activePointers.has(e.pointerId)) return;
      emit('move', { lane: laneAt(e.clientX), x: e.clientX, y: e.clientY, pointerId: e.pointerId });
    }
    function onUp(e) {
      const start = activePointers.get(e.pointerId);
      activePointers.delete(e.pointerId);
      const lane = laneAt(e.clientX);
      emit('up', {
        lane, x: e.clientX, y: e.clientY, pointerId: e.pointerId,
        clientTime: performance.now(), start: start || null,
      });
    }

    fieldEl.addEventListener('pointerdown', onDown, { passive: true });
    fieldEl.addEventListener('pointermove', onMove, { passive: true });
    global.addEventListener('pointerup', onUp, { passive: true });
    global.addEventListener('pointercancel', onUp, { passive: true });

    // Prevent double-tap-to-zoom and long-press callouts stealing input on mobile.
    fieldEl.style.touchAction = 'none';
    fieldEl.style.webkitUserSelect = 'none';
    fieldEl.style.userSelect = 'none';

    function destroy() {
      fieldEl.removeEventListener('pointerdown', onDown);
      fieldEl.removeEventListener('pointermove', onMove);
      global.removeEventListener('pointerup', onUp);
      global.removeEventListener('pointercancel', onUp);
    }

    return { on, laneAt, destroy };
  }

  global.PinkInput = { attach };
})(window);
