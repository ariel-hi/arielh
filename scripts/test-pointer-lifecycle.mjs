// Exercise production pointer input and round boundaries without a browser or network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tests = [];
const test = (name, run, options = {}) => tests.push({ name, run, game: name.startsWith('Grid16') ? 'grid16' : 'shooter', ...options });
let requestedGame = null;
for (const arg of process.argv.slice(2)) {
    if (requestedGame || !/^--game=(grid16|shooter)$/.test(arg)) {
        throw new Error('Usage: node scripts/test-pointer-lifecycle.mjs [--game=grid16|shooter]');
    }
    requestedGame = arg.slice('--game='.length);
}

class Surface {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, handler) {
        const handlers = this.listeners.get(type) || [];
        handlers.push(handler);
        this.listeners.set(type, handlers);
    }
    dispatchEvent(event) {
        event.target ??= this;
        for (const handler of this.listeners.get(event.type) || []) handler(event);
        return !event.defaultPrevented;
    }
}
class BrowserEvent {
    constructor(type, options = {}) { this.type = type; Object.assign(this, options); }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this.propagationStopped = true; }
}

function gridFixture() {
    const window = new Surface();
    const document = new Surface();
    const elements = new Map();
    function get(id) {
        if (elements.has(id)) return elements.get(id);
        const node = new Surface();
        const classes = new Set();
        Object.assign(node, {
            style: {}, value: '', textContent: '',
            classList: {
                add: name => classes.add(name), remove: name => classes.delete(name),
                contains: name => classes.has(name)
            },
            focus() {
                document.activeElement = node;
                document.dispatchEvent(new BrowserEvent('focusin', { target: node }));
            },
            scrollIntoView() {},
            closest(selector) {
                if ((id === 'player-name' && selector.includes('input')) ||
                    (id === 'nav-control' && selector.includes('nav')) ||
                    (id.endsWith('-btn') && selector.includes('button'))) return node;
                return null;
            }
        });
        elements.set(id, node);
        return node;
    }
    const canvas = get('game-canvas');
    canvas.getContext = () => new Proxy({}, { get: () => () => {} });
    const pad = get('dpad');
    const nub = get('dpad-center');
    pad.querySelector = () => nub;
    const overlays = ['title-screen', 'gameover-screen', 'board-screen'];
    get('gameover-screen').classList.add('hidden');
    get('board-screen').classList.add('hidden');
    document.hidden = false;
    document.activeElement = canvas;
    document.getElementById = get;
    document.querySelector = selector => selector === '.overlay:not(.hidden)'
        ? overlays.map(get).find(node => !node.classList.contains('hidden')) || null : null;
    window.matchMedia = () => ({ matches: false });
    const context = vm.createContext({
        window, document, navigator: { maxTouchPoints: 0 },
        devicePixelRatio: 1, innerWidth: 960, innerHeight: 640,
        addEventListener: window.addEventListener.bind(window), requestAnimationFrame() {},
        performance: { now: () => 0 }, GAME_SIZE: 200,
        AudioEngine: class { init() {} resume() {} playGameOver() {} },
        createAllGames: count => Array.from({ length: count }, () => ({
            name: 'Fixture game', hint: 'Fixture hint', controls: ['left'], color: '#00ffaa', failed: false
        })),
        submitScore: async () => {}, fetchLeaderboard: async () => []
    });
    vm.runInContext(read('grid16/js/input.js').replace('export class InputManager', 'class InputManager'), context);
    vm.runInContext(read('grid16/js/main.js').replace(/^import .*\r?\n/gm, ''), context);
    const run = code => vm.runInContext(code, context);
    get('start-btn').onclick();
    const input = run('input');
    const mouse = (surface, type, x, buttons = 1, button = 0) => surface.dispatchEvent(new BrowserEvent(type, {
        target: canvas, clientX: x, clientY: 100, button, buttons
    }));
    const drag = () => {
        mouse(document, 'mousedown', 100);
        mouse(window, 'mousemove', 150);
        assert.equal(input.keys.right, true, 'Fixture must establish an actual drag');
    };
    const neutral = () => {
        assert.equal(Object.values(input.keys).some(Boolean), false, 'Direction must be neutral');
        assert.equal(pad.style.opacity, '0', 'Released joystick must be hidden');
        assert.equal(pad.classList.contains('active'), false, 'Released joystick must be inactive');
        assert.equal(nub.style.transform, 'translate(0, 0)', 'Released joystick must return to its origin');
    };
    return { window, document, get, input, mouse, drag, neutral, run, canvas };
}

test('Grid16 blur releases pointer state and later hovering cannot steer', () => {
    const h = gridFixture();
    h.drag();
    h.window.dispatchEvent(new BrowserEvent('blur'));
    h.mouse(h.window, 'mousemove', 160, 0);
    h.neutral();
});

test('Grid16 hiding the page releases an active drag', () => {
    const h = gridFixture();
    h.drag();
    h.document.hidden = true;
    h.document.dispatchEvent(new BrowserEvent('visibilitychange'));
    h.neutral();
    h.document.hidden = false;
    h.document.dispatchEvent(new BrowserEvent('visibilitychange'));
    h.mouse(h.window, 'mousemove', 170, 0);
    h.neutral();
});

test('Grid16 actual round retry resets the previous drag', async () => {
    const h = gridFixture();
    h.drag();
    await h.run('gameOver();');
    h.get('restart-btn').onclick();
    h.mouse(h.window, 'mousemove', 160, 0);
    h.neutral();
    assert.equal(h.run('state'), h.run('ST.STARTING'));
});

test('Grid16 losing the primary mouse button cancels steering', () => {
    const h = gridFixture();
    h.drag();
    h.mouse(h.window, 'mousemove', 160, 0);
    h.neutral();
    h.mouse(h.document, 'mousedown', 200);
    h.mouse(h.window, 'mousemove', 150);
    assert.equal(h.input.keys.left, true, 'A fresh primary-button drag must still work');
});

test('Grid16 nonprimary mouse buttons do not start or cancel a primary drag', () => {
    const h = gridFixture();
    h.mouse(h.document, 'mousedown', 100, 2, 2);
    h.mouse(h.window, 'mousemove', 150, 2);
    h.neutral();
    h.drag();
    h.mouse(h.document, 'mousedown', 100, 3, 2);
    h.mouse(h.window, 'mouseup', 150, 1, 2);
    h.mouse(h.window, 'mousemove', 160, 1);
    assert.equal(h.input.keys.right, true);
    h.mouse(h.window, 'mouseup', 160, 0);
    h.neutral();
});

test('Grid16 game-over and navigation focus release input without capturing controls', async () => {
    const h = gridFixture();
    h.drag();
    await h.run('gameOver();');
    h.neutral();
    h.get('restart-btn').onclick();
    h.drag();
    const nav = h.get('nav-control');
    nav.focus();
    h.neutral();
    const arrow = new BrowserEvent('keydown', { key: 'ArrowRight', target: nav });
    h.window.dispatchEvent(arrow);
    assert.equal(Boolean(arrow.defaultPrevented), false);
    h.neutral();
});

test('Grid16 touch movement works after interruption and ends cleanly', () => {
    const h = gridFixture();
    const touch = (type, x, touches = [{ clientX: x, clientY: 100 }]) => h.document.dispatchEvent(new BrowserEvent(type, {
        target: h.canvas, touches, cancelable: true
    }));
    touch('touchstart', 100); touch('touchmove', 150);
    assert.equal(h.input.keys.right, true);
    h.window.dispatchEvent(new BrowserEvent('blur'));
    touch('touchmove', 160);
    h.neutral();
    touch('touchstart', 200); touch('touchmove', 150);
    assert.equal(h.input.keys.left, true);
    touch('touchend', 150, []);
    h.neutral();
});

test('Grid16 ordinary keys work while native modifier shortcuts remain available', () => {
    const h = gridFixture();
    const arrow = options => new BrowserEvent('keydown', { key: 'ArrowRight', target: h.canvas, ...options });
    for (const modifier of ['altKey', 'metaKey', 'ctrlKey']) {
        const event = arrow({ [modifier]: true });
        h.window.dispatchEvent(event);
        assert.equal(Boolean(event.defaultPrevented), false);
        assert.equal(h.input.keys.right, false);
    }
    const normal = arrow();
    h.window.dispatchEvent(normal);
    assert.equal(normal.defaultPrevented, true);
    assert.equal(h.input.keys.right, true);
    h.window.dispatchEvent(new BrowserEvent('keyup', { key: 'ArrowRight', target: h.canvas }));
    h.neutral();
});

function shooterFixture(version) {
    const window = new Surface();
    const document = new Surface();
    const canvas = new Surface();
    const mute = { closest: selector => selector.includes('#mute-toggle') ? mute : null };
    const messages = [];
    let shots = 0;
    class Player {
        constructor(x = 400) { this.x = x; this.movingLeft = false; this.movingRight = false; this.velocity = 0; }
        shoot() { shots++; }
        moveLeft() { this.movingLeft = true; this.movingRight = false; this.velocity = -1; }
        moveRight() { this.movingLeft = false; this.movingRight = true; this.velocity = 1; }
        stopMoving() { this.movingLeft = false; this.movingRight = false; this.velocity = 0; }
        isMovingLeft() { return this.movingLeft; }
        isMovingRight() { return this.movingRight; }
        update(delta) { this.x += this.velocity * delta; }
    }
    const stage = {
        _events: {},
        on(type, fn) { this._events[type] = { fn, context: this, once: false }; },
        dispatch(type, event) { this._events[type]?.fn(event); }
    };
    const config = { GAME: { WIDTH: 800, HEIGHT: 600 } };
    document.hidden = false;
    document.getElementById = id => id === 'mute-toggle' ? mute : null;
    document.querySelector = selector => selector.includes('canvas') ? canvas : null;
    window.parent = { postMessage: (message, origin) => messages.push({ message, origin }) };
    window.location = { origin: 'https://arielh.com' };
    const context = vm.createContext({
        window, document, KeyboardEvent: BrowserEvent, queueMicrotask,
        console: { log() {} },
        // Both original class forms use the same controlled player and rendering dependencies.
        Player, CONFIG: config, PIXI: { Rectangle: class {} },
        So: Player, v: config, X: class {}
    });
    const scripts = [...read('shooter_game/index.html').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
        .map(match => match[1]);
    const releaseScript = scripts.find(script => script.includes('releaseGameControls'));
    assert.ok(releaseScript, 'Production iframe release hook must exist');
    vm.runInContext(releaseScript, context);
    let prototype;
    if (version === 'source') {
        const source = read('shooter_game/src/core/Game.js').replace(/^import .*\r?\n/gm, '')
            .replace('export class Game', 'class Game');
        prototype = vm.runInContext(source + ';Game.prototype', context);
    } else {
        const bundle = read('shooter_game/shooter_game.js');
        const start = bundle.indexOf('var ra=class');
        const end = bundle.indexOf('var Ol=', start);
        assert.ok(start >= 0 && end > start, 'Production bundled game class must exist');
        prototype = vm.runInContext(bundle.slice(start, end) + ';ra.prototype', context);
    }
    const game = Object.assign(Object.create(prototype), {
        gameOver: false, paused: false, touchControl: false, touchX: 0, shootPressed: false,
        app: { stage, view: canvas }, player: new Player(),
        gameContainer: { removeChildren() {} }, fxContainer: { removeChildren() {} }, uiContainer: { removeChildren() {} },
        scoreManager: { reset() {}, initialize() {}, setAsteroidsToUpgrade() {} },
        upgradeSystem: { reset() {} }, asteroidManager: { initialize() {}, update() {} },
        starfieldUpdate() {}, handleCollisions() {}, updateExplosions() {}
    });
    game.setupInputHandlers();
    function pointer(type, x, pointerType = 'touch', buttons = 1) {
        const native = new BrowserEvent(type, {
            target: canvas, pointerId: 11, pointerType, button: 0, buttons,
            clientX: x, clientY: 500
        });
        document.dispatchEvent(native);
        window.dispatchEvent(native);
        const event = {
            type, pointerId: 11, pointerType, button: 0, buttons,
            nativeEvent: native, originalEvent: native,
            data: { originalEvent: native, getLocalPosition: () => ({ x, y: 500 }) }
        };
        stage.dispatch(type, event);
    }
    const hold = (pointerType = 'touch') => {
        pointer('pointerdown', 700, pointerType);
        game.update(1);
        assert.equal(game.touchControl, true, 'Fixture must establish actual pointer steering');
        assert.equal(game.player.velocity, 1);
        assert.equal(shots, 1);
    };
    const neutral = expectedShots => {
        assert.equal(game.touchControl, false, 'Pointer steering mode must be released');
        assert.equal(game.shootPressed, false, 'Pointer fire must be released');
        assert.equal(game.player.velocity, 0, 'An update after interruption must not restore steering');
        assert.equal(shots, expectedShots, 'Interruption must not shoot again');
    };
    return { window, document, canvas, mute, game, pointer, hold, neutral, messages, shots: () => shots };
}

// Always execute the served bundle. The ignored authored source adds the same checks
// when present. Graphics/collisions/player are controlled; input/update/restart/hooks are real.
for (const version of ['source', 'bundle']) {
    const shooterTest = (name, run) => test(name, run, { authoredSource: version === 'source' });
    shooterTest(`Shooter ${version} blur releases touch steering before the next update`, () => {
        const h = shooterFixture(version);
        h.hold();
        h.window.dispatchEvent(new BrowserEvent('blur'));
        h.game.update(1);
        h.neutral(1);
        assert.equal(h.game.gameOver, false);
        assert.equal(h.game.paused, false);
    });

    shooterTest(`Shooter ${version} hiding the page releases pointer movement and fire`, () => {
        const h = shooterFixture(version);
        h.hold();
        h.document.hidden = true;
        h.document.dispatchEvent(new BrowserEvent('visibilitychange'));
        h.game.update(1);
        h.neutral(1);
    });

    shooterTest(`Shooter ${version} actual restart gives the new player neutral input`, async () => {
        const h = shooterFixture(version);
        h.hold();
        const previous = h.game.player;
        h.game.gameOver = true;
        h.game.restart();
        await Promise.resolve(); // Let the production post-restart hook run.
        assert.notEqual(h.game.player, previous);
        h.game.update(1);
        h.neutral(1);
        assert.equal(h.messages.length, 1);
        assert.equal(h.messages[0].message.type, 'ariel-game-start');
    });

    shooterTest(`Shooter ${version} losing the primary mouse or pen button cancels pointer mode`, () => {
        for (const pointerType of ['mouse', 'pen']) {
            const h = shooterFixture(version);
            h.hold(pointerType);
            h.pointer('pointermove', 650, pointerType, 0);
            h.game.update(1);
            h.neutral(1);
        }
    });

    shooterTest(`Shooter ${version} native pointer cancellation stops touch continuation`, () => {
        const h = shooterFixture(version);
        h.hold();
        h.canvas.dispatchEvent(new BrowserEvent('pointercancel', { pointerType: 'touch', pointerId: 11 }));
        h.pointer('pointermove', 650, 'touch', 0);
        h.game.update(1);
        h.neutral(1);
        h.pointer('pointerdown', 100);
        h.game.update(1);
        assert.equal(h.game.touchControl, true);
        assert.equal(h.game.player.velocity, -1);
    });

    shooterTest(`Shooter ${version} touch movement with zero buttons preserves steering and fire`, () => {
        const h = shooterFixture(version);
        h.hold();
        h.pointer('pointermove', 650, 'touch', 0);
        h.game.update(1);
        assert.equal(h.game.touchControl, true);
        assert.equal(h.game.shootPressed, true);
        assert.equal(h.game.player.velocity, 1);
        assert.equal(h.shots(), 2);
    });

    shooterTest(`Shooter ${version} mute focus releases the current pointer`, () => {
        const h = shooterFixture(version);
        h.hold();
        h.document.dispatchEvent(new BrowserEvent('focusin', { target: h.mute }));
        h.game.update(1);
        h.neutral(1);
    });

    shooterTest(`Shooter ${version} normal release allows fresh pointer control`, () => {
        const h = shooterFixture(version);
        h.hold();
        h.pointer('pointerup', 700, 'touch', 0);
        h.game.update(1);
        h.neutral(1);
        h.pointer('pointerdown', 100);
        h.game.update(1);
        assert.equal(h.game.touchControl, true);
        assert.equal(h.game.player.velocity, -1);
    });

    shooterTest(`Shooter ${version} mouse hovering leaves keyboard movement intact`, () => {
        const h = shooterFixture(version);
        h.window.dispatchEvent(new BrowserEvent('keydown', { code: 'KeyA' }));
        h.pointer('pointermove', 650, 'mouse', 0);
        h.game.update(1);
        assert.equal(h.game.touchControl, false);
        assert.equal(h.game.shootPressed, false);
        assert.equal(h.game.player.velocity, -1, 'Inactive pointer hovering must not release a held keyboard direction');
    });
}

let failures = 0;
const selected = tests.filter(test => !requestedGame || test.game === requestedGame);
let sourceMissing = false;
if (selected.some(test => test.authoredSource)) {
    try {
        fs.lstatSync(path.join(root, 'shooter_game/src/core/Game.js'));
    } catch (error) {
        // Only an absent optional file is skipped. All other read/parse errors fail its checks.
        sourceMissing = error.code === 'ENOENT';
    }
}
const skipped = selected.filter(test => test.authoredSource && sourceMissing);
const runnable = selected.filter(test => !test.authoredSource || !sourceMissing);
if (skipped.length) {
    console.log(`SKIP ${skipped.length} optional Shooter authored-source checks: shooter_game/src/core/Game.js is absent.`);
}
for (const { name, run } of runnable) {
    try {
        await run();
        console.log('PASS ' + name);
    } catch (error) {
        failures++;
        console.error('FAIL ' + name + '\n' + error.message);
    }
}
console.log(`${runnable.length - failures}/${runnable.length} ${requestedGame ? requestedGame + ' ' : ''}pointer lifecycle checks passed.`);
if (skipped.length) console.log(`${skipped.length} optional authored-source checks skipped; served-bundle checks remain mandatory.`);
if (failures) process.exitCode = 1;
