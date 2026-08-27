/* RoN Maps — marker tool.
 * Vanilla JS. A mission's floors are stacked in one native vertical scroll; the browser
 * handles scrolling between floors and pinch/ctrl-wheel zoom. Our only custom gesture is a
 * TAP (stamp / select). Markers are SVG objects stored in image-pixel coordinates so they
 * stay locked to the map across screen sizes, zoom, and devices. */
(function () {
  "use strict";

  const APP_VERSION = "0.22";
  const SVGNS = "http://www.w3.org/2000/svg";
  const STORAGE_PREFIX = "ronmaps:sinuous-trail:";  // kept for backward-compatible save keys
  const UNDO_LIMIT = 60;
  const TAP_MOVE_TOLERANCE = 10;  // px of screen movement still counted as a tap
  const TAP_TIME_LIMIT = 500;     // ms
  const DOUBLE_TAP_MS = 320;      // two taps within this window = double-tap (zoom)
  const DOUBLE_TAP_PX = 34;       // …and within this distance
  const LONG_PRESS_MS = 550;      // hold an X this long to delete it
  const LONG_TAP_STAMP_MS = 380;  // hold on empty space this long to stamp X (shorter = W)
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
    splash: document.getElementById("splash"),
    toolbar: document.getElementById("toolbar"),
    railToggle: document.getElementById("railToggle"),
    backBtn: document.getElementById("backBtn"),
    missionTitle: document.getElementById("missionTitle"),
    stage: document.getElementById("stage"),
    scroller: document.getElementById("floorScroll"),
    stampXBtn: document.getElementById("stampXBtn"),
    stampWBtn: document.getElementById("stampWBtn"),
    arrowBtn: document.getElementById("arrowBtn"),
    penBtn: document.getElementById("penBtn"),
    layerStampBtn: document.getElementById("layerStampBtn"),
    layerArrowBtn: document.getElementById("layerArrowBtn"),
    layerPenBtn: document.getElementById("layerPenBtn"),
    eraserBtn: document.getElementById("eraserBtn"),
    shareBtn: document.getElementById("shareBtn"),
    themeSeg: document.getElementById("themeSeg"),
    themeCycleBtn: document.getElementById("themeCycleBtn"),
    themeCycleLabel: document.getElementById("themeCycleLabel"),
    shareImport: document.getElementById("shareImport"),
    shareSummary: document.getElementById("shareSummary"),
    shareMergeBtn: document.getElementById("shareMergeBtn"),
    shareReplaceBtn: document.getElementById("shareReplaceBtn"),
    shareCancelBtn: document.getElementById("shareCancelBtn"),
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
    // which kinds of mark are visible; a hidden layer isn't rendered (so it also
    // can't be tapped or erased). Purely a view preference — nothing is deleted.
    layers: { stamp: true, arrow: true, pen: true },
  };
  // which layer a mark belongs to
  // Marker sizes are stored in IMAGE pixels, but maps come in different resolutions
  // (1080-wide and 2160-wide blueprints both display at the same on-screen size, since
  // layoutFloors fits by height). So state.stampSize is kept as a 1080-baseline value and
  // scaled by the map's own width at the point of use — otherwise the same setting would
  // render half as large on a 2160-wide map. Saved marks keep their absolute sizes.
  const BASE_MAP_W = 1080;
  function sizeScale(floor) {
    const w = floor && floor.map && floor.map.width;
    return w ? w / BASE_MAP_W : 1;
  }
  function layerOf(m) { return (m.type === "arrow" || m.type === "pen") ? m.type : "stamp"; }
  function layerVisible(m) { return state.layers[layerOf(m)] !== false; }

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
  // A mark is one of:
  //   stamp: { id, type:"x"|"w", x, y, size, color }
  //   arrow: { id, type:"arrow", x1,y1,x2,y2, size, color }
  //   pen:   { id, type:"pen", pts:[[x,y],…], size, color }
  function validMarker(m) {
    if (!m || typeof m.id !== "string" || typeof m.color !== "string" ||
        typeof m.size !== "number") return false;
    if (m.type === "arrow") {
      return [m.x1, m.y1, m.x2, m.y2].every((n) => typeof n === "number");
    }
    if (m.type === "pen") {
      return Array.isArray(m.pts) && m.pts.length > 1 &&
        m.pts.every((p) => Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number");
    }
    return typeof m.x === "number" && typeof m.y === "number";
  }
  function isStamp(m) { return m.type !== "arrow" && m.type !== "pen"; }

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

  function addMarker(floor, x, y, type) {
    pushUndo(floor);
    const m = { id: uid(), x, y, size: state.stampSize * sizeScale(floor), color: state.color, type: type || state.stampType };
    floor.markers.push(m);
    justPlacedId = m.id;
    clearSelection();            // a fresh stamp is NOT selected — tap it again to select
    saveFloor(floor);
    renderFloor(floor);
    updateSizeGroup();
    buzz(15);
    spawnPulse(floor, x, y, state.color);
    // clear the flag so later re-renders don't replay the animation
    clearTimeout(placingTimer);
    placingTimer = setTimeout(() => { justPlacedId = null; }, 260);
    return m.id;
  }

  // Expanding ring at the stamp point. It's a throwaway node — removed when the
  // animation ends so it can never accumulate in the overlay.
  function spawnPulse(floor, x, y, color) {
    if (reducedMotion()) return;
    const c = document.createElementNS(SVGNS, "circle");
    c.setAttribute("class", "stamp-pulse");
    c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", 4);
    c.setAttribute("stroke", color);
    const kill = () => c.remove();
    c.addEventListener("animationend", kill);
    setTimeout(kill, 900);           // belt-and-braces if the event never fires
    floor.svg.appendChild(c);
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
    for (const m of floor.markers) {
      if (!layerVisible(m)) continue;      // hidden layer — skip rendering entirely
      svg.appendChild(buildMarker(m, m.id === selId));
    }
    updateFloorCount(floor);
    updateButtons();
  }

  // Re-render ONE marker in place. Used during drag/resize so a gesture does O(1) DOM work
  // instead of rebuilding every marker on the floor each frame.
  function renderMarkerNode(floor, m) {
    const old = floor.svg.querySelector('[data-id="' + m.id + '"]');
    if (!layerVisible(m)) { if (old) old.remove(); return; }
    const selId = (indexOf(floor) === state.selectedIndex) ? state.selectedId : null;
    const next = buildMarker(m, m.id === selId);
    if (old) floor.svg.replaceChild(next, old);
    else floor.svg.appendChild(next);
  }

  // Counts track cleared rooms (X/W stamps); arrows and pen strokes are annotations.
  function stampCount(markers) { return markers.filter(isStamp).length; }

  function updateFloorCount(floor) {
    if (!floor.countEl) return;
    const n = stampCount(floor.markers);
    const prev = floor.countEl.textContent;
    floor.countEl.textContent = n ? " · " + n : "";
    if (prev !== floor.countEl.textContent && n) bumpCount(floor.countEl);
  }
  // little scale bump when the number changes
  function bumpCount(node) {
    node.classList.remove("bump");
    void node.offsetWidth;
    node.classList.add("bump");
  }

  const W_SCALE = 0.82;  // render W a bit smaller so the X reads a little bigger

  function buildMarker(m, selected) {
    const g = document.createElementNS(SVGNS, "g");
    // `.placing` plays the entrance animation once, for a mark that was just created
    const placing = m.id === justPlacedId;
    const kind = (m.type === "arrow" || m.type === "pen") ? m.type : "stamp";
    g.setAttribute("class", "mark mark-" + kind +
      (selected ? " selected" : "") + (placing ? " placing" : ""));
    g.dataset.id = m.id;

    if (m.type === "arrow") { buildArrow(g, m, selected); return g; }
    if (m.type === "pen") { buildPen(g, m, selected); return g; }

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

  // ---- route arrow: shaft + head, with a dark halo and a fat invisible hit line ----
  function strokeWidthOf(m) { return Math.max(4, m.size * 0.16); }

  function buildArrow(g, m, selected) {
    const sw = strokeWidthOf(m);
    const dx = m.x2 - m.x1, dy = m.y2 - m.y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const head = Math.max(sw * 3, 18);
    // stop the shaft short so it doesn't poke through the head
    const sx = m.x2 - ux * head * 0.85, sy = m.y2 - uy * head * 0.85;
    const px = -uy, py = ux;                     // perpendicular
    const headPts = [
      [m.x2, m.y2],
      [m.x2 - ux * head + px * head * 0.5, m.y2 - uy * head + py * head * 0.5],
      [m.x2 - ux * head - px * head * 0.5, m.y2 - uy * head - py * head * 0.5],
    ].map((p) => p[0] + "," + p[1]).join(" ");

    const draw = (color, width, halo) => {
      const grp = document.createElementNS(SVGNS, "g");
      const shaft = makeLine(m.x1, m.y1, sx, sy);
      shaft.setAttribute("stroke", color);
      shaft.setAttribute("stroke-width", width);
      shaft.setAttribute("stroke-linecap", "round");
      shaft.setAttribute("fill", "none");
      if (!halo) shaft.setAttribute("class", "arrow-shaft");
      const hd = document.createElementNS(SVGNS, "polygon");
      hd.setAttribute("points", headPts);
      hd.setAttribute("fill", color);
      if (halo) { hd.setAttribute("stroke", color); hd.setAttribute("stroke-width", 6); hd.setAttribute("stroke-linejoin", "round"); }
      grp.append(shaft, hd);
      return grp;
    };
    g.appendChild(draw("rgba(0,0,0,0.38)", sw + 6, true));
    g.appendChild(draw(m.color, sw, false));
    g.appendChild(hitLine([[m.x1, m.y1], [m.x2, m.y2]], sw));
    if (selected) g.appendChild(selBox(bboxOf(m), m));
  }

  // ---- freehand pen: smoothed polyline ----
  function buildPen(g, m, selected) {
    const sw = strokeWidthOf(m);
    const d = penPathData(m.pts);
    const draw = (color, width, cls) => {
      const p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", d);
      p.setAttribute("stroke", color);
      p.setAttribute("stroke-width", width);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      if (cls) p.setAttribute("class", cls);
      return p;
    };
    g.appendChild(draw("rgba(0,0,0,0.38)", sw + 6));
    g.appendChild(draw(m.color, sw, "pen-stroke"));
    g.appendChild(hitLine(m.pts, sw));
    if (selected) g.appendChild(selBox(bboxOf(m), m));
  }

  // Quadratic smoothing through midpoints — turns jittery samples into a clean stroke.
  function penPathData(pts) {
    if (pts.length < 2) return "";
    let d = "M " + pts[0][0] + " " + pts[0][1];
    if (pts.length === 2) return d + " L " + pts[1][0] + " " + pts[1][1];
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += " Q " + pts[i][0] + " " + pts[i][1] + " " + mx + " " + my;
    }
    const last = pts[pts.length - 1];
    return d + " L " + last[0] + " " + last[1];
  }

  // A transparent fat stroke so thin lines are still easy to tap.
  function hitLine(pts, sw) {
    const p = document.createElementNS(SVGNS, "path");
    p.setAttribute("d", penPathData(pts));
    p.setAttribute("stroke", "transparent");
    p.setAttribute("stroke-width", Math.max(sw + 26, 34));
    p.setAttribute("fill", "none");
    p.setAttribute("stroke-linecap", "round");
    return p;
  }

  function bboxOf(m) {
    const pts = m.type === "arrow" ? [[m.x1, m.y1], [m.x2, m.y2]] : m.pts;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    const pad = strokeWidthOf(m) + 8;
    return { x: x0 - pad, y: y0 - pad, w: (x1 - x0) + pad * 2, h: (y1 - y0) + pad * 2 };
  }
  function selBox(b) {
    const r = document.createElementNS(SVGNS, "rect");
    r.setAttribute("class", "sel-box");
    r.setAttribute("x", b.x); r.setAttribute("y", b.y);
    r.setAttribute("width", b.w); r.setAttribute("height", b.h);
    return r;
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

    // Arrow / Pen: a drag draws on the map instead of scrolling it.
    if (state.tool === "arrow" || state.tool === "pen") {
      e.preventDefault();
      el.scroller.setPointerCapture && el.scroller.setPointerCapture(e.pointerId);
      const start = toImage(floor, e.clientX, e.clientY);
      press = {
        kind: "draw", floor, tool: state.tool,
        rect: floor.img.getBoundingClientRect(),
        start, pts: [[start.x, start.y]],
        lastX: e.clientX, lastY: e.clientY,
        downTime: performance.now(), drew: false,
      };
      return;
    }

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
        startImg: toImage(floor, e.clientX, e.clientY), startGeom: cloneGeom(m),
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
      const startImg = toImage(floor, e.clientX, e.clientY);
      press = {
        kind: "empty", floor, startImg,
        downX: e.clientX, downY: e.clientY, downTime: performance.now(), moved: false,
      };
      if (state.tool === "stamp" && inBounds(floor, startImg)) {
        clearLongPress();
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          if (!press || press.moved) return;
          press.longPressed = true;
          addMarker(floor, press.startImg.x, press.startImg.y, "x");
          lastTap = null;
        }, LONG_TAP_STAMP_MS);
      }
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

  // Snapshot a mark's geometry so a drag can translate from the original each frame.
  function cloneGeom(m) {
    if (m.type === "arrow") return { x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2 };
    if (m.type === "pen") return { pts: m.pts.map((p) => [p[0], p[1]]) };
    return { x: m.x, y: m.y };
  }
  // Move a mark of any type by (dx, dy), clamped so it stays on the map.
  function translateMark(m, geom, dx, dy, floor) {
    const W = floor.map.width, H = floor.map.height;
    if (m.type === "arrow") {
      const lo = Math.min(geom.x1, geom.x2), hi = Math.max(geom.x1, geom.x2);
      const lo2 = Math.min(geom.y1, geom.y2), hi2 = Math.max(geom.y1, geom.y2);
      dx = clamp(dx, -lo, W - hi); dy = clamp(dy, -lo2, H - hi2);
      m.x1 = geom.x1 + dx; m.y1 = geom.y1 + dy;
      m.x2 = geom.x2 + dx; m.y2 = geom.y2 + dy;
      return;
    }
    if (m.type === "pen") {
      let lo = Infinity, hi = -Infinity, lo2 = Infinity, hi2 = -Infinity;
      for (const [x, y] of geom.pts) {
        lo = Math.min(lo, x); hi = Math.max(hi, x);
        lo2 = Math.min(lo2, y); hi2 = Math.max(hi2, y);
      }
      dx = clamp(dx, -lo, W - hi); dy = clamp(dy, -lo2, H - hi2);
      m.pts = geom.pts.map((p) => [p[0] + dx, p[1] + dy]);
      return;
    }
    m.x = clamp(geom.x + dx, 0, W);
    m.y = clamp(geom.y + dy, 0, H);
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
    if (!p) return;

    // Freehand / arrow drawing in progress
    if (p.kind === "draw") { drawFrame(p); return; }
    if (p.kind !== "resize" && p.kind !== "move") return;

    const m = markerById(p.floor, p.id);
    if (!m) return;
    // one measurement per frame, reused for this frame's math
    if (!p.rect) p.rect = p.floor.img.getBoundingClientRect();
    const img = toImageRect(p.floor, p.rect, p.lastX, p.lastY);

    if (p.kind === "resize") {
      m.size = clamp(Math.max(Math.abs(img.x - m.x), Math.abs(img.y - m.y)) * 2, 16, 8000);
      el.sizeRange.value = Math.round(Math.min(220, m.size));
    } else {
      translateMark(m, p.startGeom, img.x - p.startImg.x, img.y - p.startImg.y, p.floor);
    }
    renderMarkerNode(p.floor, m);   // O(1) instead of rebuilding every marker
  }

  // Live preview while drawing an arrow or a pen stroke.
  const PEN_MIN_STEP = 6;   // image px between recorded points (keeps strokes small + smooth)

  function drawFrame(p) {
    const img = toImageRect(p.floor, p.rect, p.lastX, p.lastY);
    const x = clamp(img.x, 0, p.floor.map.width);
    const y = clamp(img.y, 0, p.floor.map.height);

    if (p.tool === "arrow") {
      p.end = { x, y };
      if (Math.hypot(x - p.start.x, y - p.start.y) > 6) p.drew = true;
    } else {
      const last = p.pts[p.pts.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) >= PEN_MIN_STEP) {
        p.pts.push([x, y]);
        p.drew = true;
      }
    }
    renderDraftMark(p);
  }

  // The in-progress shape is rendered as a normal mark node with a temp id, so it
  // looks exactly like the finished result while you draw.
  function draftMark(p) {
    const base = { id: "__draft", size: state.stampSize * sizeScale(p.floor), color: state.color };
    if (p.tool === "arrow") {
      const e2 = p.end || p.start;
      return Object.assign(base, { type: "arrow", x1: p.start.x, y1: p.start.y, x2: e2.x, y2: e2.y });
    }
    return Object.assign(base, { type: "pen", pts: p.pts });
  }
  function renderDraftMark(p) {
    if (!p.drew) return;
    const node = buildMarker(draftMark(p), false);
    node.classList.add("draft");
    const old = p.floor.svg.querySelector('[data-id="__draft"]');
    if (old) p.floor.svg.replaceChild(node, old);
    else p.floor.svg.appendChild(node);
  }
  function clearDraft(floor) {
    const old = floor.svg.querySelector('[data-id="__draft"]');
    if (old) old.remove();
  }

  // Commit the drawn shape into the floor's marks (undoable, persisted).
  function commitDraw(p) {
    clearDraft(p.floor);
    if (!p.drew) return;
    const m = draftMark(p);
    m.id = uid();
    if (m.type === "pen") m.pts = m.pts.map((pt) => [Math.round(pt[0]), Math.round(pt[1])]);
    pushUndo(p.floor);
    p.floor.markers.push(m);
    justPlacedId = m.id;
    saveFloor(p.floor);
    renderFloor(p.floor);
    buzz(12);
    clearTimeout(placingTimer);
    placingTimer = setTimeout(() => { justPlacedId = null; }, 700);
  }

  function onPointerMove(e) {
    if (!press) return;
    if (press.kind === "draw") {
      e.preventDefault();
      press.lastX = e.clientX; press.lastY = e.clientY;
      scheduleGestureFrame();
      return;
    }
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
    if (press.kind === "draw" || press.kind === "resize" || press.kind === "move") {
      el.scroller.releasePointerCapture && el.scroller.releasePointerCapture(e.pointerId);
      flushGesture();   // apply any frame still pending so the final position is exact
    }
    const p = press;
    press = null;

    if (p.kind === "draw") { commitDraw(p); return; }
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
        stampedId = addMarker(p.floor, p.startImg.x, p.startImg.y, "w");
      } else {
        deselect();
      }
    }
    lastTap = { time: now, x: p.downX, y: p.downY, floorIdx: indexOf(p.floor), stampedId };
  }

  function onPointerCancel() {
    clearLongPress();
    if (press && (press.kind === "draw" || press.kind === "resize" || press.kind === "move")) flushGesture();
    if (press && press.kind === "draw") commitDraw(press);
    else if (press && press.kind === "resize") commitResize(press);
    else if (press && press.kind === "move" && press.moved) commitDrag(press);
    press = null;
  }

  function commitResize(p) {
    const m = markerById(p.floor, p.id);
    if (p.changed) {
      if (m) state.stampSize = m.size / sizeScale(p.floor);
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
    ensureLayerVisible("stamp");
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
      localStorage.setItem(STORAGE_PREFIX + "layers", JSON.stringify(state.layers));
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
      const L = JSON.parse(localStorage.getItem(STORAGE_PREFIX + "layers") || "null");
      if (L && typeof L === "object") {
        for (const k of ["stamp", "arrow", "pen"]) {
          if (typeof L[k] === "boolean") state.layers[k] = L[k];
        }
      }
    } catch (e) {}
  }

  const HINTS = {
    stamp: "Tap for W · hold for X · scroll for floors · double-tap to zoom.",
    arrow: "Drag to draw a route arrow. (Scrolling is off while Arrow is on.)",
    pen: "Drag to draw freehand. (Scrolling is off while Pen is on.)",
    eraser: "Eraser: tap a mark to remove it.",
  };

  // =========================================================================
  // Themes — each one solves a lighting condition, not just a colour scheme.
  //   tactical : default dark briefing look
  //   night    : near-black for a dark room; also dims the bright blueprint
  //   day      : light UI for a bright room; blueprint at full punch
  // =========================================================================
  const THEMES = ["tactical", "night", "day"];
  const THEME_LABEL = { tactical: "Tactical", night: "Night", day: "Day" };
  // colour the PWA/browser chrome to match
  const THEME_META = { tactical: "#0d1219", night: "#050607", day: "#ffffff" };

  function currentTheme() {
    const t = document.documentElement.getAttribute("data-theme");
    return THEMES.includes(t) ? t : "tactical";
  }

  function setTheme(name) {
    const theme = THEMES.includes(name) ? name : "tactical";
    // "tactical" is the bare :root, so no attribute needed
    if (theme === "tactical") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_META[theme]);

    updateThemeButtons();
    try { localStorage.setItem(STORAGE_PREFIX + "theme", theme); } catch (e) {}
  }

  function cycleTheme() {
    const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
    setTheme(next);
    toast(THEME_LABEL[next] + " theme");
  }

  function updateThemeButtons() {
    const t = currentTheme();
    if (el.themeSeg) {
      for (const b of el.themeSeg.children) {
        b.classList.toggle("active", b.dataset.themeVal === t);
      }
    }
    if (el.themeCycleLabel) el.themeCycleLabel.textContent = THEME_LABEL[t];
  }

  // Show/hide a whole class of marks. Nothing is deleted — they're just not drawn.
  function toggleLayer(layer) { setLayer(layer, !state.layers[layer]); }

  function setLayer(layer, on) {
    if (state.layers[layer] === on) return;
    state.layers[layer] = on;
    // don't leave a now-invisible mark selected
    const sel = selectedMarker();
    if (!on && sel && layerOf(sel) === layer) clearSelection();
    updateLayerButtons();
    updateSizeGroup();
    for (const f of state.floors) renderFloor(f);
    savePrefs();
  }

  // Using a tool implies wanting to see what it draws.
  function ensureLayerVisible(layer) { setLayer(layer, true); }

  function updateLayerButtons() {
    const set = (btn, on) => {
      btn.classList.toggle("off", !on);
      btn.setAttribute("aria-pressed", String(on));
    };
    set(el.layerStampBtn, state.layers.stamp !== false);
    set(el.layerArrowBtn, state.layers.arrow !== false);
    set(el.layerPenBtn, state.layers.pen !== false);
  }

  function setTool(tool) {
    state.tool = tool;
    if (tool === "arrow" || tool === "pen") ensureLayerVisible(tool);
    if (tool !== "stamp") deselect();
    // While a draw tool is active, a one-finger drag must draw, not scroll the floors.
    el.scroller.classList.toggle("drawing", tool === "arrow" || tool === "pen");
    updateToolButtons();
    updateSizeGroup();
    el.hint.textContent = HINTS[tool] || HINTS.stamp;
  }

  // Highlight the active tool: X/W while stamping, else Arrow, Pen, or Eraser.
  function updateToolButtons() {
    const stamping = state.tool === "stamp";
    const set = (btn, on) => {
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", String(on));
    };
    set(el.stampXBtn, stamping && state.stampType === "x");
    set(el.stampWBtn, stamping && state.stampType === "w");
    set(el.arrowBtn, state.tool === "arrow");
    set(el.penBtn, state.tool === "pen");
    set(el.eraserBtn, state.tool === "eraser");
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
      el.sizeRange.value = Math.round(clamp(m.size / sizeScale(selectedFloor()), 16, 220));
    } else if (state.tool === "arrow" || state.tool === "pen") {
      // no selection, but the slider sets the thickness of what you're about to draw
      el.sizeGroup.hidden = false;
      el.sizeRange.value = Math.round(clamp(state.stampSize, 16, 220));
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
      m.size = val * sizeScale(f);
      renderFloor(f);
    } else {
      state.stampSize = val;
      savePrefs();
    }
  }
  function onSizeCommit() {
    if (onSizeInput._dragging) {
      const m = selectedMarker();
      if (m) { state.stampSize = m.size / sizeScale(selectedFloor()); saveFloor(selectedFloor()); savePrefs(); }
      onSizeInput._dragging = false;
      updateButtons();
    }
  }

  // =========================================================================
  // Hub (mission picker) + navigation
  // =========================================================================
  const hubCards = []; // [{ card, mission, available, metaEl }]

  // S rank: a personal "I cleared this perfectly" flag per mission, separate from the
  // tactical X/W/arrow/pen marks. Stored locally only — deliberately NOT included in
  // shareCurrentMission's payload, since it's your own record, not squad tactical markup.
  function srankKey(mission) { return STORAGE_PREFIX + "srank:" + mission.id; }
  function getSRank(mission) {
    try {
      const raw = localStorage.getItem(srankKey(mission));
      if (!raw) return null;
      const data = JSON.parse(raw);
      return (data && typeof data.at === "number") ? data : null;
    } catch (e) { return null; }
  }
  function setSRank(mission, on) {
    try {
      if (on) localStorage.setItem(srankKey(mission), JSON.stringify({ at: Date.now() }));
      else localStorage.removeItem(srankKey(mission));
    } catch (e) {}
  }
  function formatSRankDate(at) {
    try { return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
    catch (e) { return ""; }
  }

  function buildHub() {
    el.missionGrid.innerHTML = "";
    hubCards.length = 0;
    for (const mission of MISSIONS) {
      const available = mission.maps.length > 0;
      // A real <button> can't legally contain the nested S-rank <button>, so available
      // cards are a div acting as a button (role + tabindex + click/keydown), matching
      // native button semantics for click and keyboard (Enter/Space) activation.
      const card = document.createElement(available ? "div" : "button");
      card.className = "mission-card " + (available ? "available" : "locked");
      if (available) {
        card.setAttribute("role", "button");
        card.tabIndex = 0;
      } else {
        card.type = "button";
        card.disabled = true;
      }

      const num = document.createElement("div");
      num.className = "m-num";
      num.textContent = "Mission " + mission.number;

      const name = document.createElement("div");
      name.className = "m-name";
      name.textContent = available ? mission.name : (mission.name || "Coming soon");

      const meta = document.createElement("div");
      meta.className = "m-meta";

      // stats row: count chip + one dot per floor
      const stats = document.createElement("div");
      stats.className = "m-stats";
      const chip = document.createElement("span");
      chip.className = "m-chip";
      const dots = document.createElement("span");
      dots.className = "m-dots";
      stats.append(chip, dots);

      card.append(num, name, meta);
      let srankBtn = null;
      if (available) {
        // blueprint thumbnail behind the card
        const thumb = document.createElement("div");
        thumb.className = "m-thumb";
        thumb.style.backgroundImage = "url('" + mission.maps[0].src + "')";
        card.appendChild(thumb);
        card.appendChild(stats);

        srankBtn = document.createElement("button");
        srankBtn.type = "button";
        srankBtn.className = "srank-btn";
        srankBtn.setAttribute("aria-label", "Toggle S rank for " + mission.name);
        srankBtn.addEventListener("click", (e) => {
          e.stopPropagation();   // never let this open the mission
          const hc = hubCards.find((h) => h.mission === mission);
          const ranked = !getSRank(mission);
          setSRank(mission, ranked);
          buzz(ranked ? [12, 40, 12] : 10);
          if (hc) applySRankUI(hc);
        });
        card.appendChild(srankBtn);

        card.addEventListener("click", () => openMission(mission));
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMission(mission); }
        });
      }
      el.missionGrid.appendChild(card);
      hubCards.push({ card, mission, available, metaEl: meta, chipEl: chip, dotsEl: dots, srankBtn });
    }
    refreshHubCounts();
  }

  function applySRankUI(hc) {
    if (!hc.srankBtn) return;
    const rank = getSRank(hc.mission);
    hc.card.classList.toggle("s-ranked", !!rank);
    hc.srankBtn.classList.toggle("ranked", !!rank);
    hc.srankBtn.textContent = rank ? "★" : "☆";
    hc.srankBtn.title = rank
      ? "S Ranked · " + formatSRankDate(rank.at) + " — tap to unmark"
      : "Mark S Rank";
  }

  // Per-mission marked totals (summed from storage): meta line, count chip, floor dots,
  // and S-rank status — all re-derived from storage each time so nothing can drift.
  function refreshHubCounts() {
    for (const hc of hubCards) {
      // locked cards already read "Coming soon" (or their name) + a lock glyph —
      // don't repeat it in the meta line
      if (!hc.available) { hc.metaEl.textContent = ""; continue; }
      const n = hc.mission.maps.length;
      const perFloor = hc.mission.maps.map((map) => stampCount(loadMarkers(map.id)));
      const marked = perFloor.reduce((a, b) => a + b, 0);

      hc.metaEl.textContent = n + (n === 1 ? " map" : " maps");
      hc.chipEl.textContent = marked ? marked + " marked" : "clear";
      hc.chipEl.classList.toggle("empty", !marked);

      // one dot per floor, filled when that floor has marks
      hc.dotsEl.innerHTML = "";
      for (const c of perFloor) {
        const d = document.createElement("span");
        d.className = "m-dot" + (c ? " on" : "");
        d.title = c + " mark" + (c === 1 ? "" : "s");
        hc.dotsEl.appendChild(d);
      }

      applySRankUI(hc);
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

  // Fade the splash out shortly after first paint (instantly if reduced motion).
  function dismissSplash() {
    if (!el.splash) return;
    const hide = () => {
      el.splash.classList.add("gone");
      setTimeout(() => { el.splash.hidden = true; }, 500);
    };
    if (reducedMotion()) { el.splash.hidden = true; return; }
    setTimeout(hide, 900);
  }

  // Restart a CSS entrance animation on an element that was just shown.
  function playEnter(node) {
    if (reducedMotion()) return;
    node.classList.remove("entering");
    void node.offsetWidth;          // reflow so the animation re-runs
    node.classList.add("entering");
  }

  // ---- Collapsible rail ----
  function isRailCollapsed() {
    try { return localStorage.getItem(STORAGE_PREFIX + "rail") !== "0"; } catch (e) { return true; }
  }
  function applyRailState(collapsed) {
    el.toolbar.classList.toggle("collapsed", collapsed);
    el.stage.classList.toggle("rail-collapsed", collapsed);
    el.railToggle.textContent = collapsed ? "›" : "‹";
    el.railToggle.title = collapsed ? "Expand toolbar" : "Collapse toolbar";
  }
  function toggleRail() {
    const collapsed = !el.toolbar.classList.contains("collapsed");
    applyRailState(collapsed);
    try { localStorage.setItem(STORAGE_PREFIX + "rail", collapsed ? "1" : "0"); } catch (e) {}
    if (state.mission) { layoutFloors(); pinRail(); }
  }

  function showHub() {
    teardownFloors();
    state.mission = null;
    el.stage.hidden = true;
    el.toolbar.hidden = true;
    el.hub.hidden = false;
    refreshHubCounts();  // reflect edits made inside the mission we just left
    playEnter(el.hub);
  }

  function openMission(mission) {
    if (!mission.maps.length) return;
    state.mission = mission;
    el.missionTitle.textContent = mission.name;
    el.hub.hidden = true;
    el.toolbar.hidden = false;
    el.stage.hidden = false;      // must be visible before we measure/observe
    applyRailState(isRailCollapsed());
    playEnter(el.stage);
    playEnter(el.toolbar);
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

    // Recentre INSTANTLY, in the same frame as the layout change. A smooth scroll here
    // would run on its own timeline and desync from the transform animation, which is
    // what made the zoom feel wobbly — now the single GPU transform carries all the
    // visible motion and the scroll is already where it needs to be.
    centerOn(floor, imgX, imgY);
    if (!floor.zoomed && !state.floors.some((f) => f.zoomed)) {
      el.scroller.classList.remove("zoomed");
    }

    const ratio = prevW / nextW;
    if (!reducedMotion() && isFinite(ratio) && ratio > 0 && Math.abs(ratio - 1) > 0.01) {
      // zoom toward the tapped point
      floor.wrap.style.transformOrigin =
        (imgX / floor.map.width * 100) + "% " + (imgY / floor.map.height * 100) + "%";
      floor.wrap.style.transform = "scale(" + ratio + ")";
      floor.wrap.style.willChange = "transform";   // promote for the animation only
      requestAnimationFrame(() => {
        floor.wrap.style.transition = "transform .26s cubic-bezier(.22,.61,.36,1)";
        floor.wrap.style.transform = "scale(1)";
      });
      clearTimeout(floor.zoomTimer);
      floor.zoomTimer = setTimeout(() => {
        floor.wrap.style.transition = "";
        floor.wrap.style.transform = "";
        floor.wrap.style.willChange = "";          // release the layer again
      }, 320);
    } else {
      floor.wrap.style.transform = "";
    }
  }
  function centerOn(floor, imgX, imgY) {
    const rect = floor.img.getBoundingClientRect();
    const sc = el.scroller.getBoundingClientRect();
    const targetX = rect.left + (imgX / floor.map.width) * rect.width;
    const targetY = rect.top + (imgY / floor.map.height) * rect.height;
    const left = el.scroller.scrollLeft + (targetX - sc.left) - sc.width / 2;
    const top = el.scroller.scrollTop + (targetY - sc.top) - sc.height / 2;
    el.scroller.scrollTo({ left, top, behavior: "auto" });
  }

  // Keep the left rail glued to the VISUAL viewport so it stays on screen (and a
  // constant size) while the page is pinch-zoomed — otherwise a fixed element gets
  // left behind in the layout viewport and scrolls out of view when you zoom in.
  // visualViewport fires a burst of events during a pinch. Writing style.transform on
  // each one thrashes style recalc on the main thread and the rail visibly swims, so
  // coalesce into a single write per frame and skip no-op writes.
  let pinRaf = 0, lastPin = "";

  function pinRail() {
    if (pinRaf) return;
    pinRaf = requestAnimationFrame(applyPin);
  }
  function applyPin() {
    pinRaf = 0;
    const vv = window.visualViewport;
    if (!vv) return;
    // round to whole pixels: sub-pixel values cause shimmer on the rail's text
    const x = Math.round(vv.offsetLeft), y = Math.round(vv.offsetTop);
    const s = (1 / vv.scale).toFixed(4);
    const next = "translate3d(" + x + "px," + y + "px,0) scale(" + s + ")";
    if (next === lastPin) return;          // nothing moved — don't touch the DOM
    lastPin = next;
    el.toolbar.style.transform = next;
  }
  function setupViewportPin() {
    const vv = window.visualViewport;
    if (!vv) return;
    vv.addEventListener("resize", pinRail, { passive: true });
    vv.addEventListener("scroll", pinRail, { passive: true });
    applyPin();
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
      img.decoding = "async";   // decode off the main thread so loads don't hitch

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
        // one-shot "coming online" sweep across the freshly loaded floor
        if (!reducedMotion()) {
          wrap.classList.add("sweep");
          setTimeout(() => wrap.classList.remove("sweep"), 900);
        }
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
  // Share a marked-up mission as a link (state lives in the URL hash — no server)
  // =========================================================================
  function b64urlEncode(bytes) {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlDecode(str) {
    const s = str.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function deflate(bytes) {
    if (typeof CompressionStream === "undefined") return null;
    const cs = new CompressionStream("deflate-raw");
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
    return new Uint8Array(buf);
  }
  async function inflate(bytes) {
    if (typeof DecompressionStream === "undefined") return null;
    const ds = new DecompressionStream("deflate-raw");
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(buf);
  }

  // Round coordinates before sharing — full float precision just bloats the link.
  function compactMark(m) {
    const r = (n) => Math.round(n);
    const o = { i: m.id.slice(-6), t: m.type || "x", c: m.color, s: r(m.size) };
    if (m.type === "arrow") { o.a = [r(m.x1), r(m.y1), r(m.x2), r(m.y2)]; }
    else if (m.type === "pen") { o.p = m.pts.map((p) => [r(p[0]), r(p[1])]); }
    else { o.x = r(m.x); o.y = r(m.y); }
    return o;
  }
  function expandMark(o) {
    const m = { id: uid(), type: o.t || "x", color: o.c || "#e02424", size: Number(o.s) || 64 };
    if (m.type === "arrow" && Array.isArray(o.a)) {
      m.x1 = o.a[0]; m.y1 = o.a[1]; m.x2 = o.a[2]; m.y2 = o.a[3];
    } else if (m.type === "pen" && Array.isArray(o.p)) {
      m.pts = o.p.map((p) => [p[0], p[1]]);
    } else {
      m.x = o.x; m.y = o.y;
    }
    return validMarker(m) ? m : null;
  }

  async function buildShareLink() {
    if (!state.mission) return null;
    const payload = { v: 1, m: state.mission.number, f: {} };
    let total = 0;
    for (const f of state.floors) {
      if (!f.markers.length) continue;
      payload.f[f.map.id] = f.markers.map(compactMark);
      total += f.markers.length;
    }
    if (!total) return null;
    const json = new TextEncoder().encode(JSON.stringify(payload));
    const packed = await deflate(json);
    const data = packed ? "z" + b64urlEncode(packed) : "j" + b64urlEncode(json);
    const base = location.href.split("#")[0];
    return { url: base + "#s=" + data, total };
  }

  async function shareCurrentMission() {
    const made = await buildShareLink().catch(() => null);
    if (!made) { toast("Nothing to share yet — add some marks first."); return; }
    if (made.url.length > 30000) { toast("Too many marks to fit in a link."); return; }
    const title = state.mission.name + " — RoN Maps";
    try {
      if (navigator.share) { await navigator.share({ title, url: made.url }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try {
      await navigator.clipboard.writeText(made.url);
      toast("Link copied — " + made.total + " mark" + (made.total === 1 ? "" : "s"));
    } catch (e) {
      prompt("Copy this link:", made.url);
    }
  }

  // ---- opening a shared link ----
  let pendingShare = null;

  async function decodeShare(raw) {
    const kind = raw[0], body = raw.slice(1);
    let json;
    if (kind === "z") {
      const out = await inflate(b64urlDecode(body));
      if (!out) return null;
      json = new TextDecoder().decode(out);
    } else if (kind === "j") {
      json = new TextDecoder().decode(b64urlDecode(body));
    } else return null;
    const data = JSON.parse(json);
    return (data && data.v === 1 && data.f) ? data : null;
  }

  async function checkSharedLink() {
    const match = /[#&]s=([A-Za-z0-9\-_]+)/.exec(location.hash || "");
    if (!match) return;
    let data = null;
    try { data = await decodeShare(match[1]); } catch (e) { data = null; }
    history.replaceState(null, "", location.pathname + location.search);
    if (!data) { toast("That shared link couldn't be read."); return; }

    const mission = MISSIONS.find((mi) => mi.number === data.m);
    if (!mission || !mission.maps.length) { toast("That plan is for a mission you don't have maps for."); return; }

    let count = 0;
    for (const k of Object.keys(data.f)) count += (data.f[k] || []).length;
    pendingShare = { mission, data, count };
    el.shareSummary.textContent =
      count + " mark" + (count === 1 ? "" : "s") + " for " + mission.name +
      ". Add them to your own marks, or replace what you have for this mission?";
    el.shareImport.hidden = false;
  }

  function applyShare(mode) {
    const ps = pendingShare;
    pendingShare = null;
    el.shareImport.hidden = true;
    if (!ps) return;
    let added = 0;
    for (const map of ps.mission.maps) {
      const incoming = (ps.data.f[map.id] || []).map(expandMark).filter(Boolean);
      if (mode === "replace") {
        if (!incoming.length && !(map.id in ps.data.f)) continue;
        saveMarkersFor(map.id, incoming);
        added += incoming.length;
      } else if (incoming.length) {
        saveMarkersFor(map.id, loadMarkers(map.id).concat(incoming));
        added += incoming.length;
      }
    }
    refreshHubCounts();
    openMission(ps.mission);
    toast(added + " mark" + (added === 1 ? "" : "s") + " loaded");
  }
  function saveMarkersFor(mapId, markers) {
    try { localStorage.setItem(STORAGE_PREFIX + mapId, JSON.stringify(markers)); } catch (e) {}
  }

  // =========================================================================
  // Init
  // =========================================================================
  function init() {
    buildSwatches();
    loadPrefs();
    setColor(state.color);
    el.sizeRange.value = Math.round(clamp(state.stampSize, 16, 220));
    updateLayerButtons();
    updateThemeButtons();   // the inline head script already applied the saved theme
    buildHub();
    el.appFoot.textContent = "© Avery LLC · v" + APP_VERSION;

    el.railToggle.addEventListener("click", toggleRail);
    el.backBtn.addEventListener("click", showHub);
    el.stampXBtn.addEventListener("click", () => setStampType("x"));
    el.stampWBtn.addEventListener("click", () => setStampType("w"));
    el.arrowBtn.addEventListener("click", () => setTool("arrow"));
    el.penBtn.addEventListener("click", () => setTool("pen"));
    el.eraserBtn.addEventListener("click", () => setTool("eraser"));
    el.layerStampBtn.addEventListener("click", () => toggleLayer("stamp"));
    el.layerArrowBtn.addEventListener("click", () => toggleLayer("arrow"));
    el.layerPenBtn.addEventListener("click", () => toggleLayer("pen"));
    el.shareBtn.addEventListener("click", shareCurrentMission);
    el.themeCycleBtn.addEventListener("click", cycleTheme);
    el.themeSeg.addEventListener("click", (e) => {
      const b = e.target.closest("[data-theme-val]");
      if (b) setTheme(b.dataset.themeVal);
    });
    el.shareMergeBtn.addEventListener("click", () => applyShare("merge"));
    el.shareReplaceBtn.addEventListener("click", () => applyShare("replace"));
    el.shareCancelBtn.addEventListener("click", () => { pendingShare = null; el.shareImport.hidden = true; });
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
      else if (e.key === "a") setTool("arrow");
      else if (e.key === "p") setTool("pen");
      else if (e.key === "1") toggleLayer("stamp");
      else if (e.key === "2") toggleLayer("arrow");
      else if (e.key === "3") toggleLayer("pen");
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

    dismissSplash();
    checkSharedLink();   // opened from a shared plan link?
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
