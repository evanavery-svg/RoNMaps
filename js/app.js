/* RoN Maps — marker tool.
 * Vanilla JS. A mission's floors are stacked in one native vertical scroll; the browser
 * handles scrolling between floors and pinch/ctrl-wheel zoom. Our only custom gesture is a
 * TAP (stamp / select). Markers are SVG objects stored in image-pixel coordinates so they
 * stay locked to the map across screen sizes, zoom, and devices. */
(function () {
  "use strict";

  const APP_VERSION = "0.11";
  const SVGNS = "http://www.w3.org/2000/svg";
  const STORAGE_PREFIX = "ronmaps:sinuous-trail:";  // kept for backward-compatible save keys
  const UNDO_LIMIT = 60;
  const TAP_MOVE_TOLERANCE = 10;  // px of screen movement still counted as a tap
  const TAP_TIME_LIMIT = 500;     // ms
  const DOUBLE_TAP_MS = 320;      // two taps within this window = double-tap (zoom)
  const DOUBLE_TAP_PX = 34;       // …and within this distance
  const LONG_PRESS_MS = 550;      // hold an X this long to delete it
  const PRESETS = ["#e02424", "#f5a524", "#16a34a", "#2563eb", "#111111", "#ffffff"];

  // ---- DOM ----
  const el = {
    hub: document.getElementById("hub"),
    missionGrid: document.getElementById("missionGrid"),
    missionSearch: document.getElementById("missionSearch"),
    hideComingSoon: document.getElementById("hideComingSoon"),
    hubEmpty: document.getElementById("hubEmpty"),
    installBtn: document.getElementById("installBtn"),
    iosHint: document.getElementById("iosHint"),
    offlineBadge: document.getElementById("offlineBadge"),
    toast: document.getElementById("toast"),
    appFoot: document.getElementById("appFoot"),
    toolbar: document.getElementById("toolbar"),
    backBtn: document.getElementById("backBtn"),
    missionTitle: document.getElementById("missionTitle"),
    stage: document.getElementById("stage"),
    scroller: document.getElementById("floorScroll"),
    stampXBtn: document.getElementById("stampXBtn"),
    stampWBtn: document.getElementById("stampWBtn"),
    eraserBtn: document.getElementById("eraserBtn"),
    swatches: document.getElementById("swatches"),
    colorInput: document.getElementById("colorInput"),
    undoBtn: document.getElementById("undoBtn"),
    redoBtn: document.getElementById("redoBtn"),
    resetBtn: document.getElementById("resetBtn"),
    floorNav: document.getElementById("floorNav"),
    sizeGroup: document.getElementById("sizeGroup"),
    sizeRange: document.getElementById("sizeRange"),
    hint: document.getElementById("hint"),
  };

  // ---- State ----
  const state = {
    mission: null,
    floors: [],          // [{ map, markers, undoStack, section, wrap, img, svg }]
    activeIndex: 0,      // floor targeted by undo/reset (most in view / last tapped)
    selectedId: null,    // globally-selected marker
    selectedIndex: -1,   // index of the floor holding the selected marker
    tool: "stamp",       // "stamp" | "eraser"
    stampType: "x",      // "x" | "w" — which shape the stamp places
    color: "#e02424",
    stampSize: 64,       // default new-marker size, in image px
  };

  // ---- small helpers ----
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function indexOf(floor) { return state.floors.indexOf(floor); }
  function activeFloor() { return state.floors[state.activeIndex] || null; }
  function markerById(floor, id) { return floor && floor.markers.find((m) => m.id === id); }
  function selectedFloor() { return state.selectedIndex >= 0 ? state.floors[state.selectedIndex] : null; }
  function selectedMarker() {
    const f = selectedFloor();
    return f ? markerById(f, state.selectedId) : null;
  }
  function uid() { return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // =========================================================================
  // Persistence (per floor, keyed by map id)
  // =========================================================================
  function loadMarkers(mapId) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + mapId);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data.filter(validMarker) : [];
    } catch (e) { return []; }
  }
  function saveFloor(floor) {
    try { localStorage.setItem(STORAGE_PREFIX + floor.map.id, JSON.stringify(floor.markers)); }
    catch (e) { /* storage full/blocked — non-fatal */ }
  }
  function validMarker(m) {
    return m && typeof m.x === "number" && typeof m.y === "number" &&
      typeof m.size === "number" && typeof m.color === "string" && typeof m.id === "string";
  }

  // =========================================================================
  // Undo (snapshot based, per floor)
  // =========================================================================
  function pushUndo(floor) {
    floor.undoStack.push(JSON.stringify(floor.markers));
    if (floor.undoStack.length > UNDO_LIMIT) floor.undoStack.shift();
    floor.redoStack.length = 0; // a fresh action invalidates the redo history
    updateButtons();
  }
  function undo() {
    const f = activeFloor();
    if (!f || !f.undoStack.length) return;
    f.redoStack.push(JSON.stringify(f.markers));
    applySnapshot(f, f.undoStack.pop());
  }
  function redo() {
    const f = activeFloor();
    if (!f || !f.redoStack.length) return;
    f.undoStack.push(JSON.stringify(f.markers));
    applySnapshot(f, f.redoStack.pop());
  }
  function applySnapshot(f, snap) {
    let markers; try { markers = JSON.parse(snap); } catch (e) { markers = []; }
    f.markers = markers;
    if (state.selectedIndex === indexOf(f) && !f.markers.some((m) => m.id === state.selectedId)) {
      clearSelection();
    }
    saveFloor(f);
    renderFloor(f);
    updateButtons();
    updateSizeGroup();
  }

  // =========================================================================
  // Markers
  // =========================================================================
  let justPlacedId = null;   // marker that should play the pop-in animation (once)
  let placingTimer = null;

  function addMarker(floor, x, y) {
    pushUndo(floor);
    const m = { id: uid(), x, y, size: state.stampSize, color: state.color, type: state.stampType };
    floor.markers.push(m);
    justPlacedId = m.id;
    clearSelection();            // a fresh stamp is NOT selected — tap it again to select
    saveFloor(floor);
    renderFloor(floor);
    updateSizeGroup();
    buzz(15);
    // clear the flag so later re-renders don't replay the animation
    clearTimeout(placingTimer);
    placingTimer = setTimeout(() => { justPlacedId = null; }, 260);
    return m.id;
  }
  function deleteMarker(floor, id) {
    const i = floor.markers.findIndex((m) => m.id === id);
    if (i < 0) return;
    pushUndo(floor);
    floor.markers.splice(i, 1);
    if (state.selectedId === id) clearSelection();
    saveFloor(floor);
    renderFloor(floor);
    updateSizeGroup();
    buzz([10, 30, 10]);
  }
  function buzz(pattern) { try { navigator.vibrate && navigator.vibrate(pattern); } catch (e) {} }
  // Reset clears every floor in the mission (not just the one in view).
  function reset() {
    const toClear = state.floors.filter((f) => f.markers.length);
    if (!toClear.length) return;

    const snapshots = toClear.map((f) => ({ floor: f, markers: f.markers }));
    for (const f of toClear) {
      pushUndo(f);   // keeps per-floor Undo/Redo consistent too
      f.markers = [];
      saveFloor(f);
      renderFloor(f);
    }
    if (state.selectedIndex >= 0 && toClear.includes(state.floors[state.selectedIndex])) {
      clearSelection();
    }
    updateSizeGroup();
    updateButtons();

    const label = toClear.length === state.floors.length ? "Cleared all floors"
      : "Cleared " + toClear.length + (toClear.length === 1 ? " floor" : " floors");
    toast(label, { action: "Undo", onAction: () => undoResetAll(snapshots) });
  }
  function undoResetAll(snapshots) {
    for (const { floor, markers } of snapshots) {
      if (floor.undoStack.length) floor.undoStack.pop(); // remove the snapshot reset() pushed
      floor.markers = markers;
      saveFloor(floor);
      renderFloor(floor);
    }
    updateButtons();
    updateSizeGroup();
  }

  // ---- selection ---- (only ever set by a deliberate tap on an existing mark)
  function setSelected(floor, id) {
    const prev = selectedFloor();
    state.selectedId = id;
    state.selectedIndex = indexOf(floor);
    if (prev && prev !== floor) renderFloor(prev);
    renderFloor(floor);
  }
  function selectMarker(floor, id) { setSelected(floor, id); updateSizeGroup(); }
  function clearSelection() {
    const prev = selectedFloor();
    state.selectedId = null;
    state.selectedIndex = -1;
    if (prev) renderFloor(prev);
  }
  function deselect() {
    if (state.selectedId != null) { clearSelection(); updateSizeGroup(); }
  }

  // =========================================================================
  // Rendering
  // =========================================================================
  function renderFloor(floor) {
    const svg = floor.svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const selId = (indexOf(floor) === state.selectedIndex) ? state.selectedId : null;
    for (const m of floor.markers) svg.appendChild(buildMarker(m, m.id === selId));
    updateFloorCount(floor);
    updateButtons();
  }

  // Re-render ONE marker in place. Used during drag/resize so a gesture does O(1) DOM work
  // instead of rebuilding every marker on the floor each frame.
  function renderMarkerNode(floor, m) {
    const selId = (indexOf(floor) === state.selectedIndex) ? state.selectedId : null;
    const next = buildMarker(m, m.id === selId);
    const old = floor.svg.querySelector('[data-id="' + m.id + '"]');
    if (old) floor.svg.replaceChild(next, old);
    else floor.svg.appendChild(next);
  }

  function updateFloorCount(floor) {
    if (floor.countEl) {
      floor.countEl.textContent = floor.markers.length ? " · " + floor.markers.length : "";
    }
  }

  const W_SCALE = 0.82;  // render W a bit smaller so the X reads a little bigger

  function buildMarker(m, selected) {
    const g = document.createElementNS(SVGNS, "g");
    // `.placing` plays the pop-in once, only for a mark that was just stamped
    const placing = m.id === justPlacedId;
    g.setAttribute("class", "mark" + (selected ? " selected" : "") + (placing ? " placing" : ""));
    g.dataset.id = m.id;

    const rs = m.size * (m.type === "w" ? W_SCALE : 1); // rendered size for this shape
    const h = rs / 2;
    const sw = Math.max(4, rs * 0.16); // stroke scales with size

    if (m.type === "w") {
      g.appendChild(letterW(m, rs, sw));
    } else {
      // subtle dark backing so a light-colored X reads on a light blueprint
      g.appendChild(lineGroup(m, h, sw + 6, "rgba(0,0,0,0.35)"));
      g.appendChild(lineGroup(m, h, sw, m.color));
    }

    if (selected) {
      const box = document.createElementNS(SVGNS, "rect");
      box.setAttribute("class", "sel-box");
      box.setAttribute("x", m.x - h); box.setAttribute("y", m.y - h);
      box.setAttribute("width", rs); box.setAttribute("height", rs);
      g.appendChild(box);

      const handle = document.createElementNS(SVGNS, "circle");
      handle.setAttribute("class", "sel-handle");
      handle.setAttribute("cx", m.x + h); handle.setAttribute("cy", m.y + h);
      handle.setAttribute("r", Math.max(14, sw));
      handle.dataset.role = "resize";
      handle.dataset.id = m.id;
      g.appendChild(handle);
    }
    return g;
  }
  function lineGroup(m, h, sw, color) {
    const grp = document.createElementNS(SVGNS, "g");
    grp.setAttribute("stroke", color);
    grp.setAttribute("stroke-width", sw);
    grp.setAttribute("stroke-linecap", "round");
    grp.appendChild(makeLine(m.x - h, m.y - h, m.x + h, m.y + h));
    grp.appendChild(makeLine(m.x + h, m.y - h, m.x - h, m.y + h));
    return grp;
  }
  function makeLine(x1, y1, x2, y2) {
    const l = document.createElementNS(SVGNS, "line");
    l.setAttribute("x1", x1); l.setAttribute("y1", y1);
    l.setAttribute("x2", x2); l.setAttribute("y2", y2);
    return l;
  }
  // A bold "W" with a dark halo (stroke painted behind the fill), to match the X's
  // haloed, color-themed look and stay legible on the blueprints.
  function letterW(m, rs, sw) {
    const t = document.createElementNS(SVGNS, "text");
    t.textContent = "W";
    t.setAttribute("x", m.x);
    t.setAttribute("y", m.y);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("dominant-baseline", "central");
    t.setAttribute("font-family", "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif");
    t.setAttribute("font-weight", "900");
    t.setAttribute("font-size", rs * 1.15);
    t.setAttribute("fill", m.color);
    t.setAttribute("stroke", "rgba(0,0,0,0.4)");
    t.setAttribute("stroke-width", sw + 6);
    t.setAttribute("paint-order", "stroke");
    t.setAttribute("stroke-linejoin", "round");
    return t;
  }

  // =========================================================================
  // Coordinates: screen -> image pixels for a given floor.
  // Works under native pinch-zoom/scroll because clientX and the rect are both
  // in layout-viewport CSS px.
  // =========================================================================
  function toImage(floor, clientX, clientY) {
    return toImageRect(floor, floor.img.getBoundingClientRect(), clientX, clientY);
  }
  // Same math against an already-measured rect — lets a drag reuse one measurement per
  // frame instead of forcing a layout read on every pointermove.
  function toImageRect(floor, rect, clientX, clientY) {
    return {
      x: (clientX - rect.left) / rect.width * floor.map.width,
      y: (clientY - rect.top) / rect.height * floor.map.height,
    };
  }
  function inBounds(floor, p) {
    return p.x >= 0 && p.y >= 0 && p.x <= floor.map.width && p.y <= floor.map.height;
  }
  function floorFromEvent(e) {
    const secEl = e.target.closest && e.target.closest(".floor-section");
    if (!secEl) return null;
    return state.floors[Number(secEl.dataset.index)] || null;
  }

  // =========================================================================
  // Pointer handling — tap to stamp/select; drag a corner handle to resize.
  // We do NOT pointer-capture for taps, so native scroll/zoom keep working; a
  // scroll fires pointercancel, which cancels the pending tap.
  // =========================================================================
  let press = null;
  let lastTap = null;          // for double-tap detection
  let longPressTimer = null;

  function armLongPress(floor, id) {
    clearLongPress();
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (!press) return;
      press.longPressed = true;   // pointerup will see this and skip the tap/drag
      deleteMarker(floor, id);    // long-press an X to delete it (buzzes)
      lastTap = null;
    }, LONG_PRESS_MS);
  }
  function clearLongPress() { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } }

  // Remove a marker without adding undo noise — used to undo the phantom X that a
  // double-tap's first tap placed (addMarker pushed one undo snapshot we pop here).
  function removeMarkerSilently(floor, id) {
    const i = floor.markers.findIndex((m) => m.id === id);
    if (i < 0) return;
    floor.markers.splice(i, 1);
    floor.undoStack.pop();
    if (state.selectedId === id) clearSelection();
    saveFloor(floor);
    renderFloor(floor);
    updateSizeGroup();
  }

  function onPointerDown(e) {
    const floor = floorFromEvent(e);
    if (!floor) { press = null; return; }

    const handle = e.target.closest && e.target.closest("[data-role='resize']");
    const mark = e.target.closest && e.target.closest(".mark");

    if (handle) {
      const m = markerById(floor, handle.dataset.id);
      if (!m) { press = null; return; }
      e.preventDefault();
      el.scroller.setPointerCapture && el.scroller.setPointerCapture(e.pointerId);
      pushUndo(floor);
      press = { kind: "resize", floor, id: m.id, changed: false };
    } else if (mark && state.tool === "stamp" &&
               mark.dataset.id === state.selectedId && indexOf(floor) === state.selectedIndex) {
      // Drag the already-selected X to reposition it (capture so it won't scroll).
      el.scroller.setPointerCapture && el.scroller.setPointerCapture(e.pointerId);
      const m = markerById(floor, mark.dataset.id);
      press = {
        kind: "move", floor, id: mark.dataset.id,
        startImg: toImage(floor, e.clientX, e.clientY), startX: m.x, startY: m.y,
        downX: e.clientX, downY: e.clientY, downTime: performance.now(), moved: false, changed: false,
      };
      armLongPress(floor, mark.dataset.id);
    } else if (mark) {
      press = {
        kind: "mark", floor, id: mark.dataset.id,
        downX: e.clientX, downY: e.clientY, downTime: performance.now(), moved: false,
      };
      armLongPress(floor, mark.dataset.id);
    } else {
      press = {
        kind: "empty", floor, startImg: toImage(floor, e.clientX, e.clientY),
        downX: e.clientX, downY: e.clientY, downTime: performance.now(), moved: false,
      };
    }
  }

  // Drag/resize work is coalesced into ONE requestAnimationFrame per frame: pointermove
  // just records the latest position, and the frame does the geometry + a single-marker
  // DOM update. Keeps a 120Hz stream of events from rebuilding the floor dozens of times.
  let gestureRaf = 0;

  function scheduleGestureFrame() {
    if (gestureRaf) return;
    gestureRaf = requestAnimationFrame(() => {
      gestureRaf = 0;
      applyGestureFrame();
    });
  }

  // Run any pending frame immediately (on pointerup) so the committed position is exact.
  function flushGesture() {
    if (!gestureRaf) return;
    cancelAnimationFrame(gestureRaf);
    gestureRaf = 0;
    applyGestureFrame();
  }

  function applyGestureFrame() {
    const p = press;
    if (!p || (p.kind !== "resize" && p.kind !== "move")) return;
    const m = markerById(p.floor, p.id);
    if (!m) return;
    // one measurement per frame, reused for this frame's math
    if (!p.rect) p.rect = p.floor.img.getBoundingClientRect();
    const img = toImageRect(p.floor, p.rect, p.lastX, p.lastY);

    if (p.kind === "resize") {
      m.size = clamp(Math.max(Math.abs(img.x - m.x), Math.abs(img.y - m.y)) * 2, 16, 8000);
      el.sizeRange.value = Math.round(Math.min(220, m.size));
    } else {
      m.x = clamp(p.startX + (img.x - p.startImg.x), 0, p.floor.map.width);
      m.y = clamp(p.startY + (img.y - p.startImg.y), 0, p.floor.map.height);
    }
    renderMarkerNode(p.floor, m);   // O(1) instead of rebuilding every marker
  }

  function onPointerMove(e) {
    if (!press) return;
    if (press.kind === "resize") {
      e.preventDefault();
      clearLongPress();          // a drag is not a long-press
      press.lastX = e.clientX; press.lastY = e.clientY;
      press.changed = true;
      scheduleGestureFrame();
      return;
    }
    if (press.kind === "move") {
      const far = Math.hypot(e.clientX - press.downX, e.clientY - press.downY) > TAP_MOVE_TOLERANCE;
      if (!far && !press.changed) return;
      e.preventDefault();
      clearLongPress();          // once you're dragging, don't fire the delete timer
      if (!press.changed) { pushUndo(press.floor); press.changed = true; }
      press.lastX = e.clientX; press.lastY = e.clientY;
      press.moved = true;
      scheduleGestureFrame();
      return;
    }
    if (Math.hypot(e.clientX - press.downX, e.clientY - press.downY) > TAP_MOVE_TOLERANCE) {
      press.moved = true;
      clearLongPress();
    }
  }

  function onPointerUp(e) {
    if (!press) return;
    clearLongPress();
    if (press.kind === "resize" || press.kind === "move") {
      el.scroller.releasePointerCapture && el.scroller.releasePointerCapture(e.pointerId);
      flushGesture();   // apply any frame still pending so the final position is exact
    }
    const p = press;
    press = null;

    if (p.longPressed) return;                 // already handled by the long-press delete
    if (p.kind === "resize") { commitResize(p); return; }
    if (p.kind === "move" && p.moved) { commitDrag(p); return; }

    const dt = performance.now() - p.downTime;
    const isTap = !p.moved && dt < TAP_TIME_LIMIT;
    if (!isTap) { if (p.kind === "move") commitDrag(p); return; }

    setActiveFloor(indexOf(p.floor));

    // Double-tap → zoom that floor (undo any X the first tap just placed).
    const now = performance.now();
    const isDouble = lastTap && (now - lastTap.time < DOUBLE_TAP_MS) &&
      Math.hypot(p.downX - lastTap.x, p.downY - lastTap.y) < DOUBLE_TAP_PX &&
      lastTap.floorIdx === indexOf(p.floor);
    if (isDouble) {
      if (lastTap.stampedId) removeMarkerSilently(p.floor, lastTap.stampedId);
      lastTap = null;
      const c = toImage(p.floor, p.downX, p.downY);
      toggleZoom(p.floor, c.x, c.y);
      return;
    }

    let stampedId = null;
    if (p.kind === "mark") {
      if (state.tool === "eraser") deleteMarker(p.floor, p.id);
      else selectMarker(p.floor, p.id);
    } else if (p.kind === "move") {
      // tap on the already-selected X — keep it selected (no-op)
    } else { // empty
      if (state.tool === "stamp" && inBounds(p.floor, p.startImg)) {
        stampedId = addMarker(p.floor, p.startImg.x, p.startImg.y);
      } else {
        deselect();
      }
    }
    lastTap = { time: now, x: p.downX, y: p.downY, floorIdx: indexOf(p.floor), stampedId };
  }

  function onPointerCancel() {
    clearLongPress();
    if (press && (press.kind === "resize" || press.kind === "move")) flushGesture();
    if (press && press.kind === "resize") commitResize(press);
    else if (press && press.kind === "move" && press.moved) commitDrag(press);
    press = null;
  }

  function commitResize(p) {
    const m = markerById(p.floor, p.id);
    if (p.changed) {
      if (m) state.stampSize = m.size;
      saveFloor(p.floor);
      savePrefs();
    } else {
      p.floor.undoStack.pop(); // nothing changed — discard the snapshot we pushed
    }
    renderFloor(p.floor);   // one exact full render after the fast per-frame updates
    updateButtons();
  }

  function commitDrag(p) {
    if (p.changed) saveFloor(p.floor); // undo snapshot was pushed on first move
    renderFloor(p.floor);
    updateButtons();
  }

  // =========================================================================
  // Active floor (targets undo/reset) — tracked by scroll via IntersectionObserver
  // =========================================================================
  const ratios = new Map();
  let io = null;
  function ensureObserver() {
    if (io) return io;
    io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        ratios.set(Number(en.target.dataset.index), en.isIntersecting ? en.intersectionRatio : 0);
      }
      let best = -1, bestR = -1;
      ratios.forEach((r, i) => { if (r > bestR) { bestR = r; best = i; } });
      if (best >= 0 && best !== state.activeIndex) setActiveFloor(best);
    }, { root: el.scroller, threshold: [0, 0.25, 0.5, 0.75, 1] });
    return io;
  }
  function setActiveFloor(i) {
    if (i < 0 || i >= state.floors.length) return;
    state.activeIndex = i;
    state.floors.forEach((f, idx) => f.section.classList.toggle("active", idx === i));
    const pills = el.floorNav.children;
    for (let k = 0; k < pills.length; k++) pills[k].classList.toggle("active", k === i);
    updateButtons();
  }

  // =========================================================================
  // UI wiring
  // =========================================================================
  function buildSwatches() {
    el.swatches.innerHTML = "";
    for (const c of PRESETS) {
      const b = document.createElement("button");
      b.className = "swatch";
      b.style.setProperty("--sw", c);
      b.title = c;
      b.setAttribute("aria-label", "Color " + c);
      b.addEventListener("click", () => setColor(c));
      el.swatches.appendChild(b);
    }
  }

  function setColor(c) {
    state.color = c;
    el.colorInput.value = normalizeHex(c) || el.colorInput.value;
    const m = selectedMarker();
    // Recolor the selected mark (selection is always a deliberate tap now); otherwise
    // this just sets the color for the next stamp.
    if (m && m.color !== c) {
      const f = selectedFloor();
      pushUndo(f);
      m.color = c;
      saveFloor(f);
      renderFloor(f);
    }
    for (const b of el.swatches.children) {
      b.classList.toggle("active", b.style.getPropertyValue("--sw").trim().toLowerCase() === c.toLowerCase());
    }
    savePrefs();
  }
  function normalizeHex(c) { return /^#[0-9a-fA-F]{6}$/.test(c) ? c : null; }

  // Pick which shape the stamp places (X or W). If a mark is selected (a deliberate
  // tap), also convert it — so you can switch an existing mark's shape just as easily.
  function setStampType(type) {
    state.stampType = type;
    if (state.tool !== "stamp") setTool("stamp");
    const m = selectedMarker();
    if (m && (m.type || "x") !== type) {
      const f = selectedFloor();
      pushUndo(f);
      m.type = type;
      saveFloor(f);
      renderFloor(f);
    }
    updateToolButtons();
    savePrefs();
  }

  // Remember the chosen color, default stamp size, and shape across sessions.
  function savePrefs() {
    try {
      localStorage.setItem(STORAGE_PREFIX + "color", state.color);
      localStorage.setItem(STORAGE_PREFIX + "size", String(state.stampSize));
      localStorage.setItem(STORAGE_PREFIX + "type", state.stampType);
    } catch (e) {}
  }
  function loadPrefs() {
    try {
      const c = localStorage.getItem(STORAGE_PREFIX + "color");
      if (normalizeHex(c)) state.color = c;
      const s = Number(localStorage.getItem(STORAGE_PREFIX + "size"));
      if (s >= 16 && s <= 220) state.stampSize = s;
      const t = localStorage.getItem(STORAGE_PREFIX + "type");
      if (t === "x" || t === "w") state.stampType = t;
    } catch (e) {}
  }

  function setTool(tool) {
    state.tool = tool;
    if (tool === "eraser") deselect();
    updateToolButtons();
    el.hint.textContent = tool === "eraser"
      ? "Eraser: tap a mark to remove it."
      : "Tap to stamp · scroll for floors · double-tap to zoom.";
  }

  // Highlight the active tool/shape: X or W while stamping, else Eraser.
  function updateToolButtons() {
    const stamping = state.tool === "stamp";
    const xActive = stamping && state.stampType === "x";
    const wActive = stamping && state.stampType === "w";
    el.stampXBtn.classList.toggle("active", xActive);
    el.stampWBtn.classList.toggle("active", wActive);
    el.eraserBtn.classList.toggle("active", state.tool === "eraser");
    el.stampXBtn.setAttribute("aria-pressed", String(xActive));
    el.stampWBtn.setAttribute("aria-pressed", String(wActive));
    el.eraserBtn.setAttribute("aria-pressed", String(state.tool === "eraser"));
  }

  function updateButtons() {
    const f = activeFloor();
    el.undoBtn.disabled = !f || f.undoStack.length === 0;
    el.redoBtn.disabled = !f || f.redoStack.length === 0;
    el.resetBtn.disabled = !state.floors.some((fl) => fl.markers.length);
  }

  function updateSizeGroup() {
    const m = selectedMarker();
    if (m) {
      el.sizeGroup.hidden = false;
      el.sizeRange.value = Math.round(clamp(m.size, 16, 220));
    } else {
      el.sizeGroup.hidden = true;
    }
  }
  function onSizeInput() {
    const m = selectedMarker();
    const val = Number(el.sizeRange.value);
    if (m) {
      const f = selectedFloor();
      if (!onSizeInput._dragging) { pushUndo(f); onSizeInput._dragging = true; }
      m.size = val;
      renderFloor(f);
    } else {
      state.stampSize = val;
      savePrefs();
    }
  }
  function onSizeCommit() {
    if (onSizeInput._dragging) {
      const m = selectedMarker();
      if (m) { state.stampSize = m.size; saveFloor(selectedFloor()); savePrefs(); }
      onSizeInput._dragging = false;
      updateButtons();
    }
  }

  // =========================================================================
  // Hub (mission picker) + navigation
  // =========================================================================
  const hubCards = []; // [{ card, mission, available, metaEl }]

  function buildHub() {
    el.missionGrid.innerHTML = "";
    hubCards.length = 0;
    for (const mission of MISSIONS) {
      const available = mission.maps.length > 0;
      const card = document.createElement("button");
      card.className = "mission-card " + (available ? "available" : "locked");
      card.type = "button";
      if (!available) card.disabled = true;

      const num = document.createElement("div");
      num.className = "m-num";
      num.textContent = "Mission " + mission.number;

      const name = document.createElement("div");
      name.className = "m-name";
      name.textContent = available ? mission.name : (mission.name || "Coming soon");

      const meta = document.createElement("div");
      meta.className = "m-meta";

      card.append(num, name, meta);
      if (available) card.addEventListener("click", () => openMission(mission));
      el.missionGrid.appendChild(card);
      hubCards.push({ card, mission, available, metaEl: meta });
    }
    refreshHubCounts();
  }

  // Per-mission marked totals (summed from storage), shown in each card's meta line.
  function refreshHubCounts() {
    for (const hc of hubCards) {
      if (!hc.available) { hc.metaEl.textContent = "Coming soon"; continue; }
      const n = hc.mission.maps.length;
      let marked = 0;
      for (const map of hc.mission.maps) marked += loadMarkers(map.id).length;
      hc.metaEl.textContent = n + (n === 1 ? " map" : " maps") +
        (marked ? " · " + marked + " marked" : "");
    }
  }

  function filterHub() {
    const q = el.missionSearch.value.trim().toLowerCase();
    const hideSoon = el.hideComingSoon.checked;
    let shown = 0;
    for (const hc of hubCards) {
      const matchesSearch = !q ||
        hc.mission.name.toLowerCase().includes(q) ||
        String(hc.mission.number) === q ||
        ("mission " + hc.mission.number).includes(q);
      const passesToggle = !hideSoon || hc.available;
      const visible = matchesSearch && passesToggle;
      hc.card.hidden = !visible;
      if (visible) shown++;
    }
    el.hubEmpty.hidden = shown > 0;
  }

  function showHub() {
    teardownFloors();
    state.mission = null;
    el.stage.hidden = true;
    el.toolbar.hidden = true;
    el.hub.hidden = false;
    refreshHubCounts();  // reflect edits made inside the mission we just left
  }

  function openMission(mission) {
    if (!mission.maps.length) return;
    state.mission = mission;
    el.missionTitle.textContent = mission.name;
    el.hub.hidden = true;
    el.toolbar.hidden = false;
    el.stage.hidden = false;      // must be visible before we measure/observe
    pinRail();
    buildFloors(mission);
    buildFloorNav(mission);
    layoutFloors();
    clearSelection();
    updateSizeGroup();
    setTool(state.tool);
    el.scroller.scrollTop = 0;
    setActiveFloor(0);
  }

  // Fit each floor to roughly the viewport height so a whole floor is visible
  // (great on an iPad in landscape, where portrait maps would otherwise be huge).
  function layoutFloors() {
    const availH = el.scroller.clientHeight || window.innerHeight;
    const availW = el.scroller.clientWidth || window.innerWidth;
    for (const f of state.floors) {
      if (f.zoomed) continue;
      const w = f.map.width, h = f.map.height;
      if (!w || !h) { f.wrap.style.width = ""; continue; }
      const fitW = Math.min(availW, (w / h) * availH * 0.92);
      f.fitWidth = fitW;
      f.wrap.style.width = Math.round(fitW) + "px";
    }
  }

  // Floor quick-jump pills in the toolbar (only when a mission has >1 floor).
  function buildFloorNav(mission) {
    el.floorNav.innerHTML = "";
    if (mission.maps.length < 2) { el.floorNav.hidden = true; return; }
    el.floorNav.hidden = false;
    mission.maps.forEach((map, idx) => {
      const b = document.createElement("button");
      b.className = "floor-pill";
      b.type = "button";
      b.textContent = map.name;
      b.addEventListener("click", () => jumpToFloor(idx));
      el.floorNav.appendChild(b);
    });
  }
  function jumpToFloor(idx) {
    const f = state.floors[idx];
    if (!f) return;
    f.section.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveFloor(idx);
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // Double-tap toggles a floor between fit-to-view and zoomed-in (wider than the
  // viewport, so you can pan horizontally). imgX/imgY are image px to zoom toward.
  //
  // Animated with FLIP: set the final width immediately (one layout), then apply the
  // inverse scale and transition THAT back to 1. Transforms are GPU-composited, so the
  // big blueprint doesn't re-layout every frame the way animating `width` would.
  function toggleZoom(floor, imgX, imgY) {
    const prevW = floor.wrap.getBoundingClientRect().width;
    floor.zoomed = !floor.zoomed;

    const availW = el.scroller.clientWidth || window.innerWidth;
    const nextW = floor.zoomed
      ? Math.max((floor.fitWidth || availW) * 2.2, availW * 1.6)
      : floor.fitWidth;

    if (floor.zoomed) el.scroller.classList.add("zoomed");

    // FLIP: jump to the new width, then play the scale back from the old one.
    floor.wrap.style.transition = "none";
    floor.wrap.style.width = Math.round(nextW) + "px";

    const ratio = prevW / nextW;
    if (!reducedMotion() && isFinite(ratio) && ratio > 0 && Math.abs(ratio - 1) > 0.01) {
      // zoom toward the tapped point
      floor.wrap.style.transformOrigin =
        (imgX / floor.map.width * 100) + "% " + (imgY / floor.map.height * 100) + "%";
      floor.wrap.style.transform = "scale(" + ratio + ")";
      requestAnimationFrame(() => {
        floor.wrap.style.transition = "transform .22s cubic-bezier(.22,.61,.36,1)";
        floor.wrap.style.transform = "scale(1)";
      });
      clearTimeout(floor.zoomTimer);
      floor.zoomTimer = setTimeout(() => {
        floor.wrap.style.transition = "";
        floor.wrap.style.transform = "";
      }, 280);
    } else {
      floor.wrap.style.transform = "";
    }

    // pan in the same frame so the scale and the recentering move together
    requestAnimationFrame(() => {
      centerOn(floor, imgX, imgY);
      if (!floor.zoomed && !state.floors.some((f) => f.zoomed)) {
        el.scroller.classList.remove("zoomed");
      }
    });
  }
  function centerOn(floor, imgX, imgY) {
    const rect = floor.img.getBoundingClientRect();
    const sc = el.scroller.getBoundingClientRect();
    const targetX = rect.left + (imgX / floor.map.width) * rect.width;
    const targetY = rect.top + (imgY / floor.map.height) * rect.height;
    const left = el.scroller.scrollLeft + (targetX - sc.left) - sc.width / 2;
    const top = el.scroller.scrollTop + (targetY - sc.top) - sc.height / 2;
    el.scroller.scrollTo({ left, top, behavior: reducedMotion() ? "auto" : "smooth" });
  }

  // Keep the left rail glued to the VISUAL viewport so it stays on screen (and a
  // constant size) while the page is pinch-zoomed — otherwise a fixed element gets
  // left behind in the layout viewport and scrolls out of view when you zoom in.
  function pinRail() {
    const vv = window.visualViewport;
    if (!vv) return;
    el.toolbar.style.transform =
      "translate(" + vv.offsetLeft + "px, " + vv.offsetTop + "px) scale(" + (1 / vv.scale) + ")";
  }
  function setupViewportPin() {
    const vv = window.visualViewport;
    if (!vv) return;
    vv.addEventListener("resize", pinRail);
    vv.addEventListener("scroll", pinRail);
    pinRail();
  }

  // =========================================================================
  // Build / tear down the stacked floors for a mission
  // =========================================================================
  function buildFloors(mission) {
    teardownFloors();
    ensureObserver();
    state.floors = [];
    el.scroller.innerHTML = "";

    mission.maps.forEach((map, idx) => {
      const section = document.createElement("section");
      section.className = "floor-section";
      section.dataset.index = String(idx);

      const label = document.createElement("div");
      label.className = "floor-label";
      const labelName = document.createElement("span");
      labelName.textContent = map.name;
      const countEl = document.createElement("span");
      countEl.className = "floor-count";
      label.append(labelName, countEl);

      const wrap = document.createElement("div");
      wrap.className = "floor-wrap";

      const img = document.createElement("img");
      img.className = "map-img";
      img.alt = mission.name + " — " + map.name;
      img.draggable = false;

      const svg = document.createElementNS(SVGNS, "svg");
      svg.setAttribute("class", "overlay");
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

      wrap.append(img, svg);
      section.append(label, wrap);
      el.scroller.appendChild(section);

      const floor = { map, markers: loadMarkers(map.id), undoStack: [], redoStack: [], section, wrap, img, svg, countEl, zoomed: false, fitWidth: 0 };
      state.floors.push(floor);

      const applyDims = (w, h) => {
        svg.setAttribute("viewBox", "0 0 " + w + " " + h);
        wrap.style.aspectRatio = w + " / " + h;
      };
      if (map.width && map.height) applyDims(map.width, map.height);

      img.onload = () => {
        if (!map.width || !map.height) {
          map.width = img.naturalWidth || 1000;
          map.height = img.naturalHeight || 1000;
          applyDims(map.width, map.height);
        }
        renderFloor(floor);
      };
      img.src = map.src;

      renderFloor(floor);
      io.observe(section);
    });
  }

  function teardownFloors() {
    if (io) io.disconnect();
    ratios.clear();
    state.floors = [];
    state.activeIndex = 0;
    state.selectedId = null;
    state.selectedIndex = -1;
    press = null;
    lastTap = null;
    clearLongPress();
    el.scroller.innerHTML = "";
    el.scroller.classList.remove("zoomed");
    el.floorNav.innerHTML = "";
    el.floorNav.hidden = true;
  }

  // =========================================================================
  // Init
  // =========================================================================
  function init() {
    buildSwatches();
    loadPrefs();
    setColor(state.color);
    el.sizeRange.value = Math.round(clamp(state.stampSize, 16, 220));
    buildHub();
    el.appFoot.textContent = "© Avery LLC · v" + APP_VERSION;

    el.backBtn.addEventListener("click", showHub);
    el.stampXBtn.addEventListener("click", () => setStampType("x"));
    el.stampWBtn.addEventListener("click", () => setStampType("w"));
    el.eraserBtn.addEventListener("click", () => setTool("eraser"));
    el.undoBtn.addEventListener("click", undo);
    el.redoBtn.addEventListener("click", redo);
    el.resetBtn.addEventListener("click", reset);
    el.colorInput.addEventListener("input", () => setColor(el.colorInput.value));
    el.sizeRange.addEventListener("input", onSizeInput);
    el.sizeRange.addEventListener("change", onSizeCommit);
    el.sizeRange.addEventListener("pointerup", onSizeCommit);

    // pointer events (delegated on the scroll container)
    el.scroller.addEventListener("pointerdown", onPointerDown);
    el.scroller.addEventListener("pointermove", onPointerMove);
    el.scroller.addEventListener("pointerup", onPointerUp);
    el.scroller.addEventListener("pointercancel", onPointerCancel);
    el.scroller.addEventListener("contextmenu", (e) => e.preventDefault());

    // Keep the left rail pinned to the visual viewport during pinch-zoom.
    setupViewportPin();

    // Re-fit floors when the screen changes (e.g. rotating the iPad).
    const relayout = () => { if (state.mission) { layoutFloors(); pinRail(); } };
    window.addEventListener("resize", relayout);
    window.addEventListener("orientationchange", () => setTimeout(relayout, 250));

    document.addEventListener("keydown", (e) => {
      if (!el.hub.hidden) return; // no shortcuts on the hub
      const z = e.key.toLowerCase() === "z";
      if ((e.ctrlKey || e.metaKey) && z && e.shiftKey) { e.preventDefault(); redo(); }
      else if ((e.ctrlKey || e.metaKey) && z) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if (e.key === "Escape") showHub();
      else if (e.key === "e") setTool("eraser");
      else if (e.key === "x" || e.key === "s") setStampType("x");
      else if (e.key === "w") setStampType("w");
      else if ((e.key === "Delete" || e.key === "Backspace") && state.selectedId) {
        e.preventDefault();
        deleteMarker(selectedFloor(), state.selectedId);
      }
    });

    // Hub search + "hide coming soon" toggle
    el.missionSearch.addEventListener("input", filterHub);
    try {
      el.hideComingSoon.checked = localStorage.getItem(STORAGE_PREFIX + "hideSoon") === "1";
    } catch (e) {}
    el.hideComingSoon.addEventListener("change", () => {
      try { localStorage.setItem(STORAGE_PREFIX + "hideSoon", el.hideComingSoon.checked ? "1" : "0"); } catch (e) {}
      filterHub();
    });
    filterHub();

    setupPwaPolish();

    // Start on the hub so the user picks a mission first.
    showHub();

    registerServiceWorker();
  }

  // =========================================================================
  // PWA polish: install button, offline badge, "updated" toast
  // =========================================================================
  let deferredInstall = null;

  function setupPwaPolish() {
    // Install button (Chromium/Android). iOS Safari fires no event → show a hint instead.
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstall = e;
      if (!isStandalone()) el.installBtn.hidden = false;
    });
    el.installBtn.addEventListener("click", async () => {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      try { await deferredInstall.userChoice; } catch (e) {}
      deferredInstall = null;
      el.installBtn.hidden = true;
    });
    window.addEventListener("appinstalled", () => {
      el.installBtn.hidden = true;
      deferredInstall = null;
    });
    if (isIOS() && !isStandalone()) el.iosHint.hidden = false;

    // Offline indicator
    const updateOnline = () => { el.offlineBadge.hidden = navigator.onLine; };
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    updateOnline();

    // "Updated to vX" toast after a force-update
    try {
      const key = STORAGE_PREFIX + "lastVersion";
      const prev = localStorage.getItem(key);
      if (prev && prev !== APP_VERSION) toast("Updated to v" + APP_VERSION);
      localStorage.setItem(key, APP_VERSION);
    } catch (e) {}
  }

  function isStandalone() {
    return window.matchMedia && window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
  }
  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  let toastTimer = null;
  function hideToast() {
    el.toast.classList.remove("show");
    setTimeout(() => { el.toast.hidden = true; }, 300);
  }
  function toast(msg, opts) {
    el.toast.innerHTML = "";
    const span = document.createElement("span");
    span.textContent = msg;
    el.toast.appendChild(span);
    if (opts && opts.action) {
      const btn = document.createElement("button");
      btn.className = "toast-action";
      btn.textContent = opts.action;
      btn.addEventListener("click", () => { hideToast(); if (opts.onAction) opts.onAction(); });
      el.toast.appendChild(btn);
    }
    el.toast.hidden = false;
    void el.toast.offsetWidth; // reflow so the fade-in runs each time
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, opts && opts.action ? 4200 : 2600);
  }

  // Register the SW and force it to check for a newer version on every open,
  // reloading once when a new version takes control so the app is always current.
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", async () => {
      try {
        const reg = await navigator.serviceWorker.register("service-worker.js", { updateViaCache: "none" });

        const hadController = !!navigator.serviceWorker.controller;
        let reloaded = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (reloaded || !hadController) return;
          reloaded = true;
          window.location.reload();
        });

        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              nw.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        reg.update();
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update();
        });
      } catch (e) { /* SW unsupported/blocked — app still works online */ }
    });
  }

  init();
})();
