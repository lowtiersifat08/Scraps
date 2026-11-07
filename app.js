/* ============================================================
   app.js — Pink Skies
   UI-level glue: screen switching, stage list, settings form
   binding, and the game lifecycle (start / pause / retry / finish).
   Everything reusable (audio sync, chart playback, input, scoring,
   persistence, analysis, pattern generation) lives in engine/*.js —
   this file only wires that engine to this particular page's DOM.
   ============================================================ */

(function () {
  const screens = Array.from(document.querySelectorAll('.screen'));
  function showScreen(id) {
    screens.forEach(s => s.classList.toggle('hidden', s.id !== id));
  }

  document.querySelectorAll('[data-go]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.getAttribute('data-go')));
  });

  let stagesRegistry = null;
  let selectedStageId = null;

  async function loadStagesRegistry() {
    const res = await fetch('stages.json');
    stagesRegistry = await res.json();
    return stagesRegistry;
  }

  function renderStageList() {
    const list = document.querySelector('[data-stage-list]');
    list.innerHTML = '';
    const settings = PinkStorage.getSettings();
    selectedStageId = settings.lastStage || (stagesRegistry.stages[0] && stagesRegistry.stages[0].id);
    for (const stage of stagesRegistry.stages) {
      const card = document.createElement('div');
      card.className = 'stage-card' + (stage.id === selectedStageId ? ' selected' : '');
      card.innerHTML = `<div><div><strong>${escapeHtml(stage.title)}</strong></div>
        <div class="meta">${escapeHtml(stage.artist || '')}</div></div>
        <div class="meta">${escapeHtml(stage.difficulty || '')}</div>`;
      card.addEventListener('click', () => {
        selectedStageId = stage.id;
        document.querySelectorAll('.stage-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        PinkStorage.setSetting('lastStage', stage.id);
      });
      list.appendChild(card);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function stageById(id) { return stagesRegistry.stages.find(s => s.id === id); }

  // ---- settings form binding ----
  function bindSettingsForm() {
    const settings = PinkStorage.getSettings();
    document.querySelectorAll('[data-setting]').forEach(input => {
      const key = input.getAttribute('data-setting');
      const val = settings[key];
      if (input.type === 'checkbox') input.checked = !!val;
      else input.value = val;

      if (key === 'noteSpeedIndex') updateSpeedLabel(val);

      input.addEventListener('input', () => {
        let v = input.type === 'checkbox' ? input.checked : input.value;
        if (input.type === 'range') v = Number(v);
        if (key === 'noteSpeedIndex') { v = Math.round(v); updateSpeedLabel(v); }
        PinkStorage.setSetting(key, v);
        if (game) game.setSettings({ [key]: v });
        if (key === 'noteSpeedIndex' && game) game.applyNoteSpeed(v);
      });
    });
  }
  function updateSpeedLabel(idx) {
    const el = document.querySelector('[data-speed-label]');
    if (el && PinkGame.SPEED_NAMES[idx]) el.textContent = PinkGame.SPEED_NAMES[idx];
  }

  // ---- game lifecycle ----
  let game = null;

  function ensureGame() {
    if (game) return game;
    const root = document.querySelector('[data-game-root]');
    game = PinkGame.createGame(root, { settings: PinkStorage.getSettings() });
    game.on('finish', onFinish);
    return game;
  }

  document.querySelector('[data-action="play-selected"]').addEventListener('click', async () => {
    if (!selectedStageId) return;
    const stage = stageById(selectedStageId);
    if (!stage) return;
    ensureGame();
    showScreen('game-screen');
    try {
      await game.start(stage.folder);
    } catch (err) {
      console.error('[app] failed to start stage', err);
      alert('Could not load this stage (missing song.mp3 or chart.json). Check the stage folder.');
      showScreen('stage-select');
    }
  });

  document.querySelector('[data-action="pause"]').addEventListener('click', () => {
    if (!game) return;
    game.pause();
    document.querySelector('[data-pause-overlay]').classList.remove('hidden');
  });
  document.querySelector('[data-action="resume"]').addEventListener('click', () => {
    document.querySelector('[data-pause-overlay]').classList.add('hidden');
    game && game.resume();
  });
  document.querySelector('[data-action="retry"]').addEventListener('click', () => {
    document.querySelector('[data-pause-overlay]').classList.add('hidden');
    game && game.retry();
  });
  document.querySelector('[data-action="exit-to-menu"]').addEventListener('click', () => {
    document.querySelector('[data-pause-overlay]').classList.add('hidden');
    if (game) game.pause();
    showScreen('menu-screen');
  });

  function onFinish(record) {
    document.querySelector('[data-rank]').textContent = record.rank;
    document.querySelector('[data-final-score]').textContent = String(record.score);
    document.querySelector('[data-accuracy]').textContent = record.accuracy.toFixed(1) + '%';
    document.querySelector('[data-hit-count]').textContent = String(record.hits);
    document.querySelector('[data-miss-count]').textContent = String(record.misses);
    document.querySelector('[data-best-combo]').textContent = String(record.maxCombo);
    document.querySelector('[data-new-best]').classList.toggle('hidden', !record.isNewBest);
    showScreen('result-screen');
  }

  document.querySelector('[data-action="result-retry"]').addEventListener('click', () => {
    showScreen('game-screen');
    game && game.retry();
  });
  document.querySelector('[data-action="result-menu"]').addEventListener('click', () => {
    showScreen('menu-screen');
  });

  // ---- orientation / resize: notify the game, never reset it ----
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { game && game.notifyOrientationChanged(); }, 60);
  });
  window.addEventListener('orientationchange', () => { game && game.notifyOrientationChanged(); });

  // ---- boot ----
  (async function boot() {
    await loadStagesRegistry();
    renderStageList();
    bindSettingsForm();
    showScreen('menu-screen');
  })();
})();
