/* RoN Maps — marker tool.
 * Vanilla JS. A mission's floors are stacked in one native vertical scroll; the browser
 * handles scrolling between floors and pinch/ctrl-wheel zoom. Our only custom gesture is a
 * TAP (stamp / select). Markers are SVG objects stored in image-pixel coordinates so they
 * stay locked to the map across screen sizes, zoom, and devices. */
(function () {
  "use strict";

  const APP_VERSION = "0.2";
  const SVGNS = "http://www.w3.org/2000/svg";
  const STORAGE_PREFIX = "ronmaps:sinuous-trail:";  // kept for backward-compatible save keys
  const UNDO_LIMIT = 60;
  const TAP_MOVE_TOLERANCE = 10;  // px of screen movement still counted as a tap
  const TAP_TIME_LIMIT = 500;     // ms
  const PRESETS = ["#e02424", "#f5a524", "#16a34a", "#2563eb", "#111111", "#ffffff"];

  // ---- DOM ----
  const el = {
    hub: document.getElementById("hub"),
    missionGrid: document.getElementById("missionGrid"),
    appFoot: document.getElementById("appFoot"),
    toolbar: document.getElementById("toolbar"),
    backBtn: document.getElementById("backBtn"),
    missionTitle: document.getElementById("missionTitle"),
    stage: document.getElementById("stage"),
    scroller: document.getElementById("floorScroll"),
    stampBtn: document.getElementById("stampBtn"),
    eraserBtn: document.getElementById("eraserBtn"),
    swatches: document.getElementById("swatches"),
    colorInput: document.getElementById("colorInput"),
    undoBtn: document.getElementById("undoBtn"),
    resetBtn: document.getElementById("resetBtn"),
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
    color: "#e02424",
    stampSize: 64,       // default new-X size, in image px
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
    updateButtons();
  }
  function undo() {
    const f = activeFloor();
    if (!f || !f.undoStack.length) return;
    const snap = f.undoStack.pop();
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
  function addMarker(floor, x, y) {
    pushUndo(floor);
    const m = { id: uid(), x, y, size: state.stampSize, color: state.color };
    floor.markers.push(m);
    setSelected(floor, m.id);
    saveFloor(floor);
    renderFloor(floor);
    updateSizeGroup();
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
  }
  function reset() {
    const f = activeFloor();
    if (!f || !f.markers.length) return;
    if (!confirm("Clear all marks on " + f.map.name + "?")) return;
    pushUndo(f);
    f.markers = [];
    if (state.selectedIndex === indexOf(f)) clearSelection();
    saveFloor(f);
    renderFloor(f);
    updateSizeGroup();
  }

  // ---- selection ----
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
    for (const m of floor.markers) svg.appendChild(buildX(m, m.id === selId));
    updateButtons();
  }

  function buildX(m, selected) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "mark" + (selected ? " selected" : ""));
    g.dataset.id = m.id;

    const h = m.size / 2;
    const sw = Math.max(4, m.size * 0.16); // stroke scales with size

    // subtle backing so a light-colored X reads on a light blueprint
    g.appendChild(lineGroup(m, h, sw + 6, "rgba(0,0,0,0.35)"));
    g.appendChild(lineGroup(m, h, sw, m.color));

    if (selected) {
      const box = document.createElementNS(SVGNS, "rect");
      box.setAttribute("class", "sel-box");
      box.setAttribute("x", m.x - h); box.setAttribute("y", m.y - h);
      box.setAttribute("width", m.size); box.setAttribute("height", m.size);
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

  // =========================================================================
  // Coordinates: screen -> image pixels for a given floor.
  // Works under native pinch-zoom/scroll because clientX and the rect are both
  // in layout-viewport CSS px.
  // =========================================================================
  function toImage(floor, clientX, clientY) {
    const rect = floor.img.getBoundingClientRect();
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
    } else if (mark) {
      press = {
        kind: "mark", floor, id: mark.dataset.id,
        downX: e.clientX, downY: e.clientY, downTime: performance.now(), moved: false,
      };
    } else {
      press = {
        kind: "empty", floor, startImg: toImage(floor, e.clientX, e.clientY),
        downX: e.clientX, downY: e.clientY, downTime: performance.now(), moved: false,
      };
    }
  }

  function onPointerMove(e) {
    if (!press) return;
    if (press.kind === "resize") {
      e.preventDefault();
      const m = markerById(press.floor, press.id);
      if (!m) return;
      const img = toImage(press.floor, e.clientX, e.clientY);
      m.size = clamp(Math.max(Math.abs(img.x - m.x), Math.abs(img.y - m.y)) * 2, 16, 8000);
      press.changed = true;
      renderFloor(press.floor);
      el.sizeRange.value = Math.round(Math.min(220, m.size));
      return;
    }
    if (Math.hypot(e.clientX - press.downX, e.clientY - press.downY) > TAP_MOVE_TOLERANCE) {
      press.moved = true;
    }
  }

  function onPointerUp(e) {
    if (!press) return;
    el.scroller.releasePointerCapture && press.kind === "resize" &&
      el.scroller.releasePointerCapture(e.pointerId);
    const p = press;
    press = null;

    if (p.kind === "resize") {
      commitResize(p);
      return;
    }

    const dt = performance.now() - p.downTime;
    const isTap = !p.moved && dt < TAP_TIME_LIMIT;
    if (!isTap) return;

    setActiveFloor(indexOf(p.floor));
    if (p.kind === "mark") {
      if (state.tool === "eraser") deleteMarker(p.floor, p.id);
      else selectMarker(p.floor, p.id);
    } else { // empty
      if (state.tool === "stamp" && inBounds(p.floor, p.startImg)) addMarker(p.floor, p.startImg.x, p.startImg.y);
      else deselect();
    }
  }

  function onPointerCancel() {
    if (press && press.kind === "resize") commitResize(press);
    press = null;
  }

  function commitResize(p) {
    const m = markerById(p.floor, p.id);
    if (p.changed) {
      if (m) state.stampSize = m.size;
      saveFloor(p.floor);
    } else {
      p.floor.undoStack.pop(); // nothing changed — discard the snapshot we pushed
    }
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
  }
  function normalizeHex(c) { return /^#[0-9a-fA-F]{6}$/.test(c) ? c : null; }

  function setTool(tool) {
    state.tool = tool;
    el.stampBtn.classList.toggle("active", tool === "stamp");
    el.eraserBtn.classList.toggle("active", tool === "eraser");
    el.stampBtn.setAttribute("aria-pressed", String(tool === "stamp"));
    el.eraserBtn.setAttribute("aria-pressed", String(tool === "eraser"));
    if (tool === "eraser") deselect();
    el.hint.textContent = tool === "eraser"
      ? "Eraser: tap an X to remove it."
      : "Tap a room to stamp an X · scroll for other floors · pinch to zoom.";
  }

  function updateButtons() {
    const f = activeFloor();
    el.undoBtn.disabled = !f || f.undoStack.length === 0;
    el.resetBtn.disabled = !f || f.markers.length === 0;
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
    }
  }
  function onSizeCommit() {
    if (onSizeInput._dragging) {
      const m = selectedMarker();
      if (m) { state.stampSize = m.size; saveFloor(selectedFloor()); }
      onSizeInput._dragging = false;
      updateButtons();
    }
  }

  // =========================================================================
  // Hub (mission picker) + navigation
  // =========================================================================
  function buildHub() {
    el.missionGrid.innerHTML = "";
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
      meta.textContent = available
        ? mission.maps.length + (mission.maps.length === 1 ? " map" : " maps")
        : "Coming soon";

      card.append(num, name, meta);
      if (available) card.addEventListener("click", () => openMission(mission));
      el.missionGrid.appendChild(card);
    }
  }

  function showHub() {
    teardownFloors();
    state.mission = null;
    el.stage.hidden = true;
    el.toolbar.hidden = true;
    el.hub.hidden = false;
  }

  function openMission(mission) {
    if (!mission.maps.length) return;
    state.mission = mission;
    el.missionTitle.textContent = mission.name;
    el.hub.hidden = true;
    el.toolbar.hidden = false;
    el.stage.hidden = false;      // must be visible before we measure/observe
    buildFloors(mission);
    clearSelection();
    updateSizeGroup();
    setTool(state.tool);
    el.scroller.scrollTop = 0;
    setActiveFloor(0);
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
      label.textContent = map.name;

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

      const floor = { map, markers: loadMarkers(map.id), undoStack: [], section, wrap, img, svg };
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
    el.scroller.innerHTML = "";
  }

  // =========================================================================
  // Init
  // =========================================================================
  function init() {
    buildSwatches();
    setColor(state.color);
    buildHub();
    el.appFoot.textContent = "© Avery LLC · v" + APP_VERSION;

    el.backBtn.addEventListener("click", showHub);
    el.stampBtn.addEventListener("click", () => setTool("stamp"));
    el.eraserBtn.addEventListener("click", () => setTool("eraser"));
    el.undoBtn.addEventListener("click", undo);
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

    document.addEventListener("keydown", (e) => {
      if (!el.hub.hidden) return; // no shortcuts on the hub
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
      else if (e.key === "Escape") showHub();
      else if (e.key === "e") setTool("eraser");
      else if (e.key === "s") setTool("stamp");
      else if ((e.key === "Delete" || e.key === "Backspace") && state.selectedId) {
        e.preventDefault();
        deleteMarker(selectedFloor(), state.selectedId);
      }
    });

    // Start on the hub so the user picks a mission first.
    showHub();

    registerServiceWorker();
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
