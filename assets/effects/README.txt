Not currently used by the shipped build.

Hit sparks, impact rings, lane flashes and the miss/shake feedback
are all generated at runtime by engine/effects.js as small DOM
elements animated with CSS (see the .fx-* rules in style.css) —
no particle sprite sheets are required.

Drop sprite/PNG effect assets here if you want richer particle art,
then reference them from engine/effects.js.
