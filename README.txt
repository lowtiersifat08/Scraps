PINK SKIES V2 - SONG-SPECIFIC RHYTHM GAME
==========================================

Your supplied MP3 (ソーダの泡) is included in assets/song.mp3.
Track duration: 179.208 seconds (2:59.208).
Chart: 216 timed note events based on detected musical attacks in this MP3.
The previous artificial 1.8-second chart offset has been removed.

V2 FEATURES
- Four-lane landscape rhythm gameplay.
- Large, colorful, thumb-friendly note silhouettes and full-lane touch zones.
- Tap notes.
- Hold notes: press and keep holding until the hold finishes.
- Flick notes: swipe in the displayed arrow direction.
- Reverse notes: travel upward toward the judgement line.
- Sideways slide notes: move between lanes while approaching the hit line.
- Five note travel-speed settings before the stage begins.
- PERFECT / GREAT / GOOD / MISS judgements.
- Score, combo, max combo, accuracy and rank.
- Pause, resume, retry and title screen.
- Stage ends at the actual MP3 end. It does not continue just because chart data exists.

RUN IN ACODE
1. Extract the ZIP.
2. Open the extracted pink_skies_rhythm folder in Acode.
3. Open index.html and launch Acode Preview.
4. Rotate your phone to landscape.
5. Choose note speed and press PLAY STAGE. The included MP3 loads automatically.

CONTROLS
- Tap a lane for normal, reverse or slide notes.
- Hold your finger down on a hold note until it completes.
- Swipe in the arrow direction for flick notes.
- Keyboard: D F J K or arrow keys for ordinary notes.
- Pause button pauses/resumes.

FILES
index.html       Title, playfield and results
style.css        Theme, note shapes and landscape layout
game.js          Timing, input, note motion, scoring and game flow
chart.js         Song-specific note times, types and lanes
assets/song.mp3 Your supplied music

TIMING / CHART NOTE
The chart uses detected audio attacks from the supplied track. This corrects the
previous version's accidental 1.8-second shift and keeps the final notes before
the song's ending. Audio playback time is the gameplay clock, and the stage
finishes at the actual audio endpoint. Some note-type assignments are arranged
for variety on detected attacks; a final hand-charting pass could further refine
musical phrasing and difficulty balance.
