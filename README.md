# Blocks

A Block Blast style puzzle. No dependencies, no build step, no npm, no network.
Plain HTML, CSS and JS.

## Files

| File | What it is |
|---|---|
| `index.html` | markup |
| `styles.css` | all styling |
| `game.js` | all game logic, sound, haptics |
| `manifest.json` | PWA metadata (fullscreen, portrait, icons) |
| `sw.js` | service worker, caches everything for offline |
| `icons/` | generated PNGs; `make-icons.ps1` regenerates them |

## Playing it

Double click `index.html`. Everything works except installing to the home
screen, because browsers refuse to register a service worker on a `file://`
URL. The registration is guarded, so nothing errors, you just get a plain page.

## Installing it on the phone

A service worker needs `https://` (or `localhost`). So the game has to be
served from somewhere once. Pick one:

**GitHub Pages** — the path of least resistance, and free forever.

    git init && git add . && git commit -m "Blocks"
    gh repo create blocks --public --source=. --push

Then Settings, Pages, deploy from the default branch, root. Open the
resulting `https://<user>.github.io/blocks/` on the phone.

Pages needs a **public** repo on a free GitHub plan. Private repos need Pro
or better. If you would rather not publish the source, drag this folder onto
`app.netlify.com/drop` instead and you get an HTTPS URL in about twenty
seconds with no repo at all.

- **Android/Chrome:** menu, "Install app" or "Add to Home screen".
- **iOS/Safari:** Share, "Add to Home Screen". iOS ignores `display` in the
  manifest and uses the `apple-mobile-web-app-capable` meta tag instead, which
  is set. Both routes launch with no browser chrome.

Once installed it never needs the network again. `sw.js` precaches all eight
files on install and serves cache-first.

**Testing locally first:**

    python -m http.server 8099 --bind 127.0.0.1

then open `http://127.0.0.1:8099/`. localhost counts as a secure context, so
the service worker installs and you can test offline behaviour by stopping the
server and reloading.

## What persists

`localStorage`, wrapped in try/catch so a blocked store can never take the
game down.

- `blocks.allTimeBest` — best score ever, survives refresh and reinstall
- `blocks.muted` — the mute toggle, which governs sound *and* vibration
- `blocks.game` — the run in progress: board, tray, score, combo, rerolls

"Best this session" is in memory only, except that a resumed run brings its
own session best back with it, so the header cannot read 0 next to a score
of 130.

### Resuming

The run is saved after every placement, every clear, every reroll, and again
on `pagehide`. Close the app mid-game, get evicted by the phone, or just
refresh, and you come back to the same board. Finishing a game deletes the
snapshot, so "Play again" is always a clean start.

A snapshot that clears after a line clear is written *after* the clear
resolves, never during it, so you can never come back to a board with a full
row sitting on it that will not clear.

The snapshot is treated as untrusted input. It survives across versions and
can be hand-edited, and a colour out of it is written straight into a CSS
`var()`, so the shape, the bounds and every colour are checked on load. A
snapshot that fails any check is discarded and you get a fresh game, never a
broken one.

## Score feedback

- A `+N` note rises off the centre of the cells that just cleared, so the
  scoring maths is visible rather than inferred from the header ticking up.
- The first time a run passes the record **that stood when it began**, a gold
  "New best" note appears with a short rising flourish. Once per run. It
  compares against the record at the start of the run, not the live all-time
  best, because that value climbs with your score during a run and would
  otherwise call every point of a first-ever game a new best.
- Notes follow the same rule as the line highlight: the base CSS is the
  readable state and the rise is layered on top. Under `prefers-reduced-motion`
  the note appears without flying and is removed on a timer.

## Screen wake lock

`navigator.wakeLock`, requested on the first touch of the tray and re-taken on
`visibilitychange`, so a long think does not put the screen out. The OS drops
the lock whenever the app is backgrounded, which is why it is re-requested
rather than held. Released on game over. Guarded and unsupported-safe; a
browser without it simply behaves as before.

## Sound

Synthesised with the Web Audio API. There are no audio files, so sound costs
nothing offline and adds nothing to the cache.

- **Placement:** a triangle wave falling 200 to 88 Hz with a short sine tap
  over it. A soft wooden thunk.
- **Line clear:** three to five sine notes climbing a major pentatonic scale
  from C5, each with a quiet octave partial for a bell timbre. Every combo
  step transposes the whole figure up a whole tone, capped at seven steps.
  Combo 1 is C5-D5-E5, combo 2 is D5-E5-F#5, and so on.

The AudioContext is built lazily inside a real gesture, because browsers
refuse to start audio otherwise.

## Haptics

`navigator.vibrate`, behind the same mute toggle, guarded because it does not
exist on desktop or on iOS Safari.

- **Placement:** a single 12 ms tick.
- **Line clear:** one pulse per line, up to four, lengthening from 18 ms with
  each combo step to a 55 ms ceiling.
- **Game over:** `[70, 60, 70, 60, 150]`, alongside a falling C5-Ab4-F4-C4.

## Bumping the service worker

If you change any file, bump `CACHE` in `sw.js` (`blocks-v1` to `blocks-v2`).
Otherwise installed copies keep serving the old cache. There is a background
revalidate that will pick changes up on the second launch, but the version
bump is the reliable route.

## Do not break these

Four things in here are load bearing and are not obvious from reading the code.

1. **The touch grab target is the whole tray slot, not the piece shape.**
   `pointerdown` is on `#tray` and resolves with `e.target.closest(".slot")`,
   and `.piece` is `pointer-events: none`. Small pieces are unhittable on a
   phone otherwise.
2. **`setPointerCapture` and `touch-action: none` on the tray must stay.**
   Without them the browser claims the gesture as a scroll and the drag dies
   silently partway through.
3. **The piece generator is weighted, not random.** `pickShape` biases toward
   smaller shapes as the board fills, and `newTray` will not deal three pieces
   unless at least two are placeable on a roomy board. Do not reduce this to
   `Math.random`.
4. **The line highlight lives in base CSS, not in the animation.** The loud
   state (`filter`, `box-shadow`, `opacity`) is on `.cell.primed`; the glint
   and sweep are layered on `::before` and `::after`. The reduced-motion block
   only zeroes durations, so the highlight survives with animations disabled.
   Do not move the highlight into a keyframe.
