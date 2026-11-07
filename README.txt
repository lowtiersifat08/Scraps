PINK SKIES — rhythm game engine (V3 rebuild)
=============================================

A reusable, modular rhythm game engine with a pink/breezy-sky theme,
built to run in Android browsers and Acode, playable from
GitHub Pages or itch.io with no backend.

--------------------------------------------------------------------
1. QUICK START
--------------------------------------------------------------------

This is a static site — no build step, no server required beyond a
plain file server (the browser's fetch() for stages.json/chart.json
needs http:// or https://, not file://).

Locally:
    cd Pink-Skies-Engine
    python3 -m http.server 8080
    # open http://localhost:8080 in a browser

Or open it with any "Live Server" style extension in your editor.
See GITHUB_UPLOAD_GUIDE.txt and ITCH_IO_GUIDE.txt for hosting it for
real.

--------------------------------------------------------------------
2. WHAT'S IN THIS BUILD
--------------------------------------------------------------------

- One playable stage ("A Hundred Little Weather Changes") using the
  MP3 you supplied, with a real initial chart (473 notes) generated
  by analysing the actual audio — not hand-typed, not random.
- A hybrid chart generator and a manual chart editor, both running
  entirely in the browser (tools/), so you can add new songs without
  touching any engine code.
- A reusable pattern library (Sets A–F from the design brief: basic
  notes, rapid succession, basic+hold, slow notes, diagonals, and
  combined patterns).
- Persistent settings (note speed, volume, difficulty, effects,
  orientation, last stage) and best-score records via localStorage.
- Portrait and landscape layouts driven by the same chart.json, with
  geometry recalculated every frame from the actual element size —
  see "ANTI-CROPPING FIX" below for why this matters.

--------------------------------------------------------------------
3. WHAT WAS WRONG WITH THE EARLIER VERSIONS, AND WHAT CHANGED
--------------------------------------------------------------------

You supplied two earlier builds (pink_skies_rhythm_complete.zip as
"V1", pink_skies_v2.zip as "V2"). Both were inspected before writing
any new code. Here's what was actually found, and what this rebuild
does differently:

a) Note synchronization / "notes entering from the bottom and
   crossing the playfield almost immediately":
   V1 called audio.play() and started the chart clock at the same
   instant, with no lead-in. That means a note scheduled at t=0.2s
   had essentially no travel time before it reached the hit line —
   it appeared already most of the way down the field. V2 fixed this
   with a "pre-roll": the chart clock starts counting down from
   -travelSeconds before audio.play() is even called, so notes have
   their full travel distance. This rebuild keeps that idea but
   isolates it in engine/audio.js as a single authoritative "song
   clock" (PinkAudio.createAudioClock) that game.js reads every
   frame — before the real audio.play() succeeds, position comes
   from performance.now(); the instant it succeeds, it switches to
   audio.currentTime (the browser's own media clock), which is what
   prevents long-run JS-timer drift over a 3-minute song.

b) Notes disappearing during busy sections / excessive density in
   quiet sections:
   Neither V1 nor V2 generated charts from the audio at all — both
   shipped a single hand-written chart.js. There was nothing to
   "disappear" from an algorithm because there wasn't one. This
   rebuild adds a real hybrid analyser (engine/beat-analyser.js,
   used with engine/chart-generator.js) that computes onset
   detection, tempo via autocorrelation, banded spectral flux
   (separating kick/snare-ish percussion from overall loudness), and
   smoothed RMS energy sections — specifically so loud-but-sustained
   sections don't get flooded with notes and quieter-but-rhythmically
   -busy sections still get appropriate density (see design brief
   §4/§6, honored in engine/pattern-library.js + chart-generator.js).

c) Cropped notes in landscape / clipped holds / abrupt entry:
   V2's renderer computed pixel positions using a hit-line pixel
   constant and travel-seconds, but geometry wasn't being
   recalculated from the field's *actual* rendered size every frame
   in a way that was orientation-safe, and hold ribbons were
   positioned/sized from the same formula without clamping — a small
   timing/geometry mismatch could make a long hold's computed height
   go wrong. This rebuild makes hit-line position a FRACTION of
   field height (not a pixel constant) and recomputes width/height/
   position from field.clientWidth/clientHeight on every single
   animation frame (see game.js fieldGeometry() + positionNote()) —
   so portrait vs. landscape, or a live rotation mid-song, just works
   without special-casing, and hold height is clamped to a sane
   minimum so it never collapses to zero or goes negative.

d) Note size / hit feedback:
   V1/V2 notes were small, fixed-height bars. This rebuild sizes
   notes as a fraction of the lane width (scales with screen size,
   see NOTE_W_FRACTION in game.js) and adds real feedback: spark
   particles, an expanding impact ring, a brief lane flash on hit,
   and a screen flash + shake on miss (engine/effects.js) — gated
   behind the "effects" setting.

e) Diagonal notes:
   Neither earlier version had true diagonal notes (V2 had
   "flick"/"reverse"/"slide" instead). This rebuild adds a genuine
   diagonal note type that spawns from a screen corner and sweeps
   into its lane (see Set E in pattern-library.js and the
   `.note-diagonal` positioning math in game.js).

What was KEPT from V2 because it already worked well: the audio
pre-roll concept, pause/resume handling, and ending the stage at the
real audio endpoint rather than an arbitrary chart length.

--------------------------------------------------------------------
4. HOW THE INITIAL CHART FOR STAGE-001 WAS MADE
--------------------------------------------------------------------

Per the brief's instruction not to trust a hand-made chart as
musically accurate, stage-001's chart.json was generated fresh from
the supplied MP3, not reused from V1/V2.

Method: the MP3 was decoded to mono PCM and analysed (onset
detection via spectral flux, tempo via autocorrelation of the onset
envelope, beat-grid phase alignment, banded flux for percussion
activity, smoothed RMS for section energy, per-beat energy
classification into 4 levels), then the pattern-library logic
(Sets A–F) assigned note patterns per beat according to that energy
classification, with variant rotation so patterns don't repeat
back-to-back, and a final safety pass that caps concurrent inputs at
2, forbids re-triggering a lane that's mid-hold, and clips/drops
anything that would run past the audio's real end.

This exact methodology is also what runs live in your browser via
tools/chart-generator.html, for any NEW song you add — see
engine/beat-analyser.js and engine/chart-generator.js. The two
implementations (one in Python, used once offline to produce
stage-001's shipped chart at build time; one in pure JS, used by the
in-browser tool for future songs) follow the same design but are not
byte-identical — small numeric differences in FFT/windowing are
expected and don't change the gameplay-relevant outcome. Re-running
the in-browser generator on the SAME mp3 was tested and produced a
closely matching result: 99.4 BPM / 294 beats / 460 notes, versus the
shipped chart's 99.384 BPM / 295 beats / 473 notes.

A chart generated this way is always an INITIAL chart, not a final
one — open tools/chart-editor.html to inspect and hand-correct it.
Normal gameplay never re-runs the analyser or generator; it only
ever loads the saved chart.json (brief §12).

--------------------------------------------------------------------
5. ADDING A NEW SONG (no engine code changes needed)
--------------------------------------------------------------------

1. Copy stages/stage-template/ to stages/stage-00N/.
2. Put your song in that folder as song.mp3 (or edit "audio" in its
   stage.json to match your filename).
3. Open tools/chart-generator.html, pick the MP3, generate.
4. Open tools/chart-editor.html to fine-tune the generated chart —
   fix timing, change note types/lanes, adjust hold length, add or
   remove notes, preview against the actual audio.
5. Export chart.json from the editor and save it into your stage
   folder, replacing the placeholder.
6. Fill in stage.json (id, title, artist, bpm, duration).
7. Add one entry to /stages.json at the project root. That's the
   only file outside the new stage folder you ever need to touch —
   engine/*.js is completely stage-agnostic.

--------------------------------------------------------------------
6. PROJECT STRUCTURE
--------------------------------------------------------------------

index.html          Screens: title, stage select, settings, gameplay,
                     pause overlay, results.
style.css            Pink/breezy sky theme, responsive layout, note
                     shapes, feedback animations.
app.js                Screen navigation + settings-form glue. Not
                     reusable engine logic on purpose — everything
                     reusable lives in engine/.
stages.json          Stage registry the engine reads at boot.

engine/
  audio.js            Authoritative song clock (pre-roll + audio
                     clock handoff), pause/resume.
  game.js             Note spawn/positioning/scoring/judging, the
                     anti-cropping geometry contract, HUD updates.
  input.js            Pointer/touch -> lane events.
  effects.js          Spark/ring/flash/shake DOM feedback.
  storage.js          localStorage settings + best scores;
                     IndexedDB chart drafts (creator tools only).
  pattern-library.js  Sets A–F, shared by the generator and
                     documented for the editor.
  beat-analyser.js    Browser-side DSP: FFT, onset detection, tempo,
                     banded percussion flux, energy sections.
                     CREATOR-TOOL ONLY — never runs in normal play.
  chart-generator.js  Turns analyser output into an initial chart
                     via the pattern library. CREATOR-TOOL ONLY.

stages/
  stage-001/          song.mp3 + chart.json + stage.json (shipped,
                     playable).
  stage-template/      Placeholder stage.json/chart.json with
                     instructions, used as the copy source for new
                     songs.

tools/
  chart-generator.html  Pick an MP3, analyse it, download/hand off
                       an initial chart.json.
  chart-editor.html     Timeline editor: add/move/delete notes,
                       change type/lane/duration/corner, preview
                       against audio, save/export.

assets/backgrounds, assets/notes, assets/effects
                     Currently unused — all visuals are drawn with
                     CSS/DOM, not sprite files (see the README.txt
                     in each folder). Reserved for swapping in real
                     artwork later without touching engine code.

--------------------------------------------------------------------
7. SETTINGS / PERSISTENCE
--------------------------------------------------------------------

localStorage keys (prefixed "pinkskies:"):
  settings.noteSpeedIndex, settings.volume, settings.difficulty,
  settings.effects, settings.orientationLock, settings.lastStage,
  settings.controlScheme, best.<stageId>

Changing note speed only changes visual travel speed
(TRAVEL_OPTIONS in game.js) — it never touches chart timestamps or
re-syncs audio, per the brief's requirement.

IndexedDB ("pinkskies-charts" database) is used only by the creator
tools, to let you save/reload an in-progress chart edit in the same
browser before you export and commit the real chart.json file. The
shipped game never touches IndexedDB — it loads chart.json by
fetch().

--------------------------------------------------------------------
8. KNOWN LIMITATIONS (stated honestly, per the brief's own request)
--------------------------------------------------------------------

- The hybrid analyser is a solid heuristic pipeline (real FFT, real
  onset/tempo/energy detection), not a machine-learned beat tracker.
  On music with a very weak or very syncopated beat it will need more
  manual correction in the chart editor than it would for the
  supplied song, which has a clear, fairly steady pulse.
- Tempo changes mid-song are NOT modeled — the analyser fits one BPM
  and one beat-grid phase for the whole track. A song with a tempo
  change partway through would need the chart editor's manual tools
  for the second section.
- The chart editor's timeline is functional (add/move/delete/edit,
  zoom, save/export, audio preview/seek) but is a utility tool, not a
  polished product — there's no undo stack and no multi-select yet.
- Automated testing covered: menu/screen navigation, audio-clock sync
  (via the real song and via a short swapped-in clip to confirm the
  stage ends exactly at the real audio end rather than an arbitrary
  chart length), tap/hold/diagonal hit detection against precisely
  timed clicks, pause/resume time continuity, settings persistence
  across reload, best-score persistence, portrait<->landscape
  rotation without resetting score/combo/audio, and both creator
  tools end-to-end (generate from the real MP3, add/edit/save a
  note, reload a saved draft) — all run in headless Chromium via
  Playwright, not just asserted. What was NOT verified: real-device
  testing on Android/Acode specifically, or touch-specific gesture
  edge cases beyond what Chromium's pointer-event emulation covers.
  If something doesn't behave the same on an actual phone, that's
  the gap to check first.
