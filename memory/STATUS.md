---
name: block-game status
description: Current task, next steps, blockers. Forward-only -- read at session start.
updated: 2026-09-01
---

## What Changed

**2026-09-01: SHIPPED AND LIVE.** `block-game.html` in Downloads (a working single-file Block
Blast clone) became an installable offline PWA at
**https://steelponymike.github.io/blocks/** -- public repo `steelponymike/blocks`, GitHub Pages
on `master`, root. Verified on the live URL, not assumed: secure context, service worker
**activated**, all 8 files precached under `/blocks/`, manifest parsed. The subdirectory was the
real risk (a project Pages site is not at the domain root) and the relative paths resolved.

Built in two rounds. Mike's four ordered asks -- persistent best, PWA, Web Audio sound, haptics --
then three he picked from a follow-up list: resume-in-progress, score feedback, wake lock.

## Active Task

**Nothing mid-flight.** Waiting on Mike to install it on his Android phone and play it.

## Next Steps

**Claude:**
1. Nothing queued. If asked for more, **undo of the last placement** is the one gap -- Mike was
   offered it and passed, and it is the remaining way a good run dies unfairly on a small screen.
2. Other ideas he did not take: a daily seed (deterministic deal from the date, needs a seeded
   PRNG), and stats (games played, total lines, best combo).

**You:**
1. **Install it:** Chrome on Android -> menu -> Install app. Then **airplane-mode it and reopen**
   -- that is the offline claim actually tested.
2. Confirm the `file://` double-click path still works. Never verified: the browser automation
   refuses `file://` URLs. Structurally fine (the worker registration is guarded), two-second check.

## Open Questions

- Does the wake lock actually hold on the phone? Never exercised -- the automation tab is never
  the foreground document, so Chrome refused it with `NotAllowedError`, which is correct spec
  behaviour for a hidden page and exactly why the `visibilityState` guard exists. Fails silently
  if unsupported, so low risk either way.

## Blocked On

Nothing.

## Decisions Made

- **Repo is PUBLIC, deliberately.** GitHub Pages does not serve private repos on a free plan.
  Flipping it private kills the site unless Mike is on Pro.
- **Split into separate files** (`index.html` / `styles.css` / `game.js`) rather than kept as one
  file -- Mike allowed it, and a PWA needs `manifest.json` + `sw.js` as separate files regardless.
- **No undo**, offered and declined this session.
- **Icons are generated, not hand-drawn** -- `make-icons.ps1` (System.Drawing) so they can be
  regenerated. Not a build step; it runs once and the PNGs are committed.

## Standing Constraints

- **Dependency free. No build step, no npm, no frameworks.** Must stay openable by double-click.
- **The four load-bearing constraints from Mike's original file are documented in `README.md`
  under "Do not break these"** -- whole-slot grab target, `setPointerCapture` + `touch-action:
  none`, the weighted (not random) piece generator, and the line highlight living in base CSS
  rather than in the animation. Read that section before touching the game.
- **Bump `CACHE` in `sw.js` on every change** (`blocks-v1` -> `blocks-v2`) before pushing, or
  installed copies keep serving the old cache.
- Nothing personal in this repo -- it is public. `make-icons.ps1` used to hardcode
  `C:\Users\Mike\...` and was fixed to `$PSScriptRoot` before the first push.

## Notes

- Original untouched at `C:\Users\Mike\Downloads\block-game.html` as the reference copy.
- Only **four** lines of Mike's original JS were changed in all of this: the state declaration,
  the game-over note, `start()` -> `boot()`, and pulling the clear bonus into a variable so the
  floating note can show it. Everything else is pure addition.
- The saved-game snapshot is treated as untrusted input -- a board colour goes straight into a
  CSS `var()`. Six malformed snapshots were tested and all fell back to a fresh game.
