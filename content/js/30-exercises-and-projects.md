---
title: "JavaScript 30 — Exercises & Projects: Building Production Systems"
description: "Capstone projects for senior JavaScript engineers: build a reactive state store, a promise-based API client with retry, a virtual DOM diffing engine, a WebSocket real-time chat, and a full testing suite. Code-first reference with production-grade implementations."
---

# 30 — Exercises & Projects: Building Production Systems

## Project 1: Reactive State Store (Redux-like)

::code-wrapper{language="javascript"}
```javascript
// ── A minimal reactive state store with reducers, middleware, and subscriptions ──

function createStore(reducer, initialState, enhancer) {
    if (typeof enhancer === "function") {  // store enhancer (e.g., applyMiddleware)
        return enhancer(createStore)(reducer, initialState);
    }

    let state = initialState;
    const listeners = new Set();
    let isDispatching = false;

    function getState() { return state; }

    function dispatch(action) {
        if (typeof action !== "object" || action === null || typeof action.type === "undefined") {
            throw new Error("Actions must be plain objects with a `type` property");
        }
        if (isDispatching) throw new Error("Reducers may not dispatch actions");
        try {
            isDispatching = true;
            state = reducer(state, action);  // run the reducer
        } finally {
            isDispatching = false;
        }
        listeners.forEach(fn => fn());  // notify subscribers
        return action;
    }

    function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);  // unsubscribe function
    }

    // Initialize state by dispatching a dummy action
    dispatch({ type: "@@INIT" });

    return { getState, dispatch, subscribe };
}

// ── Middleware: intercept actions before they reach the reducer ──
function applyMiddleware(...middlewares) {
    return (createStore) => (reducer, initialState) => {
        const store = createStore(reducer, initialState);
        // Middleware receives dispatch and getState (with a restricted API)
        const api = {
            getState: store.getState,
            dispatch: (action) => enhancedDispatch(action),
        };
        const chain = middlewares.map(mw => mw(api)(store.dispatch));
        // Each middleware: (store) => (next) => (action) => result
        const enhancedDispatch = chain.reduceRight((next, mw) => mw(next), store.dispatch);
        return { ...store, dispatch: enhancedDispatch };
    };
}

// ── Logger middleware ──
const logger = store => next => action => {
    console.log("dispatching:", action.type, action);
    const result = next(action);  // pass to the next middleware / reducer
    console.log("next state:", store.getState());
    return result;
};

// ── Thunk middleware (async actions) ──
const thunk = store => next => action => {
    if (typeof action === "function") {
        return action(store.dispatch, store.getState);  // call the thunk
    }
    return next(action);  // pass through plain actions
};

// ── Reducer (pure function: (state, action) → newState) ──
function counterReducer(state = { count: 0 }, action) {
    switch (action.type) {
        case "INCREMENT": return { ...state, count: state.count + (action.by || 1) };
        case "DECREMENT": return { ...state, count: state.count - (action.by || 1) };
        case "RESET":     return { ...state, count: 0 };
        default:          return state;  // must return state for unknown actions
    }
}

// ── Usage ──
const store = createStore(counterReducer, undefined, applyMiddleware(thunk, logger));
store.subscribe(() => console.log("state changed:", store.getState().count));
store.dispatch({ type: "INCREMENT" });  // count: 1
store.dispatch({ type: "INCREMENT", by: 5 });  // count: 6
store.dispatch({ type: "RESET" });  // count: 0

// Async action (thunk):
const asyncIncrement = (dispatch, getState) => {
    setTimeout(() => dispatch({ type: "INCREMENT" }), 1000);
};
store.dispatch(asyncIncrement);  // increments after 1s (thunk intercepts)
```
::

## Project 2: Promise-Based API Client with Retry and Cancellation

::code-wrapper{language="javascript"}
```javascript
// ── Production API client: retry with exponential backoff, timeout, cancellation ──

class ApiClient {
    constructor(baseURL, defaultOptions = {}) {
        this.baseURL = baseURL;
        this.defaultOptions = {
            timeout: 10000,
            retries: 3,
            backoffFactor: 2,
            initialDelay: 100,
            ...defaultOptions,
        };
    }

    async request(path, options = {}) {
        const opts = { ...this.defaultOptions, ...options };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

        let lastError;
        for (let attempt = 0; attempt <= opts.retries; attempt++) {
            try {
                const response = await fetch(`${this.baseURL}${path}`, {
                    ...opts,
                    signal: opts.signal ?? controller.signal,  // allow external cancellation
                    headers: { "Content-Type": "application/json", ...opts.headers },
                });

                if (!response.ok) {
                    // Retry on 5xx (server errors), throw on 4xx (client errors)
                    if (response.status >= 500 && attempt < opts.retries) {
                        throw new Error(`Server error: ${response.status}`);
                    }
                    const body = await response.json().catch(() => null);
                    throw new ApiError(response.status, body?.message || response.statusText, body);
                }

                clearTimeout(timeoutId);
                return response.status === 204 ? null : await response.json();
            } catch (error) {
                clearTimeout(timeoutId);
                if (error.name === "AbortError") throw new Error("Request cancelled or timed out");
                if (error instanceof ApiError) throw error;  // don't retry client errors

                lastError = error;
                if (attempt < opts.retries) {
                    const delay = opts.initialDelay * Math.pow(opts.backoffFactor, attempt);
                    await new Promise(r => setTimeout(r, delay));  // exponential backoff
                }
            }
        }
        throw lastError;  // all retries exhausted
    }

    get(path, options)    { return this.request(path, { ...options, method: "GET" }); }
    post(path, body, options)   { return this.request(path, { ...options, method: "POST", body: JSON.stringify(body) }); }
    put(path, body, options)    { return this.request(path, { ...options, method: "PUT", body: JSON.stringify(body) }); }
    delete(path, options) { return this.request(path, { ...options, method: "DELETE" }); }
}

class ApiError extends Error {
    constructor(status, message, body) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.body = body;
    }
}

// ── Usage ──
const api = new ApiClient("https://api.example.com", { retries: 3, timeout: 5000 });
try {
    const user = await api.get("/users/1");
    const created = await api.post("/users", { name: "Alice" });
} catch (error) {
    if (error instanceof ApiError) console.error(`API ${error.status}: ${error.message}`);
    else console.error("Network error:", error.message);
}

// Cancellation (AbortController):
const cancelController = new AbortController();
api.get("/slow-endpoint", { signal: cancelController.signal })
    .catch(err => console.log("cancelled:", err.message));
cancelController.abort();  // cancel the request
```
::

## Project 3: Virtual DOM Diffing Engine

::code-wrapper{language="javascript"}
```javascript
// ── Minimal virtual DOM: createElement, diff, and patch the real DOM ──

// ── Create a virtual node (vnode) ──
function h(tag, props = {}, ...children) {
    return {
        tag,
        props: props || {},
        children: children.flat().map(child =>
            typeof child === "string" || typeof child === "number"
                ? { tag: "TEXT", props: {}, text: String(child) }  // wrap text
                : child
        ),
    };
}

// ── Render a vnode to a real DOM node ──
function render(vnode) {
    if (vnode.tag === "TEXT") return document.createTextNode(vnode.text);
    const el = document.createElement(vnode.tag);
    for (const [key, value] of Object.entries(vnode.props)) {
        if (key.startsWith("on") && typeof value === "function") {
            el.addEventListener(key.slice(2).toLowerCase(), value);  // event handler
        } else if (key === "style" && typeof value === "object") {
            Object.assign(el.style, value);  // style object
        } else if (key === "className") {
            el.setAttribute("class", value);
        } else {
            el.setAttribute(key, value);
        }
    }
    for (const child of vnode.children) el.appendChild(render(child));
    return el;
}

// ── Diff two vnodes and patch the real DOM ──
function patch(parent, oldVNode, newVNode, index = 0) {
    const el = parent.childNodes[index];

    if (!oldVNode) {
        // New node — append
        parent.appendChild(render(newVNode));
    } else if (!newVNode) {
        // Removed — delete
        parent.removeChild(el);
    } else if (isChanged(oldVNode, newVNode)) {
        // Changed — replace
        parent.replaceChild(render(newVNode), el);
    } else if (oldVNode.tag === newVNode.tag) {
        // Same tag — diff props and children
        patchProps(el, oldVNode.props, newVNode.props);
        const max = Math.max(oldVNode.children.length, newVNode.children.length);
        for (let i = 0; i < max; i++) {
            patch(el, oldVNode.children[i], newVNode.children[i], i);
        }
    }
}

function isChanged(oldV, newV) {
    return oldV.tag !== newV.tag ||
        (oldV.tag === "TEXT" && oldV.text !== newV.text);
}

function patchProps(el, oldProps, newProps) {
    // Remove old props
    for (const key of Object.keys(oldProps)) {
        if (!(key in newProps)) {
            if (key.startsWith("on")) el.removeEventListener(key.slice(2).toLowerCase(), oldProps[key]);
            else el.removeAttribute(key);
        }
    }
    // Set new/changed props
    for (const [key, value] of Object.entries(newProps)) {
        if (oldProps[key] !== value) {
            if (key.startsWith("on") && typeof value === "function") {
                if (oldProps[key]) el.removeEventListener(key.slice(2).toLowerCase(), oldProps[key]);
                el.addEventListener(key.slice(2).toLowerCase(), value);
            } else if (key === "className") {
                el.setAttribute("class", value);
            } else {
                el.setAttribute(key, value);
            }
        }
    }
}

// ── Usage ──
const oldTree = h("div", { id: "app" },
    h("h1", {}, "Hello"),
    h("p", { className: "desc" }, "World"),
);
const newTree = h("div", { id: "app" },
    h("h1", {}, "Hello Updated"),
    h("p", { className: "desc", style: { color: "red" } }, "World"),
    h("button", { onClick: () => alert("clicked") }, "Click"),
);
const container = document.querySelector("#root");
container.appendChild(render(oldTree));  // initial render
patch(container, oldTree, newTree);  // diff and patch (minimal DOM updates)
```
::

## Project 4: WebSocket Real-Time Chat

::code-wrapper{language="javascript"}
```javascript
// ── WebSocket client with reconnection, heartbeat, and message queuing ──

class ChatClient {
    constructor(url, options = {}) {
        this.url = url;
        this.options = {
            heartbeatInterval: 30000,
            reconnectDelay: 1000,
            maxReconnectDelay: 30000,
            ...options,
        };
        this.ws = null;
        this.reconnectAttempts = 0;
        this.messageQueue = [];  // messages sent while disconnected
        this.handlers = new Map();  // event handlers
        this.heartbeatId = null;
        this.shouldReconnect = true;
    }

    connect() {
        this.ws = new WebSocket(this.url);
        this.ws.onopen = () => {
            this.reconnectAttempts = 0;
            this.flushQueue();  // send queued messages
            this.startHeartbeat();
            this.emit("connected");
        };
        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.emit(message.type, message.data);  // dispatch to handlers
        };
        this.ws.onclose = () => {
            this.stopHeartbeat();
            if (this.shouldReconnect) this.scheduleReconnect();
            this.emit("disconnected");
        };
        this.ws.onerror = (error) => this.emit("error", error);
    }

    send(type, data) {
        const message = JSON.stringify({ type, data, timestamp: Date.now() });
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(message);
        } else {
            this.messageQueue.push(message);  // queue if disconnected
        }
    }

    on(event, handler) {
        if (!this.handlers.has(event)) this.handlers.set(event, new Set());
        this.handlers.get(event).add(handler);
        return () => this.handlers.get(event)?.delete(handler);  // unsubscribe
    }

    emit(event, data) { this.handlers.get(event)?.forEach(fn => fn(data)); }

    flushQueue() {
        while (this.messageQueue.length) this.ws.send(this.messageQueue.shift());
    }

    startHeartbeat() {
        this.heartbeatId = setInterval(() => this.send("ping", {}), this.options.heartbeatInterval);
    }

    stopHeartbeat() { if (this.heartbeatId) clearInterval(this.heartbeatId); }

    scheduleReconnect() {
        const delay = Math.min(
            this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts),
            this.options.maxReconnectDelay,
        );
        this.reconnectAttempts++;
        setTimeout(() => this.connect(), delay);
    }

    disconnect() {
        this.shouldReconnect = false;
        this.stopHeartbeat();
        this.ws?.close(1000, "client disconnect");
    }
}

// ── Usage ──
const chat = new ChatClient("wss://chat.example.com/ws");
chat.on("connected", () => console.log("connected to chat"));
chat.on("message", (data) => console.log(`${data.user}: ${data.text}`));
chat.on("disconnected", () => console.log("disconnected — reconnecting..."));
chat.connect();
chat.send("message", { user: "Alice", text: "Hello, world!" });  // queues if not connected
```
::

## Project 5: Debounce, Throttle, and Memoize Utilities

::code-wrapper{language="javascript"}
```javascript
// ── Production-grade utility functions with edge-case handling ──

// ── Debounce: delay execution until calls stop for `wait` ms ──
function debounce(fn, wait, { leading = false, trailing = true } = {}) {
    let timerId = null;
    let lastArgs = null;
    function debounced(...args) {
        lastArgs = args;
        if (timerId) clearTimeout(timerId);
        if (leading && !timerId) fn.apply(this, args);  // call immediately on first
        timerId = setTimeout(() => {
            timerId = null;
            if (trailing && lastArgs) fn.apply(this, lastArgs);  // call on trailing
        }, wait);
    }
    debounced.cancel = () => { clearTimeout(timerId); timerId = null; };
    debounced.flush = () => { if (timerId) { clearTimeout(timerId); timerId = null; fn.apply(this, lastArgs); } };
    return debounced;
}

// ── Throttle: execute at most once per `wait` ms ──
function throttle(fn, wait, { leading = true, trailing = true } = {}) {
    let lastCall = 0;
    let timerId = null;
    let lastArgs = null;
    function throttled(...args) {
        const now = Date.now();
        lastArgs = args;
        const remaining = wait - (now - lastCall);
        if (remaining <= 0 || remaining > wait) {
            if (timerId) { clearTimeout(timerId); timerId = null; }
            lastCall = now;
            fn.apply(this, args);
        } else if (trailing && !timerId) {
            timerId = setTimeout(() => {
                lastCall = Date.now();
                timerId = null;
                fn.apply(this, lastArgs);
            }, remaining);
        }
    }
    throttled.cancel = () => { clearTimeout(timerId); timerId = null; lastCall = 0; };
    return throttled;
}

// ── Memoize: cache results by argument identity (WeakMap for objects) ──
function memoize(fn) {
    const primitiveCache = new Map();   // for primitive args
    const objectCache = new WeakMap();  // for object args (GC'd when key is GC'd)
    return function memoized(...args) {
        if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
            if (objectCache.has(args[0])) return objectCache.get(args[0]);
            const result = fn.apply(this, args);
            objectCache.set(args[0], result);
            return result;
        }
        const key = JSON.stringify(args);
        if (primitiveCache.has(key)) return primitiveCache.get(key);
        const result = fn.apply(this, args);
        primitiveCache.set(key, result);
        return result;
    };
}

// ── Usage ──
const debouncedSearch = debounce((query) => fetchResults(query), 300);
input.addEventListener("input", (e) => debouncedSearch(e.target.value));

const throttledScroll = throttle(() => updateProgress(), 100);
window.addEventListener("scroll", throttledScroll);

const expensiveCalc = memoize((n) => {
    console.log("computing...");
    return n * 2;
});
```
::

## Spot the Bug: Memory Leak in Event Listener

::code-wrapper{language="javascript"}
```javascript
function setupWidget() {
    const button = document.querySelector("#btn");
    const heavyData = new Array(1_000_000).fill(0);
    button.addEventListener("click", function onClick() {
        process(heavyData);  // closure captures heavyData
    });
    return () => button.removeEventListener("click", onClick);
}
const cleanup = setupWidget();
// cleanup() is never called → heavyData stays in memory forever
```
::

<details>
<summary>Answer</summary>

The `onClick` function is defined as a function expression assigned to a variable inside `setupWidget`. But the `removeEventListener` call in the cleanup function references `onClick` — which is a **named function expression**. The name `onClick` is only available inside the function body, not in the outer scope.

So `removeEventListener("click", onClick)` will throw a `ReferenceError: onClick is not defined` — the listener is never removed, `heavyData` (8MB) stays in memory, and the button keeps triggering the handler even after the widget is "destroyed."

**Fix**: declare the handler in the outer scope so `removeEventListener` can reference it:

```javascript
function setupWidget() {
    const button = document.querySelector("#btn");
    const heavyData = new Array(1_000_000).fill(0);
    function onClick() {       // ✅ declared in setupWidget's scope
        process(heavyData);
    }
    button.addEventListener("click", onClick);
    return () => button.removeEventListener("click", onClick);  // ✅ can reference onClick
}
const cleanup = setupWidget();
cleanup();  // ✅ listener removed, heavyData can be GC'd
```

**The lesson**: `removeEventListener` requires a reference to the **exact same function object** that was passed to `addEventListener`. Named function expressions (`const fn = function name() {}`) have the name available only inside the function — not in the enclosing scope. Always store the handler reference where the cleanup function can access it.

</details>