/* ──────────────────────────────────────────────────────────
   editor.js  –  Standalone fullscreen photo-editor module
   Exposes:  openPhotoEditor(imageUrl) → Promise<Blob|null>
             closePhotoEditor()        (also used internally)
   ────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  /* ── constants ─────────────────────────────────────────── */
  const STICKERS = [
    "❤️","⭐","🔥","😎","🎉","✨","💪","🤩","🌟","💜",
    "🦋","🌈","😂","🥳","👑","💙","🐱","🎵","💫","🤗",
    "🍕","☕","🧡","💚","🖤","🤍"
  ];

  const BRUSH_COLORS = [
    "#fff","#ff4757","#ffa502","#2ed573",
    "#1e90ff","#a855f7","#ff6b81","#000"
  ];

  /* ── DOM refs (resolved lazily on first open) ──────────── */
  let overlay, box, img, canvas, ctx;
  let zoomSlider;
  let btnMove, btnSticker, btnBrush;
  let panelSticker, panelBrush;
  let stickerTray;
  let brushColorsWrap, brushSizeSlider;

  function refs() {
    if (overlay) return;
    overlay       = document.getElementById("editorOverlay");
    box           = document.getElementById("editorBox");
    img           = document.getElementById("editorImg");
    canvas        = document.getElementById("drawCanvas");
    ctx           = canvas.getContext("2d");
    zoomSlider    = document.getElementById("editorZoom");
    btnMove       = document.getElementById("tool-move");
    btnSticker    = document.getElementById("tool-sticker");
    btnBrush      = document.getElementById("tool-brush");
    panelSticker  = document.getElementById("toolPanel-sticker");
    panelBrush    = document.getElementById("toolPanel-brush");
    stickerTray   = document.getElementById("editorStickerTray");
    brushColorsWrap   = document.getElementById("brushColors");
    brushSizeSlider   = document.getElementById("brushSize");
    buildStickerTray();
    buildBrushColors();
  }

  /* ── state ─────────────────────────────────────────────── */
  let resolvePromise = null;       // resolve for openPhotoEditor promise
  let currentTool    = "move";     // "move" | "sticker" | "brush"
  let selectedSticker = null;      // currently-selected sticker DOM element

  // image drag / zoom
  let imgState = { x: 0, y: 0, baseW: 0, baseH: 0, dragging: false, sx: 0, sy: 0 };

  // brush
  let brushColor = BRUSH_COLORS[0];
  let brushDrawing = false;
  let lastPt = null;

  /* ── sticker tray setup ────────────────────────────────── */
  function buildStickerTray() {
    stickerTray.innerHTML = STICKERS.map(
      s => `<button class="sticker-btn" data-s="${s}">${s}</button>`
    ).join("");
    stickerTray.addEventListener("click", e => {
      const btn = e.target.closest(".sticker-btn");
      if (!btn) return;
      placeSticker(btn.dataset.s);
    });
  }

  /* ── brush color buttons ───────────────────────────────── */
  function buildBrushColors() {
    brushColorsWrap.innerHTML = BRUSH_COLORS.map((c, i) =>
      `<div class="brush-color${i === 0 ? " active" : ""}" data-c="${c}" style="background:${c}"></div>`
    ).join("");
    brushColorsWrap.addEventListener("click", e => {
      const el = e.target.closest(".brush-color");
      if (!el) return;
      brushColorsWrap.querySelectorAll(".brush-color").forEach(b => b.classList.remove("active"));
      el.classList.add("active");
      brushColor = el.dataset.c;
    });
  }

  /* ============================================================
     TOOL SWITCHING
     ============================================================ */
  function setTool(name) {
    currentTool = name;
    [btnMove, btnSticker, btnBrush].forEach(b => b.classList.remove("active"));
    ({ move: btnMove, sticker: btnSticker, brush: btnBrush })[name].classList.add("active");

    panelSticker.style.display = name === "sticker" ? "" : "none";
    panelBrush.style.display   = name === "brush"   ? "" : "none";

    // canvas pointer-events: only in brush mode
    canvas.style.pointerEvents = name === "brush" ? "auto" : "none";

    // deselect sticker when leaving sticker mode
    if (name !== "sticker") deselectSticker();
  }

  /* ============================================================
     IMAGE MOVE / ZOOM
     ============================================================ */
  function resetImage() {
    const bw = box.offsetWidth, bh = box.offsetHeight;
    if (!bw || !bh) return;
    const ratio = img.naturalWidth / img.naturalHeight;
    let w, h;
    if (ratio > bw / bh) { h = bh; w = h * ratio; }
    else                  { w = bw; h = w / ratio; }
    imgState.baseW = w;
    imgState.baseH = h;
    imgState.x = (bw - w) / 2;
    imgState.y = (bh - h) / 2;
    applyImgTransform(w, h);
  }

  function applyImgTransform(w, h) {
    img.style.width  = w + "px";
    img.style.height = h + "px";
    img.style.left   = imgState.x + "px";
    img.style.top    = imgState.y + "px";
  }

  function clampImg() {
    const bw = box.offsetWidth, bh = box.offsetHeight;
    const iw = img.offsetWidth, ih = img.offsetHeight;
    imgState.x = Math.min(0, Math.max(bw - iw, imgState.x));
    imgState.y = Math.min(0, Math.max(bh - ih, imgState.y));
  }

  function onZoom() {
    const s = zoomSlider.value / 100;
    const w = imgState.baseW * s, h = imgState.baseH * s;
    img.style.width  = w + "px";
    img.style.height = h + "px";
    clampImg();
    img.style.left = imgState.x + "px";
    img.style.top  = imgState.y + "px";
  }

  /* ── generic pointer helpers ───────────────────────────── */
  function ptrXY(e) {
    if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  /* ── image drag (attached to box) ──────────────────────── */
  function imgDragStart(e) {
    if (currentTool !== "move") return;
    e.preventDefault();
    const p = ptrXY(e);
    imgState.dragging = true;
    imgState.sx = p.x - imgState.x;
    imgState.sy = p.y - imgState.y;
  }
  function imgDragMove(e) {
    if (!imgState.dragging) return;
    e.preventDefault();
    const p = ptrXY(e);
    imgState.x = p.x - imgState.sx;
    imgState.y = p.y - imgState.sy;
    clampImg();
    img.style.left = imgState.x + "px";
    img.style.top  = imgState.y + "px";
  }
  function imgDragEnd() { imgState.dragging = false; }

  /* ============================================================
     STICKERS
     ============================================================ */
  function placeSticker(emoji) {
    const el = document.createElement("div");
    el.className = "sticker-on-photo";
    el.dataset.emoji = emoji;
    el.textContent = emoji;
    const size = 36;
    el.style.fontSize = size + "px";
    el.style.left = (box.offsetWidth / 2 - size / 2) + "px";
    el.style.top  = (box.offsetHeight / 2 - size / 2) + "px";
    el.style.position = "absolute";

    // hover UI: delete only
    const btnDel = document.createElement("button");
    btnDel.className = "sticker-del";
    btnDel.textContent = "×";
    btnDel.onclick = e => { e.stopPropagation(); el.remove(); if(selectedSticker===el) selectedSticker=null; };
    el.appendChild(btnDel);

    // resize handle (corner drag)
    const handle = document.createElement("div");
    handle.className = "resize-handle";
    el.appendChild(handle);
    attachResizeHandle(el, handle);

    attachStickerEvents(el);
    box.appendChild(el);
    selectSticker(el);
  }

  function attachResizeHandle(el, handle) {
    let startY = 0, startSize = 0;
    function onStart(e) {
      e.preventDefault(); e.stopPropagation();
      const p = ptrXY(e);
      startY = p.y;
      startSize = parseFloat(el.style.fontSize) || 36;
      function onMove(ev) {
        ev.preventDefault();
        const pp = ptrXY(ev);
        const diff = pp.y - startY;
        const newSize = Math.max(16, Math.min(120, startSize + diff * 0.5));
        el.style.fontSize = newSize + "px";
      }
      function onEnd() {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onEnd);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onEnd);
      }
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onEnd);
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onEnd);
    }
    handle.addEventListener("mousedown", onStart);
    handle.addEventListener("touchstart", onStart, { passive: false });
  }

  function selectSticker(el) {
    deselectSticker();
    selectedSticker = el;
    el.classList.add("selected");
  }

  function deselectSticker() {
    if (selectedSticker) selectedSticker.classList.remove("selected");
    selectedSticker = null;
  }

  function removeSelectedSticker() {
    if (!selectedSticker) return;
    selectedSticker.remove();
    selectedSticker = null;
  }

  function attachStickerEvents(el) {
    let dragged = false;
    let sx = 0, sy = 0;

    function onStart(e) {
      if (currentTool !== "sticker") return;
      e.preventDefault();
      e.stopPropagation();
      dragged = false;
      const p = ptrXY(e);
      sx = p.x - el.offsetLeft;
      sy = p.y - el.offsetTop;

      function onMove(ev) {
        dragged = true;
        const pp = ptrXY(ev);
        el.style.left = Math.max(0, Math.min(box.offsetWidth - 20, pp.x - sx)) + "px";
        el.style.top  = Math.max(0, Math.min(box.offsetHeight - 20, pp.y - sy)) + "px";
        ev.preventDefault();
      }
      function onEnd(ev) {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onEnd);
        window.removeEventListener("touchmove", onMove, { passive: false });
        window.removeEventListener("touchend", onEnd);
        // if not dragged, treat as click (select/deselect/remove)
        if (!dragged) handleStickerClick(el);
      }
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onEnd);
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onEnd);
    }

    el.addEventListener("mousedown", onStart);
    el.addEventListener("touchstart", onStart, { passive: false });
  }

  function handleStickerClick(el) {
    if (selectedSticker === el) {
      // already selected → remove
      removeSelectedSticker();
    } else {
      selectSticker(el);
    }
  }

  /* keyboard delete */
  function onKeyDown(e) {
    if (!overlay || !overlay.classList.contains("on")) return;
    if ((e.key === "Delete" || e.key === "Backspace") && selectedSticker) {
      e.preventDefault();
      removeSelectedSticker();
    }
  }


  /* ============================================================
     BRUSH DRAWING
     ============================================================ */
  function resizeCanvas() {
    canvas.width  = box.offsetWidth;
    canvas.height = box.offsetHeight;
  }

  function brushStart(e) {
    if (currentTool !== "brush") return;
    e.preventDefault();
    brushDrawing = true;
    const p = canvasXY(e);
    lastPt = p;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function brushMove(e) {
    if (!brushDrawing) return;
    e.preventDefault();
    const p = canvasXY(e);
    ctx.strokeStyle = brushColor;
    ctx.lineWidth   = parseInt(brushSizeSlider.value, 10) || 4;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.beginPath();
    ctx.moveTo(lastPt.x, lastPt.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPt = p;
  }

  function brushEnd() {
    brushDrawing = false;
    lastPt = null;
  }

  function canvasXY(e) {
    const rect = canvas.getBoundingClientRect();
    const p = ptrXY(e);
    return {
      x: (p.x - rect.left) * (canvas.width / rect.width),
      y: (p.y - rect.top)  * (canvas.height / rect.height)
    };
  }

  /* ============================================================
     COMPOSITING  →  Blob (JPEG)
     ============================================================ */
  function compositeToBlob() {
    return new Promise((resolve, reject) => {
      const bw = box.offsetWidth, bh = box.offsetHeight;
      const iw = img.offsetWidth, ih = img.offsetHeight;
      const nw = img.naturalWidth, nh = img.naturalHeight;

      const scaleX = nw / iw, scaleY = nh / ih;
      const ix = parseFloat(img.style.left) || 0;
      const iy = parseFloat(img.style.top)  || 0;

      // source rect in natural-pixel space
      const sx = Math.max(0, -ix * scaleX);
      const sy = Math.max(0, -iy * scaleY);
      const sw = Math.min(bw * scaleX, nw - sx);
      const sh = Math.min(bh * scaleY, nh - sy);

      // output size – cap at 900 wide
      const outW = Math.min(900, Math.round(sw));
      const outH = Math.round(outW * (sh / sw));

      const oc = document.createElement("canvas");
      oc.width = outW;
      oc.height = outH;
      const octx = oc.getContext("2d");

      // 1. draw cropped photo
      octx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

      // ratio from screen box to output canvas
      const ratioX = outW / bw;
      const ratioY = outH / bh;

      // 2. draw brush canvas
      octx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, outW, outH);

      // 3. draw stickers using temporary canvas to render emoji reliably
      const stickers = box.querySelectorAll(".sticker-on-photo");
      const stickerPromises = Array.from(stickers).map(s => {
        return new Promise(res => {
          const sLeft = s.offsetLeft;
          const sTop  = s.offsetTop;
          const fontSize = parseFloat(window.getComputedStyle(s).fontSize) || 36;
          const outSize = Math.round(fontSize * ratioX);
          // render emoji to a temp canvas, then drawImage
          const tc = document.createElement("canvas");
          tc.width = outSize * 1.2;
          tc.height = outSize * 1.2;
          const tctx = tc.getContext("2d");
          tctx.font = outSize + "px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
          tctx.textBaseline = "top";
          tctx.fillText(s.dataset.emoji || s.textContent, 0, 0);
          octx.drawImage(tc, sLeft * ratioX, sTop * ratioY);
          res();
        });
      });

      Promise.all(stickerPromises).then(() => {
        oc.toBlob(
          blob => blob ? resolve(blob) : reject(new Error("Compositing failed")),
          "image/jpeg",
          0.88
        );
      });
    });
  }

  /* ============================================================
     OPEN / CLOSE
     ============================================================ */
  function openPhotoEditor(imageUrl) {
    refs(); // ensure DOM refs

    return new Promise(resolve => {
      resolvePromise = resolve;

      // reset state
      currentTool = "move";
      selectedSticker = null;
      brushDrawing = false;
      lastPt = null;
      brushColor = BRUSH_COLORS[0];

      // reset UI
      zoomSlider.value = 100;
      setTool("move");
      brushColorsWrap.querySelector(".brush-color").click(); // select first color

      // clear previous stickers
      box.querySelectorAll(".sticker-on-photo").forEach(s => s.remove());

      // show overlay
      overlay.classList.add("on");

      // load image (crossOrigin for CORS canvas export)
      img.crossOrigin = "anonymous";
      img.onload = () => {
        requestAnimationFrame(() => {
          resetImage();
          resizeCanvas();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        });
      };
      img.src = imageUrl;

      // attach events (idempotent via named-handler refs — we detach first)
      detachEvents();
      attachEvents();
    });
  }

  function closePhotoEditor(done) {
    if (!overlay) return;

    if (done) {
      console.log("Editor Done: compositing...", {
        imgW: img.naturalWidth, imgH: img.naturalHeight,
        boxW: box.offsetWidth, boxH: box.offsetHeight,
        stickers: box.querySelectorAll(".sticker-on-photo").length
      });
      compositeToBlob()
        .then(blob => {
          console.log("Composite success, blob size:", blob.size);
          overlay.classList.remove("on");
          detachEvents();
          if (resolvePromise) { resolvePromise(blob); resolvePromise = null; }
        })
        .catch(err => {
          console.error("Editor composite error:", err);
          alert("Photo save failed: " + err.message);
          overlay.classList.remove("on");
          detachEvents();
          if (resolvePromise) { resolvePromise(null); resolvePromise = null; }
        });
    } else {
      overlay.classList.remove("on");
      detachEvents();
      if (resolvePromise) { resolvePromise(null); resolvePromise = null; }
    }
  }

  /* ── event wiring ──────────────────────────────────────── */
  // We use named handlers so we can cleanly remove them.

  function _boxMouseDown(e)  { imgDragStart(e); }
  function _boxTouchStart(e) { imgDragStart(e); }
  function _boxTouchMove(e)  { imgDragMove(e); }
  function _winMouseMove(e)  { imgDragMove(e); }
  function _winMouseUp(e)    { imgDragEnd(); }
  function _winTouchEnd(e)   { imgDragEnd(); }

  function _canvasMouseDown(e)  { brushStart(e); }
  function _canvasTouchStart(e) { brushStart(e); }
  function _canvasMouseMove(e)  { brushMove(e); }
  function _canvasTouchMove(e)  { brushMove(e); }
  function _canvasMouseUp(e)    { brushEnd(); }
  function _canvasTouchEnd(e)   { brushEnd(); }

  function _zoomInput() { onZoom(); }
  function _keyDown(e) { onKeyDown(e); }

  function attachEvents() {
    // image drag on the box (only fires in move mode via guard)
    box.addEventListener("mousedown", _boxMouseDown);
    box.addEventListener("touchstart", _boxTouchStart, { passive: false });
    box.addEventListener("touchmove", _boxTouchMove, { passive: false });
    window.addEventListener("mousemove", _winMouseMove);
    window.addEventListener("mouseup", _winMouseUp);
    window.addEventListener("touchend", _winTouchEnd);

    // brush on canvas
    canvas.addEventListener("mousedown", _canvasMouseDown);
    canvas.addEventListener("touchstart", _canvasTouchStart, { passive: false });
    canvas.addEventListener("mousemove", _canvasMouseMove);
    canvas.addEventListener("touchmove", _canvasTouchMove, { passive: false });
    canvas.addEventListener("mouseup", _canvasMouseUp);
    canvas.addEventListener("touchend", _canvasTouchEnd);

    // sliders
    zoomSlider.addEventListener("input", _zoomInput);


    // keyboard
    window.addEventListener("keydown", _keyDown);
  }

  function detachEvents() {
    if (!box) return;
    box.removeEventListener("mousedown", _boxMouseDown);
    box.removeEventListener("touchstart", _boxTouchStart);
    box.removeEventListener("touchmove", _boxTouchMove);
    window.removeEventListener("mousemove", _winMouseMove);
    window.removeEventListener("mouseup", _winMouseUp);
    window.removeEventListener("touchend", _winTouchEnd);

    canvas.removeEventListener("mousedown", _canvasMouseDown);
    canvas.removeEventListener("touchstart", _canvasTouchStart);
    canvas.removeEventListener("mousemove", _canvasMouseMove);
    canvas.removeEventListener("touchmove", _canvasTouchMove);
    canvas.removeEventListener("mouseup", _canvasMouseUp);
    canvas.removeEventListener("touchend", _canvasTouchEnd);

    zoomSlider.removeEventListener("input", _zoomInput);


    window.removeEventListener("keydown", _keyDown);
  }

  /* ============================================================
     GLOBALS  –  the HTML onclick handlers reference these
     ============================================================ */
  window.openPhotoEditor  = openPhotoEditor;
  window.closePhotoEditor = closePhotoEditor;
  window.setTool     = function (name) { refs(); setTool(name); };

  // Bind all editor buttons directly
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("editorDone").addEventListener("click", (e) => { e.stopPropagation(); closePhotoEditor(true); });
    document.getElementById("editorCancel").addEventListener("click", (e) => { e.stopPropagation(); closePhotoEditor(false); });
    document.getElementById("tool-move").addEventListener("click", () => { refs(); setTool("move"); });
    document.getElementById("tool-sticker").addEventListener("click", () => { refs(); setTool("sticker"); });
    document.getElementById("tool-brush").addEventListener("click", () => { refs(); setTool("brush"); });
  });

})();
