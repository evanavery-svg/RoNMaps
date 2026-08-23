/* RoN Maps — Sinuous Trail marker tool.
 * Vanilla JS. Markers are SVG objects stored in image-pixel coordinates so they
 * stay locked to the map across screen sizes, zoom, and devices. */
(function () {
  "use strict";

  const SVGNS = "http://www.w3.org/2000/svg";
  const STORAGE_PREFIX = "ronmaps:sinuous-trail:";
  const UNDO_LIMIT = 60;
  const TAP_MOVE_TOLERANCE = 8;   // px of screen movement still counted as a tap
  const TAP_TIME_LIMIT = 500;     // ms
  const PRESETS = ["#e02424", "#f5a524", "#16a34a", "#2563eb", "#111111", "#ffffff"];

  // ---- DOM ----
  const el = {
    stage: document.getElementById("stage"),
    viewport: document.getElementById("viewport"),
    canvas: document.getElementById("canvas"),
    img: document.getElementById("mapImg"),
    overlay: document.getElementById("overlay"),
    mapSelect: document.getElementById("mapSelect"),
    stampBtn: document.getElementById("stampBtn"),
    eraserBtn: document.getElementById("eraserBtn"),
    swatches: document.getElementById("swatches"),
    colorInput: document.getElementById("colorInput"),
    undoBtn: document.getElementById("undoBtn"),
    resetBtn: document.getElementById("resetBtn"),
    sizeGroup: document.getElementById("sizeGroup"),
    sizeRange: document.getElementById("sizeRange"),
    zoomReset: document.getElementById("zoomReset"),
    hint: document.getElementById("hint"),
  };

  // ---- State ----
  const state = {
    mapId: null,
    map: null,
    markers: [],
    undoStack: [],
    selectedId: null,
    tool: "stamp",        // "stamp" | "eraser"
    color: "#e02424",
    stampSize: 64,        // default new-X size, in image px
    // view transform (image px -> screen), applied via CSS transform on canvas
    view: { scale: 1, tx: 0, ty: 0, fitScale: 1 },
  };

  // =========================================================================
  // Persistence
  // =========================================================================
  function storageKey(id) { return STORAGE_PREFIX + id; }

  function loadMarkers(id) {
    try {
      const raw = localStorage.getItem(storageKey(id));
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data.filter(validMarker) : [];
    } catch (e) { return []; }
  }

  function saveMarkers() {
    try {
      localStorage.setItem(storageKey(state.mapId), JSON.stringify(state.markers));
    } catch (e) { /* storage full/blocked — non-fatal */ }
  }

  function validMarker(m) {
    return m && typeof m.x === "number" && typeof m.y === "number" &&
      typeof m.size === "number" && typeof m.color === "string" && typeof m.id === "string";
  }

  // =========================================================================
  // Undo (snapshot based)
  // =========================================================================
  function pushUndo() {
    state.undoStack.push(JSON.stringify(state.markers));
    if (state.undoStack.length > UNDO_LIMIT) state.undoStack.shift();
    updateButtons();
  }

  function undo() {
    if (!state.undoStack.length) return;
    const snap = state.undoStack.pop();
    try { state.markers = JSON.parse(snap); } catch (e) { state.markers = []; }
    if (!state.markers.some((m) => m.id === state.selectedId)) state.selectedId = null;
    saveMarkers();
    render();
    updateButtons();
    updateSizeGroup();
  }

  // =========================================================================
  // Markers
  // =========================================================================
  function uid() { return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function addMarker(x, y) {
    pushUndo();
    const m = { id: uid(), x, y, size: state.stampSize, color: state.color };
    state.markers.push(m);
    state.selectedId = m.id;
    saveMarkers();
    render();
    updateSizeGroup();
  }

  function deleteMarker(id) {
    const i = state.markers.findIndex((m) => m.id === id);
    if (i < 0) return;
    pushUndo();
    state.markers.splice(i, 1);
    if (state.selectedId === id) state.selectedId = null;
    saveMarkers();
    render();
    updateSizeGroup();
  }

  function selectMarker(id) {
    state.selectedId = id;
    render();
    updateSizeGroup();
  }

  function reset() {
    if (!state.markers.length) return;
    if (!confirm("Clear all marks on this map?")) return;
    pushUndo();
    state.markers = [];
    state.selectedId = null;
    saveMarkers();
    render();
    updateSizeGroup();
  }

  // =========================================================================
  // Rendering
  // =========================================================================
  function render() {
    const svg = el.overlay;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    for (const m of state.markers) {
      svg.appendChild(buildX(m, m.id === state.selectedId));
    }
    updateButtons();
  }

  function buildX(m, selected) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "mark" + (selected ? " selected" : ""));
    g.dataset.id = m.id;

    const h = m.size / 2;
    const sw = Math.max(4, m.size * 0.16); // stroke scales with size
    const stroke = m.color;

    // subtle backing so a light-colored X reads on a light blueprint
    const halo = lineGroup(m, h, sw + 6, "rgba(0,0,0,0.35)");
    g.appendChild(halo);
    g.appendChild(lineGroup(m, h, sw, stroke));

    if (selected) {
      const box = document.createElementNS(SVGNS, "rect");
      box.setAttribute("class", "sel-box");
      box.setAttribute("x", m.x - h); box.setAttribute("y", m.y - h);
      box.setAttribute("width", m.size); box.setAttribute("height", m.size);
      g.appendChild(box);

      const handle = document.createElementNS(SVGNS, "circle");
      handle.setAttribute("class", "sel-handle");
      handle.setAttribute("cx", m.x + h); handle.setAttribute("cy", m.y + h);
      handle.setAttribute("r", Math.max(12, sw));
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

  // =========================================================================
  // View transform (zoom / pan)
  // =========================================================================
  function applyView() {
    const v = state.view;
    el.canvas.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.scale})`;
    el.zoomReset.hidden = Math.abs(v.scale - v.fitScale) < 0.01 &&
      Math.abs(v.tx - v.fitTx) < 1 && Math.abs(v.ty - v.fitTy) < 1;
  }

  function fitView() {
    const map = state.map;
    if (!map) return;
    const vw = el.viewport.clientWidth;
    const vh = el.viewport.clientHeight;
    const iw = map.width, ih = map.height;
    const scale = Math.min(vw / iw, vh / ih);
    const tx = (vw - iw * scale) / 2;
    const ty = (vh - ih * scale) / 2;
    state.view = { scale, tx, ty, fitScale: scale, fitTx: tx, fitTy: ty };
    // size the canvas box to the image's natural pixels; transform scales it down
    el.canvas.style.width = iw + "px";
    el.canvas.style.height = ih + "px";
    el.overlay.setAttribute("viewBox", `0 0 ${iw} ${ih}`);
    applyView();
  }

  function clampView() {
    const v = state.view;
    const min = v.fitScale;
    if (v.scale < min) v.scale = min;
    if (v.scale > min * 12) v.scale = min * 12;
  }

  function zoomAt(clientX, clientY, factor) {
    const v = state.view;
    const rect = el.viewport.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    // image point under cursor before zoom
    const ix = (px - v.tx) / v.scale;
    const iy = (py - v.ty) / v.scale;
    v.scale *= factor;
    clampView();
    // keep that image point under the cursor
    v.tx = px - ix * v.scale;
    v.ty = py - iy * v.scale;
    applyView();
  }

  // screen -> image coordinates
  function toImage(clientX, clientY) {
    const v = state.view;
    const rect = el.viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left - v.tx) / v.scale,
      y: (clientY - rect.top - v.ty) / v.scale,
    };
  }

  // =========================================================================
  // Pointer / gesture handling
  // =========================================================================
  const pointers = new Map();
  let gesture = null; // active gesture descriptor

  function onPointerDown(e) {
    el.viewport.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      // start pinch
      const pts = [...pointers.values()];
      gesture = {
        type: "pinch",
        startDist: dist(pts[0], pts[1]),
        startScale: state.view.scale,
        cx: (pts[0].x + pts[1].x) / 2,
        cy: (pts[0].y + pts[1].y) / 2,
      };
      return;
    }

    const target = e.target.closest ? e.target.closest("[data-role='resize'], .mark") : null;
    const startImg = toImage(e.clientX, e.clientY);

    if (target && target.dataset.role === "resize") {
      const m = markerById(target.dataset.id);
      pushUndo();
      gesture = { type: "resize", id: m.id, startImg, startSize: m.size, moved: false, changed: false };
    } else if (target && target.classList.contains("mark")) {
      const m = markerById(target.dataset.id);
      gesture = {
        type: "marker-press", id: m.id, startImg,
        startX: m.x, startY: m.y, downX: e.clientX, downY: e.clientY,
        downTime: performance.now(), moved: false, changed: false,
      };
    } else {
      gesture = {
        type: "canvas-press", startImg,
        startTx: state.view.tx, startTy: state.view.ty,
        downX: e.clientX, downY: e.clientY, downTime: performance.now(), moved: false,
      };
    }
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (gesture && gesture.type === "pinch" && pointers.size >= 2) {
      const pts = [...pointers.values()];
      const d = dist(pts[0], pts[1]);
      const factor = (d / gesture.startDist) * (gesture.startScale / state.view.scale);
      zoomAt(gesture.cx, gesture.cy, factor);
      return;
    }
    if (!gesture) return;

    if (gesture.type === "resize") {
      const img = toImage(e.clientX, e.clientY);
      const m = markerById(gesture.id);
      if (!m) return;
      const dx = img.x - m.x, dy = img.y - m.y;
      const newSize = clamp(Math.max(Math.abs(dx), Math.abs(dy)) * 2, 16, 4000);
      m.size = newSize;
      gesture.changed = true;
      render();
      el.sizeRange.value = Math.round(Math.min(220, m.size));
      return;
    }

    const movedFar = Math.hypot(e.clientX - gesture.downX, e.clientY - gesture.downY) > TAP_MOVE_TOLERANCE;

    if (gesture.type === "marker-press") {
      if (movedFar) {
        if (!gesture.moved) { pushUndo(); gesture.moved = true; }
        const img = toImage(e.clientX, e.clientY);
        const m = markerById(gesture.id);
        if (m) {
          m.x = gesture.startX + (img.x - gesture.startImg.x);
          m.y = gesture.startY + (img.y - gesture.startImg.y);
          gesture.changed = true;
          if (state.selectedId !== m.id) { state.selectedId = m.id; }
          render();
        }
      }
    } else if (gesture.type === "canvas-press") {
      if (movedFar) {
        gesture.moved = true;
        state.view.tx = gesture.startTx + (e.clientX - gesture.downX);
        state.view.ty = gesture.startTy + (e.clientY - gesture.downY);
        applyView();
      }
    }
  }

  function onPointerUp(e) {
    el.viewport.releasePointerCapture?.(e.pointerId);
    pointers.delete(e.pointerId);

    if (gesture && gesture.type === "pinch") {
      gesture = pointers.size === 1 ? null : gesture;
      if (pointers.size < 2) gesture = null;
      return;
    }
    if (!gesture) return;

    const dt = performance.now() - (gesture.downTime || 0);
    const isTap = !gesture.moved && dt < TAP_TIME_LIMIT;

    if (gesture.type === "resize") {
      if (gesture.changed) { saveMarkers(); } else { state.undoStack.pop(); }
      updateButtons();
    } else if (gesture.type === "marker-press") {
      if (isTap) {
        if (state.tool === "eraser") deleteMarker(gesture.id);
        else selectMarker(gesture.id);
      } else if (gesture.changed) {
        saveMarkers();
      }
    } else if (gesture.type === "canvas-press") {
      if (isTap) {
        if (state.tool === "stamp") {
          const p = gesture.startImg;
          if (inBounds(p)) addMarker(p.x, p.y);
          else deselect();
        } else {
          deselect();
        }
      }
    }
    gesture = null;
  }

  function deselect() {
    if (state.selectedId != null) {
      state.selectedId = null;
      render();
      updateSizeGroup();
    }
  }

  function inBounds(p) {
    return p.x >= 0 && p.y >= 0 && p.x <= state.map.width && p.y <= state.map.height;
  }

  function markerById(id) { return state.markers.find((m) => m.id === id); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

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
    // recolor the selected marker too, if any
    const m = markerById(state.selectedId);
    if (m && m.color !== c) {
      pushUndo();
      m.color = c;
      saveMarkers();
      render();
    }
    for (const b of el.swatches.children) {
      b.classList.toggle("active", b.style.getPropertyValue("--sw").trim().toLowerCase() === c.toLowerCase());
    }
  }

  function normalizeHex(c) {
    return /^#[0-9a-fA-F]{6}$/.test(c) ? c : null;
  }

  function setTool(tool) {
    state.tool = tool;
    el.stampBtn.classList.toggle("active", tool === "stamp");
    el.eraserBtn.classList.toggle("active", tool === "eraser");
    el.stampBtn.setAttribute("aria-pressed", String(tool === "stamp"));
    el.eraserBtn.setAttribute("aria-pressed", String(tool === "eraser"));
    if (tool === "eraser") deselect();
    el.hint.textContent = tool === "eraser"
      ? "Eraser: tap an X to remove it."
      : "Tap a room to stamp an X. Tap an X to select & resize it.";
  }

  function updateButtons() {
    el.undoBtn.disabled = state.undoStack.length === 0;
    el.resetBtn.disabled = state.markers.length === 0;
  }

  function updateSizeGroup() {
    const m = markerById(state.selectedId);
    if (m) {
      el.sizeGroup.hidden = false;
      el.sizeRange.value = Math.round(clamp(m.size, 16, 220));
    } else {
      el.sizeGroup.hidden = true;
    }
  }

  function onSizeInput() {
    const m = markerById(state.selectedId);
    const val = Number(el.sizeRange.value);
    if (m) {
      if (!onSizeInput._dragging) { pushUndo(); onSizeInput._dragging = true; }
      m.size = val;
      render();
    } else {
      state.stampSize = val;
    }
  }
  function onSizeCommit() {
    if (onSizeInput._dragging) {
      const m = markerById(state.selectedId);
      if (m) { state.stampSize = m.size; saveMarkers(); }
      onSizeInput._dragging = false;
      updateButtons();
    }
  }

  // =========================================================================
  // Map loading
  // =========================================================================
  function populateMapSelect() {
    el.mapSelect.innerHTML = "";
    const byMission = {};
    for (const m of MAPS) (byMission[m.mission] = byMission[m.mission] || []).push(m);
    for (const mission of Object.keys(byMission)) {
      const grp = document.createElement("optgroup");
      grp.label = mission;
      for (const m of byMission[mission]) {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.name;
        grp.appendChild(opt);
      }
      el.mapSelect.appendChild(grp);
    }
  }

  function loadMap(id) {
    const map = MAPS.find((m) => m.id === id);
    if (!map) return;
    state.mapId = id;
    state.map = map;
    state.markers = loadMarkers(id);
    state.undoStack = [];
    state.selectedId = null;
    el.mapSelect.value = id;

    el.img.onload = () => {
      // if manifest lacked real dimensions, adopt the loaded ones
      if (!map.width || !map.height) {
        map.width = el.img.naturalWidth || map.width || 1000;
        map.height = el.img.naturalHeight || map.height || 1000;
      }
      fitView();
      render();
      updateButtons();
      updateSizeGroup();
    };
    el.img.alt = map.mission + " — " + map.name;
    el.img.src = map.src;

    try { localStorage.setItem(STORAGE_PREFIX + "lastMap", id); } catch (e) {}
  }

  // =========================================================================
  // Init
  // =========================================================================
  function init() {
    buildSwatches();
    setColor(state.color);
    populateMapSelect();

    el.mapSelect.addEventListener("change", () => loadMap(el.mapSelect.value));
    el.stampBtn.addEventListener("click", () => setTool("stamp"));
    el.eraserBtn.addEventListener("click", () => setTool("eraser"));
    el.undoBtn.addEventListener("click", undo);
    el.resetBtn.addEventListener("click", reset);
    el.colorInput.addEventListener("input", () => setColor(el.colorInput.value));
    el.sizeRange.addEventListener("input", onSizeInput);
    el.sizeRange.addEventListener("change", onSizeCommit);
    el.sizeRange.addEventListener("pointerup", onSizeCommit);
    el.zoomReset.addEventListener("click", () => { fitView(); });

    // pointer events on the viewport
    el.viewport.addEventListener("pointerdown", onPointerDown);
    el.viewport.addEventListener("pointermove", onPointerMove);
    el.viewport.addEventListener("pointerup", onPointerUp);
    el.viewport.addEventListener("pointercancel", onPointerUp);
    el.viewport.addEventListener("wheel", (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
    // block context menu on long-press / right click over the map
    el.viewport.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("resize", () => { if (state.map) fitView(); });
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
      else if (e.key === "e") setTool("eraser");
      else if (e.key === "s") setTool("stamp");
      else if ((e.key === "Delete" || e.key === "Backspace") && state.selectedId) {
        e.preventDefault(); deleteMarker(state.selectedId);
      }
    });

    let last = STORAGE_PREFIX + "lastMap";
    try { last = localStorage.getItem(STORAGE_PREFIX + "lastMap"); } catch (e) { last = null; }
    const startId = MAPS.find((m) => m.id === last) ? last : (MAPS[0] && MAPS[0].id);
    if (startId) loadMap(startId);

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js").catch(() => {});
      });
    }
  }

  init();
})();
