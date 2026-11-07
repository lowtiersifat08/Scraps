Not currently used by the shipped build.

The pink/breezy sky background and clouds are drawn entirely with CSS
gradients and animated radial-gradient "cloud" divs (see style.css,
.cloud-field / .cloud) — no image files are required to run the game.

Drop PNG/JPG/WebP backgrounds here if you want to swap in real
artwork later, then reference them from style.css (e.g. on #app or a
new per-stage background layer) or per-stage via stage.json's
"background" field plus a small lookup you add in app.js.
