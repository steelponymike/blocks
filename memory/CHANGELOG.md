## [2026-09-01] — Shipped as an installable offline PWA at steelponymike.github.io/blocks

- Split `Downloads/block-game.html` into `index.html` / `styles.css` / `game.js`. Original left
  untouched in Downloads as the reference copy.
- **Persistent score:** `blocks.allTimeBest` in localStorage, all access wrapped in try/catch.
  Session best stays in memory and resets on reload.
- **PWA:** `manifest.json` (fullscreen, portrait, maskable icon), `sw.js` precaching all 8 files
  cache-first with a background revalidate, generated icons (192/512/apple-touch-180) via
  `make-icons.ps1`. Service worker registration guarded to http(s) so `file://` still plays.
- **Sound:** Web Audio only, no audio files. Falling triangle thunk on placement; pentatonic
  clear chime transposed up a whole tone per combo step (combo 1 = C5-D5-E5, combo 2 =
  D5-E5-F#5). Falling C5-Ab4-F4-C4 on game over. AudioContext built lazily inside a gesture.
- **Haptics:** `navigator.vibrate` behind the same persisted mute toggle; 12 ms on placement,
  one pulse per line lengthening with combo, `[70,60,70,60,150]` on game over.
- **Resumable game:** board, tray, score, combo and rerolls persisted after every placement,
  clear, reroll and on `pagehide`. Snapshot validated on load (shape, bounds, colour allow-list)
  and discarded if malformed. Written after a clear resolves, never mid-clear.
- **Score feedback:** floating `+N` note centred on the cleared cells; one-per-run gold "New
  best" note compared against the record as it stood when the run began.
- **Wake lock:** `navigator.wakeLock` requested on first tray touch, re-taken on
  `visibilitychange`, released on game over.
- Created public repo `steelponymike/blocks`, enabled Pages on `master` root, verified all nine
  assets serve over HTTPS and the worker activates at the `/blocks/` scope.
- Fixed before publishing: `make-icons.ps1` hardcoded `C:\Users\Mike\Code\block-game\icons`,
  now `$PSScriptRoot`.

### Decisions that affect future work
- Repo must stay **public** for Pages on a free plan.
- Bump `CACHE` in `sw.js` on any file change or installed copies serve stale.
- Undo was offered and declined.
