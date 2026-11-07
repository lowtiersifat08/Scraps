Not currently used by the shipped build.

Note shapes (tap/hold/diagonal) are drawn with CSS (radial gradients,
border-radius, box-shadow) in style.css under ".note-tap",
".note-hold-*", ".note-diagonal" — no sprite files are required.

Drop note sprite images here if you'd rather use hand-drawn art, then
swap the relevant CSS `background` rules for `background-image` ones
pointing at these files.
