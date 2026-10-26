/*
 * Long-press event probe (Task 57, FR-47 measurement).
 *
 * Read-only: capture-phase, passive listeners; changes no DOM; never calls
 * preventDefault. Inject into the real editor page through Chrome DevTools
 * remote debugging (CDP Runtime.evaluate, or paste into the console from
 * chrome://inspect). Re-injecting stops the previous instance first.
 *
 * Exposes window.__longpressProbe = { log, dump(), stop() }.
 *   log    array of entries, in arrival order
 *   dump() JSON text of { meta, log }
 *   stop() removes every listener
 *
 * Logged for a press whose target is inside `.ProseMirror`: pointerdown,
 * pointerup, pointercancel, touchstart, touchend, touchcancel, contextmenu
 * (capture phase on window, plus a second entry "contextmenu-bubble" on
 * window in the bubble phase, which shows whether something called
 * preventDefault in between), and selectionchange (when the DOM selection
 * is inside `.ProseMirror`). Every entry has `perfNow` (performance.now())
 * and `dateNow` (Date.now()).
 *
 * After each contextmenu, two "after-contextmenu" snapshots are taken, one
 * macrotask later (setTimeout 0) and one 300 ms later: selected text, DOM
 * anchor/focus, the ProseMirror selection from/to when reachable, and a
 * `.spell-error` hit test at the event coordinates and at the coordinates of
 * the last pointer/touch event.
 *
 * Reaching the ProseMirror view: TipTap sets `dom.editor = <Editor>` on the
 * `.ProseMirror` element, so `document.querySelector('.ProseMirror').editor`
 * gives `editor.view` and `editor.state`. If that property is absent the
 * probe logs DOM selection only (`view: "unreachable"`) and the hit test
 * uses elementFromPoint + closest('.spell-error'). Each hit test records
 * which method it used.
 */
(function () {
  "use strict";
  if (window.__longpressProbe && typeof window.__longpressProbe.stop === "function") {
    window.__longpressProbe.stop();
  }

  var log = [];
  var lastPoint = null; // last pointer/touch client coordinates seen in the editor

  function stamp(entry) {
    entry.perfNow = performance.now();
    entry.dateNow = Date.now();
    return entry;
  }

  function pmEl() {
    return document.querySelector(".ProseMirror");
  }

  function inEditor(node) {
    var el = pmEl();
    if (!el || !node) return false;
    return el === node || el.contains(node);
  }

  function describeTarget(t) {
    if (!t || !t.nodeName) return null;
    var cls = t.className && typeof t.className === "string" ? t.className : "";
    return t.nodeName.toLowerCase() + (cls ? "." + cls.split(/\s+/).join(".") : "");
  }

  function getView() {
    var el = pmEl();
    var ed = el && el.editor;
    return ed && ed.view && typeof ed.view.posAtCoords === "function" ? ed.view : null;
  }

  function hitTest(x, y) {
    var out = { x: x, y: y };
    var view = getView();
    if (view) {
      try {
        var hit = view.posAtCoords({ left: x, top: y });
        out.method = "view.posAtCoords";
        out.posAtCoords = hit ? { pos: hit.pos, inside: hit.inside } : null;
        if (hit) {
          var dom = view.domAtPos(hit.pos);
          var node = dom && dom.node;
          var el = node && node.nodeType === 3 ? node.parentElement : node;
          out.domAtPosNode = describeTarget(el);
          out.insideSpellError = !!(el && el.closest && el.closest(".spell-error"));
          // A boundary position can sit next to the word, not in it; record
          // the characters either side as DOM text so that is visible.
          out.docTextAround = view.state.doc.textBetween(
            Math.max(0, hit.pos - 8),
            Math.min(view.state.doc.content.size, hit.pos + 8),
            " ",
          );
        } else {
          out.insideSpellError = false;
        }
      } catch (e) {
        out.method = "view.posAtCoords";
        out.error = String(e);
        out.insideSpellError = null;
      }
    } else {
      var at = document.elementFromPoint(x, y);
      out.method = "elementFromPoint";
      out.element = describeTarget(at);
      out.insideSpellError = !!(at && at.closest && at.closest(".spell-error"));
    }
    // Always also record the elementFromPoint answer for comparison.
    if (view) {
      var ep = document.elementFromPoint(x, y);
      out.elementFromPoint = describeTarget(ep);
      out.elementFromPointInsideSpellError = !!(ep && ep.closest && ep.closest(".spell-error"));
    }
    return out;
  }

  function selectionState() {
    var sel = window.getSelection();
    var s = {
      text: sel ? sel.toString() : null,
      rangeCount: sel ? sel.rangeCount : null,
      isCollapsed: sel ? sel.isCollapsed : null,
      anchorNode: sel ? describeTarget(sel.anchorNode && sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode) : null,
      anchorNodeText: sel && sel.anchorNode && sel.anchorNode.nodeType === 3 ? sel.anchorNode.data : null,
      anchorOffset: sel ? sel.anchorOffset : null,
      focusNode: sel ? describeTarget(sel.focusNode && sel.focusNode.nodeType === 3 ? sel.focusNode.parentElement : sel.focusNode) : null,
      focusNodeText: sel && sel.focusNode && sel.focusNode.nodeType === 3 ? sel.focusNode.data : null,
      focusOffset: sel ? sel.focusOffset : null,
    };
    var el = pmEl();
    var ed = el && el.editor;
    if (ed && ed.state && ed.state.selection) {
      var ps = ed.state.selection;
      s.view = "reachable";
      s.pmSelection = { type: ps.constructor && ps.constructor.name, from: ps.from, to: ps.to, anchor: ps.anchor, head: ps.head };
      s.pmSelectedText = ed.state.doc.textBetween(ps.from, ps.to, " ");
    } else {
      s.view = "unreachable";
    }
    return s;
  }

  function pointerEntry(e) {
    if (e.target && e.target.nodeType && !inEditor(e.target)) return null;
    lastPoint = { x: e.clientX, y: e.clientY };
    return stamp({
      type: e.type,
      pointerType: e.pointerType,
      pointerId: e.pointerId,
      button: e.button,
      buttons: e.buttons,
      clientX: e.clientX,
      clientY: e.clientY,
      isTrusted: e.isTrusted,
      target: describeTarget(e.target),
    });
  }

  function touchEntry(e) {
    if (e.target && e.target.nodeType && !inEditor(e.target)) return null;
    var t = e.touches && e.touches[0];
    var c = e.changedTouches && e.changedTouches[0];
    var first = t || c;
    if (first) lastPoint = { x: first.clientX, y: first.clientY };
    return stamp({
      type: e.type,
      touches: e.touches ? e.touches.length : null,
      changedTouches: e.changedTouches ? e.changedTouches.length : null,
      firstTouchClientX: first ? first.clientX : null,
      firstTouchClientY: first ? first.clientY : null,
      isTrusted: e.isTrusted,
      cancelable: e.cancelable,
      defaultPrevented: e.defaultPrevented,
      target: describeTarget(e.target),
    });
  }

  function contextEntry(e, label) {
    var sc = e.sourceCapabilities;
    return stamp({
      type: label,
      isTrusted: e.isTrusted,
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      buttons: e.buttons,
      sourceCapabilities: sc ? { firesTouchEvents: sc.firesTouchEvents } : "absent",
      defaultPrevented: e.defaultPrevented,
      target: describeTarget(e.target),
    });
  }

  function snapshot(label, x, y) {
    var entry = stamp({ type: "after-contextmenu", after: label });
    entry.selection = selectionState();
    entry.hitAtEventCoords = hitTest(x, y);
    entry.hitAtLastPointerOrTouch = lastPoint ? hitTest(lastPoint.x, lastPoint.y) : null;
    log.push(entry);
  }

  var timers = [];
  function onPointer(e) {
    var en = pointerEntry(e);
    if (en) log.push(en);
  }
  function onTouch(e) {
    var en = touchEntry(e);
    if (en) log.push(en);
  }
  function onContext(e) {
    if (e.target && e.target.nodeType && !inEditor(e.target)) return;
    log.push(contextEntry(e, "contextmenu"));
    var x = e.clientX;
    var y = e.clientY;
    timers.push(setTimeout(function () { snapshot("+0ms (next macrotask)", x, y); }, 0));
    timers.push(setTimeout(function () { snapshot("+300ms", x, y); }, 300));
  }
  function onContextBubble(e) {
    if (e.target && e.target.nodeType && !inEditor(e.target)) return;
    log.push(contextEntry(e, "contextmenu-bubble"));
  }
  function onSelectionChange() {
    var sel = window.getSelection();
    if (!sel || !inEditor(sel.anchorNode)) return;
    var entry = stamp({ type: "selectionchange" });
    entry.selection = selectionState();
    log.push(entry);
  }

  var opts = { capture: true, passive: true };
  var pointerTypes = ["pointerdown", "pointerup", "pointercancel"];
  var touchTypes = ["touchstart", "touchend", "touchcancel"];
  pointerTypes.forEach(function (t) { window.addEventListener(t, onPointer, opts); });
  touchTypes.forEach(function (t) { window.addEventListener(t, onTouch, opts); });
  window.addEventListener("contextmenu", onContext, opts);
  window.addEventListener("contextmenu", onContextBubble, { capture: false, passive: true });
  document.addEventListener("selectionchange", onSelectionChange, { passive: true });

  window.__longpressProbe = {
    log: log,
    dump: function () {
      return JSON.stringify(
        {
          meta: {
            userAgent: navigator.userAgent,
            href: location.href,
            dumpedAtDateNow: Date.now(),
            dumpedAtPerfNow: performance.now(),
            viewReachable: !!getView(),
          },
          log: log,
        },
        null,
        2,
      );
    },
    stop: function () {
      pointerTypes.forEach(function (t) { window.removeEventListener(t, onPointer, opts); });
      touchTypes.forEach(function (t) { window.removeEventListener(t, onTouch, opts); });
      window.removeEventListener("contextmenu", onContext, opts);
      window.removeEventListener("contextmenu", onContextBubble, { capture: false, passive: true });
      document.removeEventListener("selectionchange", onSelectionChange, { passive: true });
      timers.forEach(clearTimeout);
    },
  };
  return "longpress probe installed";
})();
