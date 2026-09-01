(function () {
  "use strict";

  /* ---------------- storage ---------------- */
  // Wrapped: localStorage throws outright in some private-browsing modes and
  // under a few file:// origins. A dead store must never take the game down.
  const KEY_BEST = "blocks.allTimeBest";
  const store = {
    get(k, fallback) {
      try {
        const v = localStorage.getItem(k);
        return v === null ? fallback : v;
      } catch (err) { return fallback; }
    },
    set(k, v) {
      try { localStorage.setItem(k, String(v)); } catch (err) {}
    },
    del(k) {
      try { localStorage.removeItem(k); } catch (err) {}
    }
  };
  function loadBest() {
    const n = parseInt(store.get(KEY_BEST, "0"), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /* ---------------- geometry ---------------- */
  const N = 8;
  const GAP = 3;
  const BOARD_PAD = 9;   // #boardWrap padding, so notes can be placed over a cell
  const boardEl = document.getElementById("board");
  const wrapEl = document.getElementById("boardWrap");

  function sizeBoard() {
    const maxW = Math.min(window.innerWidth - 40, 372);
    const maxH = Math.min(window.innerHeight * 0.48, 372);
    const avail = Math.min(maxW, maxH);
    const cell = Math.floor((avail - GAP * (N - 1)) / N);
    document.documentElement.style.setProperty("--cell", cell + "px");
    document.documentElement.style.setProperty("--gap", GAP + "px");
    return cell;
  }
  let CELL = sizeBoard();
  let STEP = CELL + GAP;

  /* ---------------- pieces ---------------- */
  function norm(cells) {
    const mr = Math.min(...cells.map(c => c[0]));
    const mc = Math.min(...cells.map(c => c[1]));
    return cells.map(c => [c[0] - mr, c[1] - mc])
                .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }
  function rot(cells) {
    const maxR = Math.max(...cells.map(c => c[0]));
    return norm(cells.map(c => [c[1], maxR - c[0]]));
  }
  function rotations(cells) {
    const out = [], seen = new Set();
    let cur = norm(cells);
    for (let i = 0; i < 4; i++) {
      const k = JSON.stringify(cur);
      if (!seen.has(k)) { seen.add(k); out.push(cur); }
      cur = rot(cur);
    }
    return out;
  }
  function rect(h, w) {
    const c = [];
    for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) c.push([r, k]);
    return c;
  }

  // base shape, relative frequency
  const BASES = [
    [rect(1, 1), 3],
    [rect(1, 2), 7],
    [rect(1, 3), 7],
    [rect(1, 4), 5],
    [rect(1, 5), 3],
    [rect(2, 2), 7],
    [rect(3, 3), 2],
    [rect(2, 3), 4],
    [[[0,0],[1,0],[1,1]], 7],                       // small corner
    [[[0,0],[1,0],[2,0],[2,1],[2,2]], 5],           // big L
    [[[0,0],[1,0],[2,0],[2,1]], 4],                 // J
    [[[0,0],[0,1],[0,2],[1,1]], 4],                 // T
    [[[0,1],[0,2],[1,0],[1,1]], 3],                 // S
    [[[0,0],[0,1],[1,1],[1,2]], 3],                 // Z
  ];

  const SHAPES = [];
  BASES.forEach(([base, w]) => {
    rotations(base).forEach(cells => SHAPES.push({ cells, w }));
  });

  const COLORS = ["--c1", "--c2", "--c3", "--c4", "--c5", "--c6"];

  /* ---------------- state ---------------- */
  let board, tray, score, best = 0, allBest = 0, combo, rerolls, dead;

  function emptyCount() {
    let n = 0;
    for (let i = 0; i < N * N; i++) if (!board[i]) n++;
    return n;
  }

  function pickShape() {
    const empty = emptyCount();
    // when the board gets tight, lean toward smaller pieces so it stays winnable
    const squeeze = empty < 22 ? 0.62 : empty < 38 ? 0.82 : 1;
    let total = 0;
    const weights = SHAPES.map(s => {
      const w = s.w * Math.pow(squeeze, s.cells.length);
      total += w;
      return w;
    });
    let r = Math.random() * total;
    for (let i = 0; i < SHAPES.length; i++) {
      r -= weights[i];
      if (r <= 0) return makePiece(SHAPES[i]);
    }
    return makePiece(SHAPES[0]);
  }

  let pieceId = 0;
  function makePiece(shape) {
    return {
      id: ++pieceId,
      cells: shape.cells,
      h: Math.max(...shape.cells.map(c => c[0])) + 1,
      w: Math.max(...shape.cells.map(c => c[1])) + 1,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    };
  }

  function fits(piece, r0, c0, bd) {
    for (const [r, c] of piece.cells) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= N || cc >= N) return false;
      if (bd[rr * N + cc]) return false;
    }
    return true;
  }
  function fitsAnywhere(piece, bd) {
    for (let r = 0; r <= N - piece.h; r++)
      for (let c = 0; c <= N - piece.w; c++)
        if (fits(piece, r, c, bd)) return true;
    return false;
  }

  function newTray() {
    const spacious = emptyCount() > 26;
    for (let attempt = 0; attempt < 80; attempt++) {
      const t = [pickShape(), pickShape(), pickShape()];
      const usable = t.filter(p => fitsAnywhere(p, board)).length;
      if (usable >= (spacious ? 2 : 1)) return t;
    }
    return [makePiece(SHAPES[0]), makePiece(SHAPES[0]), makePiece(SHAPES[0])];
  }

  /* ---------------- sound and haptics ---------------- */
  // Every tone is synthesised. There are no audio files to fetch, so sound
  // costs nothing offline and adds nothing to the cache.
  const KEY_MUTE = "blocks.muted";
  let muted = store.get(KEY_MUTE, "0") === "1";
  let actx = null, master = null;

  // Built on first use inside a real gesture: browsers refuse to start audio otherwise.
  function audio() {
    if (muted) return null;
    if (!actx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try {
        actx = new Ctx();
        master = actx.createGain();
        master.gain.value = 0.9;
        master.connect(actx.destination);
      } catch (err) { actx = null; return null; }
    }
    if (actx.state === "suspended") actx.resume().catch(() => {});
    return actx;
  }

  function tone(o) {
    const ctx = audio();
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.at || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.from, t0);
    if (o.to && o.to !== o.from) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
    // exponential ramps cannot reach zero, hence the near-silent floor
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(o.peak, t0 + (o.attack || 0.006));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.03);
  }

  // soft wooden thunk: a short tap riding on a falling low body
  function sndPlace() {
    tone({ type: "triangle", from: 200, to: 88, dur: 0.13, peak: 0.20 });
    tone({ type: "sine", from: 430, to: 300, dur: 0.05, peak: 0.05 });
  }

  // major pentatonic, so any run of notes lands sweet
  const PENT = [0, 2, 4, 7, 9];
  function sndClear(lines, streak) {
    const notes = Math.min(2 + lines, 5);
    const lift = Math.min(streak - 1, 7) * 2;   // each combo step lifts it a whole tone
    for (let i = 0; i < notes; i++) {
      const semi = PENT[i % PENT.length] + 12 * Math.floor(i / PENT.length) + lift;
      const f = 523.25 * Math.pow(2, semi / 12); // rising from C5
      tone({ type: "sine", from: f, to: f, dur: 0.36, peak: 0.14, at: i * 0.055, attack: 0.01 });
      tone({ type: "sine", from: f * 2, to: f * 2, dur: 0.24, peak: 0.04, at: i * 0.055, attack: 0.01 });
    }
  }

  // a soft fall, so the end of a run lands rather than just stopping
  function sndOver() {
    [523.25, 415.30, 349.23, 261.63].forEach((f, i) => {
      tone({ type: "triangle", from: f, to: f, dur: 0.52, peak: 0.13, at: i * 0.13, attack: 0.02 });
    });
  }

  /* ---------------- haptics ---------------- */
  // Same mute toggle governs these. Absent on desktop and on iOS Safari,
  // where navigator.vibrate simply does not exist, so guard rather than assume.
  const CAN_BUZZ = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  function buzz(pattern) {
    if (muted || !CAN_BUZZ) return;
    try { navigator.vibrate(pattern); } catch (err) {}
  }

  // A clear gets one pulse per line, and the pulses lengthen with the combo,
  // so a big streak is felt as well as heard.
  function clearPattern(lines, streak) {
    const len = Math.min(18 + (streak - 1) * 8, 55);
    const out = [];
    for (let i = 0; i < Math.min(lines, 4); i++) {
      if (i) out.push(45);        // gap
      out.push(len);              // pulse
    }
    return out;
  }

  /* ---------------- mute ---------------- */
  const SPEAKER = String.fromCodePoint(0x1F50A);
  const CROSSED = String.fromCodePoint(0x1F507);
  const muteBtn = document.getElementById("mute");
  function paintMute() {
    muteBtn.textContent = muted ? CROSSED : SPEAKER;
    muteBtn.classList.toggle("off", muted);
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.setAttribute("aria-label", muted ? "Unmute sound and vibration" : "Mute sound and vibration");
  }
  muteBtn.addEventListener("click", () => {
    muted = !muted;
    store.set(KEY_MUTE, muted ? "1" : "0");
    paintMute();
    if (!muted) { sndPlace(); buzz(12); }   // confirm it is back on
  });
  paintMute();

  /* ---------------- rendering ---------------- */
  const cellEls = [];
  function buildBoard() {
    boardEl.innerHTML = "";
    cellEls.length = 0;
    for (let i = 0; i < N * N; i++) {
      const d = document.createElement("div");
      d.className = "cell";
      boardEl.appendChild(d);
      cellEls.push(d);
    }
  }

  function paint() {
    for (let i = 0; i < N * N; i++) {
      const el = cellEls[i];
      const v = board[i];
      el.classList.remove("ghost", "primed");
      if (v) {
        el.classList.add("filled");
        el.style.background = "var(" + v + ")";
      } else {
        el.classList.remove("filled");
        el.style.background = "";
      }
    }
  }

  const trayEl = document.getElementById("tray");
  function renderTray() {
    trayEl.innerHTML = "";
    tray.forEach((piece, idx) => {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.dataset.idx = idx;
      if (piece) {
        const stuck = !fitsAnywhere(piece, board);
        const size = Math.max(20, Math.round(CELL * 0.58));
        const node = pieceEl(piece, size, 3);
        if (stuck) node.classList.add("dim");
        slot.appendChild(node);
      }
      trayEl.appendChild(slot);
    });
  }

  function pieceEl(piece, size, gap) {
    const g = document.createElement("div");
    g.className = "piece";
    g.style.gridTemplateColumns = "repeat(" + piece.w + ", " + size + "px)";
    g.style.gridTemplateRows = "repeat(" + piece.h + ", " + size + "px)";
    g.style.gap = gap + "px";
    const occupied = new Set(piece.cells.map(c => c[0] + ":" + c[1]));
    for (let r = 0; r < piece.h; r++) {
      for (let c = 0; c < piece.w; c++) {
        const d = document.createElement("div");
        const on = occupied.has(r + ":" + c);
        d.className = "pcell" + (on ? "" : " empty");
        if (on) d.style.background = "var(" + piece.color + ")";
        g.appendChild(d);
      }
    }
    return g;
  }

  /* ---------------- floating notes ---------------- */
  // Someone who asked for less motion still gets the number, just no flight.
  const reducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  function note(text, cls, at) {
    const el = document.createElement("div");
    el.className = "note" + (cls ? " " + cls : "");
    el.textContent = text;
    if (at) {
      el.style.left = (BOARD_PAD + at.c * STEP + CELL / 2) + "px";
      el.style.top = (BOARD_PAD + at.r * STEP + CELL / 2) + "px";
    }
    wrapEl.appendChild(el);
    const drop = () => { if (el.parentNode) el.remove(); };
    if (reducedMotion.matches) {
      setTimeout(drop, 1100);
    } else {
      el.classList.add("rise");
      el.addEventListener("animationend", drop);
      setTimeout(drop, 1400);   // fallback if the animation never fires
    }
  }

  /* ---------------- scoring ---------------- */
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const allBestEl = document.getElementById("allBest");
  const comboEl = document.getElementById("combo");

  // The record to beat is the one that stood when this run STARTED. allBest
  // climbs with the score during a run, so comparing against it live would
  // call every point on a first-ever game a new best.
  let runStartBest = 0;
  let bestHit = false;
  function addScore(n) {
    score += n;
    scoreEl.textContent = score;
    scoreEl.classList.add("bump");
    setTimeout(() => scoreEl.classList.remove("bump"), 120);
    if (score > best) { best = score; bestEl.textContent = best; }
    if (score > allBest) {
      allBest = score;
      allBestEl.textContent = allBest;
      store.set(KEY_BEST, allBest);
    }
    if (!bestHit && runStartBest > 0 && score > runStartBest) {
      bestHit = true;
      note("New best", "best");
      [659.25, 783.99, 1046.50].forEach((f, i) =>
        tone({ type: "sine", from: f, to: f, dur: 0.4, peak: 0.11, at: i * 0.07, attack: 0.01 }));
    }
  }

  function showCombo() {
    if (combo > 1) {
      comboEl.textContent = combo + " clears in a row";
      comboEl.classList.add("on");
    } else {
      comboEl.classList.remove("on");
    }
  }

  /* ---------------- placement ---------------- */
  function place(piece, r0, c0) {
    const touched = [];
    for (const [r, c] of piece.cells) {
      const i = (r0 + r) * N + (c0 + c);
      board[i] = piece.color;
      touched.push(i);
    }
    paint();
    sndPlace();
    buzz(12);
    touched.forEach(i => {
      cellEls[i].classList.add("landing");
      setTimeout(() => cellEls[i].classList.remove("landing"), 190);
    });
    addScore(piece.cells.length);

    const rows = [], cols = [];
    for (let r = 0; r < N; r++) {
      let full = true;
      for (let c = 0; c < N; c++) if (!board[r * N + c]) { full = false; break; }
      if (full) rows.push(r);
    }
    for (let c = 0; c < N; c++) {
      let full = true;
      for (let r = 0; r < N; r++) if (!board[r * N + c]) { full = false; break; }
      if (full) cols.push(c);
    }

    const lines = rows.length + cols.length;
    if (lines) {
      combo++;
      sndClear(lines, combo);
      buzz(clearPattern(lines, combo));
      const doomed = new Set();
      rows.forEach(r => { for (let c = 0; c < N; c++) doomed.add(r * N + c); });
      cols.forEach(c => { for (let r = 0; r < N; r++) doomed.add(r * N + c); });
      doomed.forEach(i => cellEls[i].classList.add("pop"));
      const bonus = 10 * lines * lines + (combo - 1) * 5 * lines;
      // centre the note on the cells that actually cleared
      let sr = 0, sc = 0;
      doomed.forEach(i => { sr += Math.floor(i / N); sc += i % N; });
      note("+" + bonus, "", { r: sr / doomed.size, c: sc / doomed.size });
      addScore(bonus);
      setTimeout(() => {
        doomed.forEach(i => { board[i] = null; cellEls[i].classList.remove("pop"); });
        paint();
        renderTray();
        checkDead();
        saveGame();
      }, 220);
    } else {
      combo = 0;
    }
    showCombo();
    return lines > 0;
  }

  function checkDead() {
    const left = tray.filter(Boolean);
    if (!left.length) return;
    if (!left.some(p => fitsAnywhere(p, board))) endGame();
  }

  /* ---------------- screen wake lock ---------------- */
  // Thinking about a board for thirty seconds should not put the screen out.
  let wakeLock = null;
  function keepAwake() {
    if (!("wakeLock" in navigator) || wakeLock || dead) return;
    if (document.visibilityState !== "visible") return;
    navigator.wakeLock.request("screen").then(lock => {
      wakeLock = lock;
      lock.addEventListener("release", () => { wakeLock = null; });
    }).catch(() => {});
  }
  function releaseAwake() {
    if (!wakeLock) return;
    try { wakeLock.release(); } catch (err) {}
    wakeLock = null;
  }
  // the OS drops the lock whenever the app is backgrounded, so retake it on return
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") keepAwake();
  });

  /* ---------------- saved game ---------------- */
  // The run itself is persisted, not just the score. Phones evict a
  // backgrounded PWA whenever they feel like it, and losing a good board to
  // that is the most annoying way for a run to end.
  const KEY_GAME = "blocks.game";

  function saveGame() {
    if (dead) { store.del(KEY_GAME); return; }
    try {
      store.set(KEY_GAME, JSON.stringify({
        v: 1,
        board: board,
        tray: tray.map(p => p ? { cells: p.cells, color: p.color } : null),
        score: score, best: best, combo: combo, rerolls: rerolls
      }));
    } catch (err) {}
  }

  // Anything in localStorage is untrusted input: it survives across versions and
  // can be edited by hand. A malformed snapshot must yield a fresh game, never a
  // broken one, and a colour is written straight into a CSS var() so it is checked.
  function loadGame() {
    const raw = store.get(KEY_GAME, null);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (!s || s.v !== 1) return null;
      if (!Array.isArray(s.board) || s.board.length !== N * N) return null;
      if (s.board.some(v => v !== null && COLORS.indexOf(v) === -1)) return null;
      if (!Array.isArray(s.tray) || s.tray.length !== 3) return null;

      const tray2 = s.tray.map(p => {
        if (p === null) return null;
        if (!p || !Array.isArray(p.cells) || !p.cells.length || p.cells.length > 9) throw 0;
        if (COLORS.indexOf(p.color) === -1) throw 0;
        p.cells.forEach(c => {
          if (!Array.isArray(c) || c.length !== 2) throw 0;
          if (!Number.isInteger(c[0]) || !Number.isInteger(c[1])) throw 0;
          if (c[0] < 0 || c[0] >= N || c[1] < 0 || c[1] >= N) throw 0;
        });
        const piece = makePiece({ cells: p.cells });
        piece.color = p.color;
        return piece;
      });
      if (!tray2.some(Boolean)) return null;

      const num = (x, lo, hi) => Number.isFinite(x) && x >= lo && x <= hi;
      if (!num(s.score, 0, 1e9) || !num(s.best, 0, 1e9)) return null;
      if (!num(s.combo, 0, 999) || !num(s.rerolls, 0, 3)) return null;

      return { board: s.board.slice(), tray: tray2, score: s.score, best: s.best,
               combo: s.combo, rerolls: s.rerolls };
    } catch (err) {
      return null;
    }
  }

  /* ---------------- dragging ---------------- */
  const floatEl = document.getElementById("float");
  const LIFT = 58;
  let drag = null;

  trayEl.addEventListener("pointerdown", e => {
    if (dead) return;
    const slot = e.target.closest(".slot");
    if (!slot) return;
    const idx = Number(slot.dataset.idx);
    const piece = tray[idx];
    if (!piece) return;

    e.preventDefault();
    audio();       // warm the context while we are inside a real gesture
    keepAwake();
    try { trayEl.setPointerCapture(e.pointerId); } catch (err) {}
    slot.classList.add("held");
    const node = slot.querySelector(".piece");
    if (node) node.classList.add("dragging");
    drag = { idx, piece, slot, node, r: null, c: null };

    floatEl.innerHTML = "";
    floatEl.hidden = false;
    floatEl.appendChild(pieceEl(piece, CELL, GAP));
    moveFloat(e.clientX, e.clientY);

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  });

  function moveFloat(x, y) {
    const p = drag.piece;
    const w = p.w * CELL + (p.w - 1) * GAP;
    const h = p.h * CELL + (p.h - 1) * GAP;
    const left = x - w / 2;
    const top = y - LIFT - h / 2;
    floatEl.style.left = left + "px";
    floatEl.style.top = top + "px";

    const rect = boardEl.getBoundingClientRect();
    const c = Math.round((left - rect.left) / STEP);
    const r = Math.round((top - rect.top) / STEP);
    drag.r = r;
    drag.c = c;
    preview(r, c);
  }

  function preview(r0, c0) {
    paint();
    const p = drag.piece;
    if (!fits(p, r0, c0, board)) return;

    const sim = board.slice();
    const mine = [];
    for (const [r, c] of p.cells) {
      const i = (r0 + r) * N + (c0 + c);
      sim[i] = p.color;
      mine.push(i);
    }
    mine.forEach(i => {
      cellEls[i].style.background = "var(" + p.color + ")";
      cellEls[i].classList.add("filled", "ghost");
    });

    for (let r = 0; r < N; r++) {
      let full = true;
      for (let c = 0; c < N; c++) if (!sim[r * N + c]) { full = false; break; }
      if (full) for (let c = 0; c < N; c++) prime(cellEls[r * N + c], c);
    }
    for (let c = 0; c < N; c++) {
      let full = true;
      for (let r = 0; r < N; r++) if (!sim[r * N + c]) { full = false; break; }
      if (full) for (let r = 0; r < N; r++) prime(cellEls[r * N + c], r);
    }
  }

  // order is the cell's position along the line, so the glints ripple instead of firing together
  function prime(el, order) {
    el.classList.add("primed");
    el.style.setProperty("--d", (order * 0.075).toFixed(3) + "s");
    el.style.setProperty("--sx", (24 + (order * 37) % 52) + "%");
    el.style.setProperty("--sy", (24 + (order * 59) % 52) + "%");
  }

  function onMove(e) {
    if (!drag) return;
    e.preventDefault();
    moveFloat(e.clientX, e.clientY);
  }

  function onUp() {
    if (!drag) return;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);

    const { piece, r, c, idx, node, slot } = drag;
    floatEl.hidden = true;
    floatEl.innerHTML = "";
    if (node) node.classList.remove("dragging");
    if (slot) slot.classList.remove("held");
    drag = null;

    if (r !== null && fits(piece, r, c, board)) {
      tray[idx] = null;
      const cleared = place(piece, r, c);
      if (!tray.some(Boolean)) {
        tray = newTray();
        renderTray();
        setTimeout(checkDead, cleared ? 260 : 0);
      } else {
        renderTray();
        if (!cleared) checkDead();
      }
      if (!cleared) saveGame();
    } else {
      paint();
      renderTray();
    }
  }

  /* ---------------- controls ---------------- */
  const rerollBtn = document.getElementById("reroll");
  const overEl = document.getElementById("over");

  rerollBtn.addEventListener("click", () => {
    if (dead || rerolls <= 0) return;
    rerolls--;
    tray = newTray();
    renderTray();
    updateReroll();
    checkDead();
    saveGame();
  });
  function updateReroll() {
    rerollBtn.textContent = "New pieces (" + rerolls + ")";
    rerollBtn.disabled = rerolls === 0 || dead;
  }

  document.getElementById("restart").addEventListener("click", start);
  document.getElementById("again").addEventListener("click", start);

  function endGame() {
    dead = true;
    store.del(KEY_GAME);
    releaseAwake();
    sndOver();
    buzz([70, 60, 70, 60, 150]);
    updateReroll();
    document.getElementById("finalScore").textContent = score;
    document.getElementById("finalNote").textContent =
      score >= allBest ? "That is your best run ever."
      : score >= best ? "Best this session. All time best is " + allBest + "."
      : "Best this session is " + best + ", all time " + allBest + ".";
    overEl.classList.add("show");
  }

  function start() {
    board = new Array(N * N).fill(null);
    score = 0;
    combo = 0;
    rerolls = 3;
    dead = false;
    runStartBest = allBest;
    bestHit = false;
    overEl.classList.remove("show");
    scoreEl.textContent = "0";
    comboEl.classList.remove("on");
    buildBoard();
    paint();
    tray = newTray();
    renderTray();
    updateReroll();
    saveGame();
  }

  function resume(s) {
    board = s.board;
    score = s.score;
    best = s.best;
    combo = s.combo;
    rerolls = s.rerolls;
    dead = false;
    runStartBest = allBest;
    bestHit = allBest > 0 && score >= allBest;   // already crossed before it was put down
    overEl.classList.remove("show");
    scoreEl.textContent = score;
    bestEl.textContent = best;
    buildBoard();
    paint();
    tray = s.tray;
    renderTray();
    updateReroll();
    showCombo();
    checkDead();   // the board may already have been dead when it was put down
  }

  function boot() {
    const saved = loadGame();
    if (saved) resume(saved); else start();
  }

  // last-ditch save when the phone takes the app away
  window.addEventListener("pagehide", saveGame);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveGame();
  });

  window.addEventListener("resize", () => {
    CELL = sizeBoard();
    STEP = CELL + GAP;
    renderTray();
  });

  /* ---------------- offline ---------------- */
  // Only over http(s). Opened straight off the disk as a file:// URL the
  // game still plays fine, it just cannot install.
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  allBest = loadBest();
  bestEl.textContent = "0";
  allBestEl.textContent = allBest;
  boot();
})();
