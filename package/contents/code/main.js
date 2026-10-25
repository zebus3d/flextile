// FlexTile: auto-tiling you can switch on and off per desktop, COSMIC style.
//
// Each (virtual desktop, screen) pair has its own binary split tree. While
// tiling is off for that pair, windows float as in plain Plasma. Minimized,
// fullscreen and floating windows simply leave the tree; the rest of the
// windows fill the gap and the window goes back in when it returns.

"use strict";

// ---------------------------------------------------------------- config ---

const cfg = {};

function loadConfig() {
    cfg.gapInner = Number(readConfig("gapInner", 8));
    cfg.gapOuter = Number(readConfig("gapOuter", 8));
    cfg.tileByDefault = readConfig("tileByDefault", false) === true
        || readConfig("tileByDefault", false) === "true";
    cfg.createDesktops = readConfig("createDesktops", true) !== false
        && readConfig("createDesktops", true) !== "false";
    cfg.floatClasses = String(readConfig("floatClasses",
        "org.kde.plasmashell,org.kde.krunner,org.kde.spectacle,org.kde.polkit-kde-authentication-agent-1,"
        + "org.kde.kdeconnect.daemon,yakuake,org.kde.yakuake,steam,pinentry-qt,org.kde.kcalc"))
        .split(",").map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
}

// ----------------------------------------------------------------- state ---

const trees = {};        // key -> { enabled, root }
const userFloat = {};    // window id -> true when the user floated it (Meta+G)
const savedGeom = {};    // window id -> geometry it had before being tiled
const hooked = {};       // window id -> true once its signals are connected
const pendingRestore = {}; // window id -> window to un-tile once its desktop is shown

function wid(w) { return String(w.internalId); }

function treeKey(desktop, output) {
    return desktop.id + "|" + output.name;
}

function treeFor(desktop, output) {
    const key = treeKey(desktop, output);
    if (!trees[key]) {
        trees[key] = { enabled: cfg.tileByDefault, root: null, desktop: desktop, output: output };
    }
    return trees[key];
}

// ------------------------------------------------------------------ tree ---
// Leaf:  { w, parent, rect }
// Split: { horiz, ratio, a, b, parent, rect }   horiz = side by side

function leaves(node, out) {
    out = out || [];
    if (!node) return out;
    if (node.w) out.push(node);
    else { leaves(node.a, out); leaves(node.b, out); }
    return out;
}

function findLeaf(tree, w) {
    const id = wid(w);
    return leaves(tree.root).find(l => wid(l.w) === id) || null;
}

function replaceNode(tree, oldNode, newNode) {
    const p = oldNode.parent;
    newNode.parent = p;
    if (!p) tree.root = newNode;
    else if (p.a === oldNode) p.a = newNode;
    else p.b = newNode;
}

function insertWindow(tree, w, target) {
    const leaf = { w: w, parent: null, rect: null };
    if (!tree.root) { tree.root = leaf; return; }
    if (!target) {
        // No focused tile to split: split the biggest one.
        target = leaves(tree.root).reduce((best, l) =>
            (!best || area(l.rect) > area(best.rect)) ? l : best, null);
    }
    const r = target.rect || tileArea(tree);
    const split = { horiz: r.width >= r.height, ratio: 0.5, a: target, b: leaf, parent: null, rect: r };
    replaceNode(tree, target, split);
    target.parent = split;
    leaf.parent = split;
}

function removeLeaf(tree, leaf) {
    const p = leaf.parent;
    if (!p) { tree.root = null; return; }
    const sibling = p.a === leaf ? p.b : p.a;
    replaceNode(tree, p, sibling);
}

function rect(x, y, width, height) { return { x: x, y: y, width: width, height: height }; }

function area(r) { return r ? r.width * r.height : 0; }

// ---------------------------------------------------------------- layout ---

function tileArea(tree) {
    const a = workspace.clientArea(KWin.PlacementArea, tree.output, tree.desktop);
    const g = cfg.gapOuter;
    return { x: a.x + g, y: a.y + g, width: a.width - 2 * g, height: a.height - 2 * g };
}

function computeRects(node, r) {
    node.rect = r;
    if (node.w) return;
    const gap = cfg.gapInner;
    if (node.horiz) {
        const wa = Math.round((r.width - gap) * node.ratio);
        computeRects(node.a, { x: r.x, y: r.y, width: wa, height: r.height });
        computeRects(node.b, { x: r.x + wa + gap, y: r.y, width: r.width - wa - gap, height: r.height });
    } else {
        const ha = Math.round((r.height - gap) * node.ratio);
        computeRects(node.a, { x: r.x, y: r.y, width: r.width, height: ha });
        computeRects(node.b, { x: r.x, y: r.y + ha + gap, width: r.width, height: r.height - ha - gap });
    }
}

let applying = false;

function applyTree(tree) {
    if (!tree.root) return;
    computeRects(tree.root, tileArea(tree));
    applying = true;
    try {
        for (const l of leaves(tree.root)) {
            const w = l.w;
            if (w.fullScreen || w.maximizeMode === 3) continue;   // keeps its slot
            if (w.maximizeMode !== 0) w.setMaximize(false, false);
            w.frameGeometry = rect(l.rect.x, l.rect.y, l.rect.width, l.rect.height);
        }
    } finally {
        applying = false;
    }
}

// --------------------------------------------------------------- windows ---

function isTileable(w) {
    if (!w || w.deleted || !w.managed) return false;
    if (!w.normalWindow || w.transient || w.dialog || w.specialWindow || w.popupWindow) return false;
    if (!w.moveable || !w.resizeable) return false;
    if (w.skipTaskbar || w.onAllDesktops || w.desktops.length !== 1) return false;
    if (w.minimized || w.fullScreen || userFloat[wid(w)]) return false;
    const cls = String(w.resourceClass).toLowerCase();
    const name = String(w.resourceName).toLowerCase();
    if (cfg.floatClasses.indexOf(cls) >= 0 || cfg.floatClasses.indexOf(name) >= 0) return false;
    return true;
}

// Where the window should be tiled right now, or null if it should float.
function desiredTree(w) {
    if (!isTileable(w) || !w.output) return null;
    const tree = treeFor(w.desktops[0], w.output);
    return tree.enabled ? tree : null;
}

function onCurrentDesktop(w) {
    return w.onAllDesktops || w.desktops.some(d => d.id === workspace.currentDesktop.id);
}

function restoreFloating(w) {
    const g = savedGeom[wid(w)];
    if (!g || w.deleted) return;
    // A hidden Wayland window drops the resize, so wait until it is on screen.
    if (!onCurrentDesktop(w)) { pendingRestore[wid(w)] = w; return; }
    delete savedGeom[wid(w)];
    delete pendingRestore[wid(w)];
    const a = workspace.clientArea(KWin.PlacementArea, w.output, w.desktops[0] || workspace.currentDesktop);
    // Keep the old size but make sure it lands on the window's current screen.
    const width = Math.min(g.width, a.width), height = Math.min(g.height, a.height);
    const x = Math.max(a.x, Math.min(g.x, a.x + a.width - width));
    const y = Math.max(a.y, Math.min(g.y, a.y + a.height - height));
    w.frameGeometry = rect(x, y, width, height);
}

// Bring every tree in line with the current window states, then lay out.
function sync() {
    const dirty = {};
    const active = workspace.activeWindow;

    // 1. Drop leaves whose window left the tree (closed, minimized, moved...).
    for (const key in trees) {
        const tree = trees[key];
        for (const l of leaves(tree.root)) {
            if (desiredTree(l.w) !== tree) {
                removeLeaf(tree, l);
                dirty[key] = tree;
                if (!l.w.deleted && !l.w.minimized && !desiredTree(l.w)) restoreFloating(l.w);
            }
        }
    }

    // 2. Add windows that should be tiled but are not yet.
    const wins = workspace.windowList().filter(w => desiredTree(w));
    // Left-to-right, top-to-bottom, so turning tiling on keeps a sensible order.
    wins.sort((p, q) => (p.x - q.x) || (p.y - q.y));
    for (const w of wins) {
        const tree = desiredTree(w);
        if (findLeaf(tree, w)) continue;
        if (!savedGeom[wid(w)]) {
            const g = w.frameGeometry;
            savedGeom[wid(w)] = { x: g.x, y: g.y, width: g.width, height: g.height };
        }
        if (tree.root) computeRects(tree.root, tileArea(tree));
        let target = null;
        if (active && active !== w) target = findLeaf(tree, active);
        insertWindow(tree, w, target);
        dirty[treeKey(tree.desktop, tree.output)] = tree;
    }

    for (const key in dirty) applyTree(dirty[key]);
}

function relayoutAll() {
    for (const key in trees) if (trees[key].enabled) applyTree(trees[key]);
}

function leafOf(w) {
    const tree = desiredTree(w);
    return tree ? { tree: tree, leaf: findLeaf(tree, w) } : null;
}

// After the user drags a tiled window: a move swaps it with the window under
// the cursor, a resize changes the split ratio of the edge they dragged.
function onMoveResizeFinished(w) {
    const t = leafOf(w);
    if (!t || !t.leaf || !t.leaf.rect) { sync(); return; }
    const r = t.leaf.rect, g = w.frameGeometry;
    const resized = Math.abs(g.width - r.width) > 2 || Math.abs(g.height - r.height) > 2;
    if (resized) {
        adjustRatio(t.leaf, r, g, true);
        adjustRatio(t.leaf, r, g, false);
    } else {
        const c = workspace.cursorPos;
        const other = leaves(t.tree.root).find(l => l !== t.leaf
            && c.x >= l.rect.x && c.x < l.rect.x + l.rect.width
            && c.y >= l.rect.y && c.y < l.rect.y + l.rect.height);
        if (other) swapLeaves(t.leaf, other);
    }
    applyTree(t.tree);
}

function adjustRatio(leaf, r, g, horiz) {
    const size = horiz ? "width" : "height", pos = horiz ? "x" : "y";
    if (Math.abs(g[size] - r[size]) <= 2) return;
    const farEdge = Math.abs(g[pos] - r[pos]) <= 2;   // right/bottom edge was dragged
    let node = leaf;
    while (node.parent) {
        const p = node.parent;
        if (p.horiz === horiz && (farEdge ? p.a === node : p.b === node)) {
            const pr = p.rect, gap = cfg.gapInner;
            const edge = farEdge ? g[pos] + g[size] + gap / 2 : g[pos] - gap / 2;
            p.ratio = Math.max(0.1, Math.min(0.9, (edge - pr[pos]) / pr[size]));
            return;
        }
        node = p;
    }
}

function swapLeaves(a, b) {
    const w = a.w;
    a.w = b.w;
    b.w = w;
}

function hook(w) {
    const id = wid(w);
    if (hooked[id]) return;
    hooked[id] = true;
    w.minimizedChanged.connect(sync);
    w.desktopsChanged.connect(sync);
    w.outputChanged.connect(sync);
    w.fullScreenChanged.connect(sync);
    w.maximizedChanged.connect(() => { if (!applying) sync(); relayoutAll(); });
    w.interactiveMoveResizeFinished.connect(() => onMoveResizeFinished(w));
}

// ------------------------------------------------------------ navigation ---

const DIRS = {
    left:  { dx: -1, dy: 0 },
    right: { dx: 1,  dy: 0 },
    up:    { dx: 0,  dy: -1 },
    down:  { dx: 0,  dy: 1 },
};

function center(r) { return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }

// Closest window in a direction, preferring ones that line up with the current.
function neighbour(from, dir, candidates) {
    const d = DIRS[dir], c = center(from.frameGeometry);
    let best = null, bestScore = Infinity;
    for (const w of candidates) {
        if (w === from) continue;
        const o = center(w.frameGeometry);
        const along = (o.x - c.x) * d.dx + (o.y - c.y) * d.dy;
        if (along <= 1) continue;
        const across = Math.abs((o.x - c.x) * d.dy) + Math.abs((o.y - c.y) * d.dx);
        const score = along + 2 * across;
        if (score < bestScore) { best = w; bestScore = score; }
    }
    return best;
}

function visibleWindows() {
    return workspace.stackingOrder.filter(w => w.normalWindow && w.managed && !w.deleted
        && !w.minimized && !w.skipTaskbar && w.wantsInput
        && onCurrentDesktop(w));
}

function focus(dir) {
    const wins = visibleWindows();
    const active = workspace.activeWindow;
    if (!active || wins.indexOf(active) < 0) {
        if (wins.length) workspace.activeWindow = wins[wins.length - 1];
        return;
    }
    const n = neighbour(active, dir, wins);
    if (n) workspace.activeWindow = n;
}

function move(dir) {
    const w = workspace.activeWindow;
    if (!w) return;
    const t = leafOf(w);
    if (t && t.leaf) {
        const others = leaves(t.tree.root).map(l => l.w);
        const n = neighbour(w, dir, others);
        if (n) {
            swapLeaves(t.leaf, findLeaf(t.tree, n));
            applyTree(t.tree);
        } else {
            // Nothing that way on this screen: hop to the next screen.
            workspace[{ left: "slotWindowToLeftScreen", right: "slotWindowToRightScreen",
                        up: "slotWindowToAboveScreen", down: "slotWindowToBelowScreen" }[dir]]();
        }
        return;
    }
    // Floating: behave like plain Plasma and snap to that half of the screen.
    workspace[{ left: "slotWindowQuickTileLeft", right: "slotWindowQuickTileRight",
                up: "slotWindowQuickTileTop", down: "slotWindowQuickTileBottom" }[dir]]();
}

// --------------------------------------------------------------- actions ---

function osd(text, icon) {
    callDBus("org.kde.plasmashell", "/org/kde/osdService", "org.kde.osdService",
        "showText", icon || "view-grid", text);
}

function currentTree() {
    return treeFor(workspace.currentDesktop, workspace.activeScreen);
}

function toggleTiling() {
    const tree = currentTree();
    tree.enabled = !tree.enabled;
    if (!tree.enabled) {
        for (const l of leaves(tree.root)) restoreFloating(l.w);
        tree.root = null;
    }
    sync();
    osd(tree.enabled ? "Tiling on" : "Tiling off", tree.enabled ? "view-grid" : "window");
}

function toggleFloat() {
    const w = workspace.activeWindow;
    if (!w) return;
    const id = wid(w);
    if (userFloat[id]) delete userFloat[id];
    else if (leafOf(w)) userFloat[id] = true;
    else return;   // already floating on a desktop without tiling
    sync();
    if (userFloat[id]) workspace.raiseWindow(w);
    osd(userFloat[id] ? "Window floating" : "Window tiled", userFloat[id] ? "window" : "view-grid");
}

function toggleOrientation() {
    const w = workspace.activeWindow;
    const t = w ? leafOf(w) : null;
    if (!t || !t.leaf || !t.leaf.parent) return;
    t.leaf.parent.horiz = !t.leaf.parent.horiz;
    applyTree(t.tree);
}

function toggleMaximize() {
    const w = workspace.activeWindow;
    if (!w || !w.maximizable) return;
    const on = w.maximizeMode !== 3;
    w.setMaximize(on, on);
}

function minimize() {
    const w = workspace.activeWindow;
    if (w && w.minimizable) w.minimized = true;
}

function closeWindow() {
    const w = workspace.activeWindow;
    if (w && w.closeable) w.closeWindow();
}

function desktopAt(n) {
    while (cfg.createDesktops && workspace.desktops.length < n) {
        workspace.createDesktop(workspace.desktops.length, "");
    }
    return workspace.desktops[n - 1] || null;
}

function goToDesktop(n) {
    const d = desktopAt(n);
    if (d) workspace.currentDesktop = d;
}

function sendToDesktop(n) {
    const w = workspace.activeWindow;
    const d = desktopAt(n);
    if (w && d && !w.onAllDesktops) w.desktops = [d];
}

// ------------------------------------------------------------------ init ---

function shortcut(id, text, keys, fn) {
    registerShortcut("FlexTile: " + id, "FlexTile: " + text, keys, fn);
}

loadConfig();

shortcut("Toggle Tiling", "Toggle tiling on this desktop", "Meta+Y", toggleTiling);
shortcut("Toggle Floating", "Float or tile the active window", "Meta+G", toggleFloat);
shortcut("Toggle Orientation", "Flip split orientation", "Meta+O", toggleOrientation);
shortcut("Toggle Maximize", "Maximize or restore the active window", "Meta+M", toggleMaximize);
shortcut("Minimize", "Minimize the active window", "Meta+H", minimize);
shortcut("Close", "Close the active window", "Meta+Q", closeWindow);
for (const dir of ["Left", "Right", "Up", "Down"]) {
    const d = dir.toLowerCase();
    shortcut("Focus " + dir, "Focus window " + d, "Meta+" + dir, () => focus(d));
    shortcut("Move " + dir, "Move window " + d, "Meta+Shift+" + dir, () => move(d));
}
for (let n = 1; n <= 9; n++) {
    shortcut("Desktop " + n, "Go to desktop " + n, "Meta+" + n, () => goToDesktop(n));
    shortcut("Window to Desktop " + n, "Move window to desktop " + n, "Meta+Shift+" + n, () => sendToDesktop(n));
}

workspace.windowAdded.connect(w => { hook(w); sync(); });
workspace.windowRemoved.connect(w => { delete hooked[wid(w)]; delete pendingRestore[wid(w)]; delete userFloat[wid(w)]; delete savedGeom[wid(w)]; sync(); });
workspace.screensChanged.connect(() => { sync(); relayoutAll(); });
workspace.virtualScreenGeometryChanged.connect(relayoutAll);
workspace.desktopsChanged.connect(sync);
workspace.currentDesktopChanged.connect(() => {
    for (const id in pendingRestore) {
        const w = pendingRestore[id];
        if (w.deleted) delete pendingRestore[id];
        else if (!desiredTree(w)) restoreFloating(w);
        else delete pendingRestore[id];
    }
});
options.configChanged.connect(() => { loadConfig(); sync(); relayoutAll(); });

for (const w of workspace.windowList()) hook(w);
sync();
