import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tests = [];
const test = (name, run) => tests.push({ name, run });

// Exercise the production engine with browser audio failures and round retries.
const audioSource = read('grid16/js/audio.js').replace('export class AudioEngine', 'class AudioEngine');
function audioFixture() {
    const contexts = [];
    let constructorFailure = false;
    let gainFailure = false;
    class AudioContext {
        constructor() {
            if (constructorFailure) {
                constructorFailure = false;
                throw new Error('Audio device unavailable');
            }
            this.state = 'suspended';
            this.destination = {};
            this.closed = 0;
            this.resumeCalls = 0;
            contexts.push(this);
        }
        createGain() {
            if (gainFailure) {
                gainFailure = false;
                throw new Error('Gain allocation failed');
            }
            return { gain: { value: 1 }, connect: destination => assert.equal(destination, this.destination) };
        }
        close() { this.closed++; this.state = 'closed'; return Promise.resolve(); }
        resume() { this.resumeCalls++; this.state = 'running'; return Promise.resolve(); }
    }
    const Engine = vm.runInNewContext(audioSource + ';AudioEngine', { window: { AudioContext } });
    return {
        engine: new Engine(), contexts,
        failConstructor: () => { constructorFailure = true; },
        failGain: () => { gainFailure = true; }
    };
}

test('Grid16 repeated rounds reuse one audio context without resetting rhythm', () => {
    const { engine, contexts } = audioFixture();
    engine.init();
    const context = engine.ctx;
    const gain = engine.masterGain;
    engine._beatTimer = 0.2;
    engine._beatIndex = 7;
    for (let round = 0; round < 20; round++) { engine.init(); engine.resume(); }
    assert.equal(contexts.length, 1);
    assert.equal(engine.ctx, context);
    assert.equal(engine.masterGain, gain);
    assert.equal(gain.gain.value, 0.3);
    assert.equal(context.resumeCalls, 1);
    assert.equal(engine._beatTimer, 0.2);
    assert.equal(engine._beatIndex, 7);
    context.state = 'closed';
    engine.init();
    assert.equal(contexts.length, 2);
    assert.notEqual(engine.ctx, context);
});

test('Grid16 audio recovers from constructor and partial initialization failure', () => {
    const fixture = audioFixture();
    fixture.failConstructor();
    fixture.engine.init();
    assert.equal(fixture.engine.ctx, null);
    assert.equal(fixture.engine.enabled, false);
    fixture.engine.init();
    assert.equal(fixture.engine.enabled, true);
    assert(fixture.engine.masterGain);

    const partial = audioFixture();
    partial.failGain();
    partial.engine.init();
    assert.equal(partial.contexts[0].closed, 1);
    assert.equal(partial.engine.ctx, null);
    assert.equal(partial.engine.masterGain, null);
    partial.engine.init();
    assert.equal(partial.engine.enabled, true);
    assert.equal(partial.contexts.length, 2);
});

test('Grid16 blocked audio resume stays silent and a later gesture can recover', async () => {
    const { engine } = audioFixture();
    engine.init();
    const unhandled = [];
    const onUnhandled = reason => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
        engine.ctx.resume = () => Promise.reject(new Error('Audio policy blocked resume'));
        assert.doesNotThrow(() => engine.resume());
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(unhandled, []);
        engine.ctx.resume = () => { throw new Error('Audio device interrupted'); };
        assert.doesNotThrow(() => engine.resume());
        engine.ctx.resume = () => { engine.ctx.state = 'running'; return Promise.resolve(); };
        engine.resume();
        assert.equal(engine.ctx.state, 'running');
        assert.equal(engine.enabled, true);
    } finally {
        process.off('unhandledRejection', onUnhandled);
    }
});

// Execute the original bundle's input and restart methods, without changing it.
const bundle = read('shooter_game/shooter_game.js');
const gameStart = bundle.indexOf('var ra=class');
assert(gameStart >= 0, 'Original Shooter game class must be found');
const gameSource = bundle.slice(gameStart, bundle.indexOf('var Ol=', gameStart));
const setup = gameSource.slice(gameSource.indexOf('setupInputHandlers(){'), gameSource.indexOf('handlePointerDown(t){'));
const keys = gameSource.slice(gameSource.indexOf('handleKeyDown(t){'), gameSource.indexOf('togglePause(){'))
    .replace('handleKeyUp(t)', ',handleKeyUp(t)');
const restartStart = gameSource.indexOf('restart(){');
const restartLog = 'console.log("Game restarted")';
const restart = gameSource.slice(restartStart, gameSource.indexOf(restartLog, restartStart) + restartLog.length) + '}';
const inlineScripts = [...read('shooter_game/index.html').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).filter(script => script.trim());
const releaseScript = inlineScripts.find(script => script.includes('releaseGameControls'));
const muteScript = inlineScripts.find(script => script.includes('enhanceMuteControl'));
assert(releaseScript && muteScript, 'Iframe enhancements must be found');

class Surface {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, handler) {
        const handlers = this.listeners.get(type) || [];
        handlers.push(handler);
        this.listeners.set(type, handlers);
    }
    dispatchEvent(event) {
        for (const handler of this.listeners.get(event.type) || []) handler(event);
        return !event.defaultPrevented;
    }
}
class KeyEvent {
    constructor(type, options = {}) { this.type = type; Object.assign(this, options); }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this.propagationStopped = true; }
}

function shooterFixture() {
    const window = new Surface();
    const document = new Surface();
    const mute = new Surface();
    const messages = [];
    let shots = 0;
    let muteClicks = 0;
    class Player {
        constructor() { this.velocity = 0; }
        shoot() { shots++; }
        moveLeft() { this.velocity = -1; }
        moveRight() { this.velocity = 1; }
        isMovingLeft() { return this.velocity < 0; }
        isMovingRight() { return this.velocity > 0; }
        stopMoving() { this.velocity = 0; }
    }
    window.parent = { postMessage: (message, origin) => messages.push({ message, origin }) };
    window.location = { origin: 'https://arielh.com' };
    document.hidden = false;
    document.body = {};
    document.getElementById = id => id === 'mute-toggle' ? mute : null;
    mute.textContent = 'MUTE';
    mute.setAttribute = () => {};
    mute.closest = selector => selector === '#mute-toggle' ? mute : null;
    mute.click = () => { muteClicks++; };
    const context = vm.createContext({
        window, document, KeyboardEvent: KeyEvent, queueMicrotask,
        console: { log() {} }, MutationObserver: class { observe() {} },
        X: class {}, So: Player, v: { GAME: { WIDTH: 800, HEIGHT: 600 } }
    });
    vm.runInContext(releaseScript, context);
    vm.runInContext(muteScript, context);
    const methods = vm.runInContext('({' + setup + ',' + keys + ',' + restart + '})', context);
    const removeChildren = () => {};
    const game = Object.assign({
        gameOver: false, paused: false, shootPressed: false,
        app: { view: new Surface(), stage: { on() {} } }, player: new Player(),
        gameContainer: { removeChildren }, fxContainer: { removeChildren }, uiContainer: { removeChildren },
        scoreManager: { reset() {}, initialize() {}, setAsteroidsToUpgrade() {} },
        upgradeSystem: { reset() {} }, asteroidManager: { initialize() {} },
        handlePointerDown() {}, handlePointerMove() {}, handlePointerUp() {}
    }, methods);
    game.setupInputHandlers();
    const press = code => window.dispatchEvent(new KeyEvent('keydown', { code }));
    const hold = code => { press(code); press('Space'); };
    const neutral = expectedShots => {
        assert.equal(game.player.velocity, 0);
        assert.equal(game.shootPressed, false);
        assert.equal(shots, expectedShots);
    };
    return {
        window, document, mute, context, game, messages, press, hold, neutral,
        shots: () => shots, muteClicks: () => muteClicks,
        muteKey(type, repeat = false) {
            const event = new KeyEvent(type, { code: 'Space', key: ' ', repeat });
            mute.dispatchEvent(event);
            if (!event.propagationStopped) window.dispatchEvent(event);
            assert(event.defaultPrevented && event.propagationStopped);
        }
    };
}

test('Shooter releases held movement and fire on blur and hidden tab without extra shots', () => {
    const fixture = shooterFixture();
    fixture.hold('KeyA');
    fixture.window.dispatchEvent({ type: 'blur' });
    fixture.neutral(1);
    fixture.hold('KeyD');
    fixture.document.hidden = true;
    fixture.document.dispatchEvent({ type: 'visibilitychange' });
    fixture.neutral(2);
    fixture.hold('ArrowLeft');
    fixture.document.hidden = false;
    fixture.document.dispatchEvent({ type: 'visibilitychange' });
    assert.equal(fixture.game.player.velocity, -1, 'Visible document must not cancel new gameplay input');
    fixture.window.dispatchEvent({ type: 'blur' });
    fixture.neutral(3);
});

test('Shooter mute focus clears held keys and Space toggles only mute once', () => {
    const fixture = shooterFixture();
    fixture.hold('ArrowRight');
    fixture.document.dispatchEvent({ type: 'focusin', target: fixture.mute });
    fixture.neutral(1);
    fixture.muteKey('keydown');
    fixture.muteKey('keydown', true);
    fixture.muteKey('keyup');
    assert.equal(fixture.muteClicks(), 1);
    fixture.neutral(1);
});

test('Shooter actual restart clears stale game-over fire and preserves host round signals', async () => {
    const fixture = shooterFixture();
    fixture.hold('KeyA');
    fixture.game.gameOver = true;
    fixture.window.dispatchEvent({ type: 'blur' });
    assert.equal(fixture.game.shootPressed, true, 'Bundle ignores keyup during game over');
    fixture.game.restart();
    await Promise.resolve();
    fixture.neutral(1);
    assert.equal(fixture.messages.length, 1);
    assert.equal(fixture.messages[0].message.type, 'ariel-game-start');
    assert.equal(fixture.messages[0].message.game, 'shooter');
    assert.equal(fixture.messages[0].origin, 'https://arielh.com');
    fixture.press('Space');
    assert.equal(fixture.shots(), 2, 'A new round can shoot normally');
    vm.runInContext('console.log("Game started")', fixture.context);
    await Promise.resolve();
    fixture.neutral(2);
    assert.equal(fixture.messages.length, 2);
    vm.runInContext('console.log("Ordinary log")', fixture.context);
    assert.equal(fixture.messages.length, 2);
});

for (const { name, run } of tests) {
    await run();
    console.log('PASS ' + name);
}
console.log(tests.length + ' game lifecycle regression checks passed.');
