---
title: "JavaScript 20 — Event System: Bubbling, Capturing, Delegation & Custom Events"
description: "Deep-dive into the DOM event model: capture and bubble phases, event delegation, stopPropagation vs stopImmediatePropagation, Custom Events, AbortController for cleanup, and passive listeners. Code-first reference for senior engineers."
---

# 20 — Event System: Bubbling, Capturing, Delegation & Custom Events

## Event Propagation: Capture → Target → Bubble

::code-wrapper{language="javascript"}
```javascript
// ── Events propagate in 3 phases (DOM event model) ──
//
//   Capture (top → down): document → ... → parent → target
//   Target:               target (the element that was clicked)
//   Bubble (bottom → up): target → parent → ... → document
//
//   <html>
//     <body>
//       <div>
//         <button>  ← target (click here)
//
//   Phase 1 (Capture): document → html → body → div → button
//   Phase 2 (Target):  button (both capture and bubble fire on target)
//   Phase 3 (Bubble):  button → div → body → html → document

// ── addEventListener: third arg = useCapture (default: false = bubble phase) ──
document.querySelector("#parent").addEventListener("click", (e) => {
    console.log("parent bubble:", e.target.tagName);
}, false);  // bubble phase (default)

document.querySelector("#parent").addEventListener("click", (e) => {
    console.log("parent capture:", e.target.tagName);
}, true);  // capture phase (fires FIRST — during top-down)

// Click on #child inside #parent:
// Capture order: document → ... → parent (capture fires) → child
// Target order: child (both capture and bubble fire on the target)
// Bubble order: child → parent (bubble fires) → ... → document

// ── e.target vs e.currentTarget ──
document.querySelector("#parent").addEventListener("click", (e) => {
    console.log(e.target);        // the ACTUAL element clicked (e.g., #child or a span inside)
    console.log(e.currentTarget); // the element with the listener (#parent)
    // target: where the event originated (deepest element)
    // currentTarget: the element that has the event listener (this in non-arrow)
});
```
::

## Event Delegation

::code-wrapper{language="javascript"}
```javascript
// ── Event delegation: one listener on a parent handles events for all children ──
// Instead of N listeners on N items, use 1 listener on the parent + event.target.

// ❌ NAIVE — one listener per item (memory + re-binding when items change)
document.querySelectorAll(".item").forEach(item => {
    item.addEventListener("click", () => console.log(item.dataset.id));
});
// Adding a new item? Must add a listener to it too.

// ✅ CORRECT — one listener on parent (event delegation)
document.querySelector("#list").addEventListener("click", (e) => {
    const item = e.target.closest(".item");  // find the closest .item ancestor
    if (!item) return;  // click wasn't on an .item (or descendant)
    if (!e.currentTarget.contains(item)) return;  // safety: item is inside the parent
    console.log("clicked:", item.dataset.id);
});
// Adding a new item? No need to add a listener — the parent's delegation handles it automatically.

// ── Delegation with data attributes for actions ──
document.querySelector("#app").addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]");
    if (!action) return;

    switch (action.dataset.action) {
        case "delete":
            const id = action.dataset.id;
            deleteItem(id);
            break;
        case "edit":
            editItem(action.dataset.id);
            break;
        case "save":
            saveForm(action.closest("form"));
            break;
    }
});
```
::

## `stopPropagation` vs `stopImmediatePropagation`

::code-wrapper{language="javascript"}
```javascript
// ── stopPropagation: stop the event from propagating (bubbling/capturing further) ──
// But other listeners ON THE SAME ELEMENT still fire.
document.querySelector("#button").addEventListener("click", (e) => {
    e.stopPropagation();  // parent listeners won't fire
    console.log("listener 1");  // fires
});
document.querySelector("#button").addEventListener("click", (e) => {
    console.log("listener 2");  // ALSO fires (same element, different listener)
});

// ── stopImmediatePropagation: stop propagation AND prevent other listeners on same element ──
document.querySelector("#button").addEventListener("click", (e) => {
    e.stopImmediatePropagation();  // no further listeners fire (same element + propagation)
    console.log("listener 1");  // fires
});
document.querySelector("#button").addEventListener("click", (e) => {
    console.log("listener 2");  // DOES NOT fire (stopImmediatePropagation blocked it)
});

// ── preventDefault: prevent the default browser behavior ──
document.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();  // prevents form submission (page reload)
    // handle the form with JS instead
});
document.querySelector("a").addEventListener("click", (e) => {
    e.preventDefault();  // prevents navigation
    // handle with client-side routing instead
});
// ⚠️ preventDefault doesn't stop propagation — the event still bubbles.
// To stop both: e.preventDefault(); e.stopPropagation();
```
::

## Custom Events

::code-wrapper{language="javascript"}
```javascript
// ── CustomEvent: create and dispatch custom events ──
const target = document.querySelector("#app");

// Listen for a custom event
target.addEventListener("app:ready", (e) => {
    console.log("app is ready", e.detail);  // detail: custom data
});

// Create and dispatch a custom event
const event = new CustomEvent("app:ready", {
    detail: { version: "1.0", timestamp: Date.now() },  // custom data (accessible via e.detail)
    bubbles: true,       // event bubbles (default: false)
    cancelable: true,    // event can be preventDefault'd (default: false)
    composed: true,      // event crosses Shadow DOM boundaries (default: false)
});
target.dispatchEvent(event);

// ── Use case: component communication ──
class Store extends EventTarget {
    #state = {};
    set(key, value) {
        this.#state[key] = value;
        this.dispatchEvent(new CustomEvent("change", {
            detail: { key, value, state: { ...this.#state } },
        }));
    }
}
const store = new Store();
store.addEventListener("change", (e) => {
    console.log("state changed:", e.detail.key, e.detail.value);
});
store.set("user", { name: "Alice" });  // dispatches "change" event

// ── AbortController: cancel event listeners (modern cleanup) ──
const controller = new AbortController();
document.addEventListener("scroll", handler, { signal: controller.signal });
// Later: cancel the listener (and any other listeners with the same signal)
controller.abort();  // removes the scroll listener (no need for removeEventListener)
```
::

## Passive Listeners for Scroll Performance

::code-wrapper{language="javascript"}
```javascript
// ── Passive listeners: tell the browser the handler won't call preventDefault ──
// This allows the browser to scroll immediately (without waiting for the handler to finish).
// Critical for touch/wheel events — non-passive listeners can cause scroll jank.

// ❌ NON-PASSIVE (default): browser waits for the handler before scrolling (can cause jank)
document.addEventListener("touchmove", (e) => {
    // if this calls e.preventDefault(), scrolling is blocked
    // the browser must WAIT for this handler to finish before scrolling
    updateIndicator();
}, { passive: false });  // default — browser must wait

// ✅ PASSIVE: browser scrolls immediately (handler runs but can't block)
document.addEventListener("touchmove", (e) => {
    updateIndicator();  // runs, but e.preventDefault() does NOTHING (passive ignores it)
}, { passive: true });  // browser doesn't wait — scrolls immediately
// Use passive for scroll/touch/wheel handlers that don't need preventDefault.

// ── once: listener auto-removes after first invocation ──
document.addEventListener("DOMContentLoaded", init, { once: true });
// equivalent to: document.addEventListener("DOMContentLoaded", () => {
//     init();
//     document.removeEventListener("DOMContentLoaded", init);
// });

// ── Combining options ──
document.addEventListener("scroll", handleScroll, {
    passive: true,   // won't call preventDefault (fast scroll)
    signal: controller.signal,  // can be aborted (clean removal)
});
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── Event delegation with data attributes ──
list.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]");
    if (action) handleAction(action.dataset.action, action.dataset.id);
});

// ── Debounced scroll/resize listeners (avoid excessive calls) ──
const debounce = (fn, ms) => {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
};
window.addEventListener("scroll", debounce(() => {
    console.log("scroll position:", window.scrollY);
}, 100));

// ── AbortController for bulk listener cleanup ──
function setupListeners(element) {
    const controller = new AbortController();
    element.addEventListener("click", handler1, { signal: controller.signal });
    element.addEventListener("input", handler2, { signal: controller.signal });
    element.addEventListener("keydown", handler3, { signal: controller.signal });
    return () => controller.abort();  // one call removes ALL three listeners
}
const cleanup = setupListeners(form);
// Later: cleanup();  // removes all listeners at once (no individual removeEventListener calls)

// ── Check if default was prevented ──
element.addEventListener("click", (e) => {
    if (!e.defaultPrevented) {  // another handler hasn't called preventDefault
        doSomething();
    }
});

// ── Dispatch synthetic events (for testing or automation) ──
const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
element.dispatchEvent(clickEvent);  // triggers click listeners as if the user clicked
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── Arrow function event listeners can't be removed (no named reference) ──
element.addEventListener("click", () => doSomething());
// Can't remove this — there's no reference to the anonymous function.
// Fix: use a named function (or AbortController):
function handler() { doSomething(); }
element.addEventListener("click", handler);
element.removeEventListener("click", handler);  // ✓ can remove

// ── removeEventListener must match the exact same function and options ──
element.addEventListener("click", handler, { passive: true });
element.removeEventListener("click", handler);  // ⚠️ might not remove (options differ)
element.removeEventListener("click", handler, { passive: true });  // ✓ exact match

// ── `this` in event listeners ──
element.addEventListener("click", function() {
    console.log(this);  // `this` is the element (for regular functions)
});
element.addEventListener("click", () => {
    // console.log(this);  // `this` is NOT the element (arrow — lexical `this`)
    // Use e.currentTarget instead: console.log(e.currentTarget)
});

// ── Events on disabled elements don't fire ──
// <button disabled> — click events don't fire on disabled elements
// Fix: wrap in a parent and listen on the parent (event delegation)

// ── passive listeners can't call preventDefault (it's a no-op) ──
element.addEventListener("touchmove", (e) => {
    e.preventDefault();  // ⚠️ no-op! (passive: true ignores preventDefault)
    // Console warning: "Unable to preventDefault inside passive event listener"
}, { passive: true });

// ── Custom events don't bubble by default ──
const event = new CustomEvent("myevent");  // bubbles: false (default)
// Must set { bubbles: true } to bubble up the DOM
```
::

## 🧠 Quick Quiz

In what order do the handlers fire when you click `#inner`?

::code-wrapper{language="html"}
```html
<div id="outer">
    <div id="inner"></div>
</div>
```
::