/* ============================================================
   storage.js — Pink Skies Engine
   Persistence layer.

   - localStorage: small key/value preferences (note speed, volume,
     difficulty, effects toggle, orientation preference, last stage,
     control scheme) and best-score records.
   - IndexedDB: larger creator data — charts saved from the in-browser
     chart editor/generator (tools/chart-editor.html,
     tools/chart-generator.html). Shipped stages load chart.json by
     fetch() directly; IndexedDB is only used as the creator's
     in-browser "save" before they export/download the file to place
     in a stage folder, since a static site has no server to write to.

   Everything here is defensive: storage can be unavailable (private
   browsing, disabled cookies, old WebViews) and the game must still
   run — it just won't remember anything between sessions.
   ============================================================ */

(function (global) {
  const LS_PREFIX = 'pinkskies:';
  const DB_NAME = 'pinkskies-charts';
  const DB_VERSION = 1;
  const STORE = 'charts';

  const DEFAULTS = {
    noteSpeedIndex: 2,       // 0..4, see pattern used by game.js travel table
    volume: 0.8,
    difficulty: 'normal',    // easy | normal | hard
    effects: true,           // particle / shake toggle
    orientationLock: 'auto', // auto | portrait | landscape
    lastStage: 'stage-001',
    controlScheme: 'tap',    // tap | tap-and-hold-assist
  };

  let memoryFallback = null; // used if localStorage throws
  function lsAvailable() {
    try {
      const k = '__pinkskies_test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }
  const HAS_LS = (() => { try { return lsAvailable(); } catch (e) { return false; } })();
  if (!HAS_LS) memoryFallback = {};

  function lsGet(key) {
    if (HAS_LS) {
      try { return window.localStorage.getItem(LS_PREFIX + key); } catch (e) { return null; }
    }
    return Object.prototype.hasOwnProperty.call(memoryFallback, key) ? memoryFallback[key] : null;
  }
  function lsSet(key, value) {
    if (HAS_LS) {
      try { window.localStorage.setItem(LS_PREFIX + key, value); return true; } catch (e) { return false; }
    }
    memoryFallback[key] = value;
    return true;
  }

  function getSettings() {
    const out = Object.assign({}, DEFAULTS);
    for (const k of Object.keys(DEFAULTS)) {
      const raw = lsGet('settings.' + k);
      if (raw === null || raw === undefined) continue;
      try {
        out[k] = JSON.parse(raw);
      } catch (e) { /* ignore malformed entry, keep default */ }
    }
    return out;
  }

  function setSetting(key, value) {
    if (!(key in DEFAULTS)) return false;
    return lsSet('settings.' + key, JSON.stringify(value));
  }

  function setSettings(partial) {
    for (const k of Object.keys(partial)) setSetting(k, partial[k]);
  }

  // ---- best scores, keyed by stage id ----
  function getBestScore(stageId) {
    const raw = lsGet('best.' + stageId);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function setBestScoreIfHigher(stageId, record) {
    // record: { score, accuracy, maxCombo, rank, at }
    const prev = getBestScore(stageId);
    if (!prev || record.score > prev.score) {
      lsSet('best.' + stageId, JSON.stringify(record));
      return true; // new best
    }
    return false;
  }

  // ---- IndexedDB for creator-saved charts (editor/generator tools only) ----
  function openDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in global)) { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'songId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveChartDraft(songId, chartObject) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ songId, chart: chartObject, savedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('[storage] saveChartDraft failed, chart NOT persisted:', e);
      return false;
    }
  }

  async function loadChartDraft(songId) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(songId);
        req.onsuccess = () => resolve(req.result ? req.result.chart : null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[storage] loadChartDraft failed:', e);
      return null;
    }
  }

  async function listChartDrafts() {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return [];
    }
  }

  global.PinkStorage = {
    DEFAULTS,
    getSettings,
    setSetting,
    setSettings,
    getBestScore,
    setBestScoreIfHigher,
    saveChartDraft,
    loadChartDraft,
    listChartDrafts,
  };
})(window);
