/* ============================================================
   effects.js — Pink Skies Engine
   Lightweight DOM-based visual feedback. All effects are short-lived
   elements appended to a dedicated overlay layer and removed after
   their CSS animation finishes — nothing persists, so there's no
   accumulating memory cost during a long stage. Respects the
   player's "effects" setting (storage.js) by simply not being called
   when it's off (game.js checks before calling in).
   ============================================================ */

(function (global) {
  function createEffectsLayer(container) {
    const layer = document.createElement('div');
    layer.className = 'fx-layer';
    container.appendChild(layer);

    function lanePixelX(field, lane, laneCount) {
      const w = field.clientWidth / laneCount;
      return w * (lane + 0.5);
    }

    function hitSpark(x, y, color) {
      const ring = document.createElement('div');
      ring.className = 'fx-ring';
      ring.style.left = x + 'px';
      ring.style.top = y + 'px';
      if (color) ring.style.borderColor = color;
      layer.appendChild(ring);
      for (let i = 0; i < 6; i++) {
        const spark = document.createElement('div');
        spark.className = 'fx-spark';
        const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 26 + Math.random() * 18;
        spark.style.left = x + 'px';
        spark.style.top = y + 'px';
        spark.style.setProperty('--dx', (Math.cos(angle) * dist) + 'px');
        spark.style.setProperty('--dy', (Math.sin(angle) * dist) + 'px');
        if (color) spark.style.background = color;
        layer.appendChild(spark);
        setTimeout(() => spark.remove(), 420);
      }
      setTimeout(() => ring.remove(), 380);
    }

    function laneFlash(field, lane, laneCount) {
      const flash = document.createElement('div');
      flash.className = 'fx-lane-flash';
      flash.style.left = (100 / laneCount) * lane + '%';
      flash.style.width = (100 / laneCount) + '%';
      layer.appendChild(flash);
      setTimeout(() => flash.remove(), 260);
    }

    function missFlash(rootEl) {
      rootEl.classList.add('fx-miss-flash');
      setTimeout(() => rootEl.classList.remove('fx-miss-flash'), 180);
    }

    function screenShake(rootEl, amount) {
      amount = amount || 1;
      rootEl.style.setProperty('--shake-amt', amount);
      rootEl.classList.add('fx-shake');
      setTimeout(() => rootEl.classList.remove('fx-shake'), 220);
    }

    function destroy() { layer.remove(); }

    return { hitSpark, laneFlash, missFlash, screenShake, lanePixelX, destroy };
  }

  global.PinkEffects = { createEffectsLayer };
})(window);
