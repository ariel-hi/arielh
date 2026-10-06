import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'grid16/js/main.js'), 'utf8').replace(/^import .*\r?\n/gm, '');

// Run the production renderer against a recorded canvas and a live media query.
function fixture(reduced = false) {
    const preference = { matches: reduced };
    const drawing = [];
    const audioCalls = [];
    const gameUpdates = [];
    let now = 0;
    const ctx = new Proxy({}, {
        get(target, key) {
            if (key in target) return target[key];
            return (...args) => drawing.push({ method: key, args, fillStyle: target.fillStyle });
        }
    });
    const elements = new Map();
    function element(id) {
        if (!elements.has(id)) {
            const classes = new Set();
            elements.set(id, {
                style: {}, value: '', focus() {},
                classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) }
            });
        }
        return elements.get(id);
    }
    element('game-canvas').getContext = () => ctx;
    const math = Object.create(Math);
    math.random = () => 0;
    const context = vm.createContext({
        document: { getElementById: element },
        window: { matchMedia(query) { assert.equal(query, '(prefers-reduced-motion: reduce)'); return preference; } },
        navigator: { maxTouchPoints: 0 }, devicePixelRatio: 1, innerWidth: 960, innerHeight: 640,
        addEventListener() {}, requestAnimationFrame() {}, performance: { now: () => now }, Math: math,
        GAME_SIZE: 200,
        InputManager: class { constructor() { this.keys = { left: true, right: false, up: false, down: false }; } reset() {} },
        AudioEngine: class {
            init() { audioCalls.push(['init']); }
            resume() { audioCalls.push(['resume']); }
            setBPM(speed) { audioCalls.push(['speed', speed]); }
            tick(dt) { audioCalls.push(['tick', dt]); }
            playFail() { audioCalls.push(['fail']); }
            playSwitch() { audioCalls.push(['switch']); }
            playGameOver() { audioCalls.push(['over']); }
        },
        createAllGames: count => Array.from({ length: count }, (_, index) => ({
            name: 'Game ' + index, hint: 'Original hint', color: '#00ffaa', controls: ['left'], failed: false,
            render() {}, update(dt, keys, speed, active) { gameUpdates.push([index, dt, { ...keys }, speed, active]); }
        })),
        submitScore: async () => {}, fetchLeaderboard: async () => []
    });
    vm.runInContext(source, context);
    const run = code => vm.runInContext(code, context);
    return {
        preference, audioCalls, gameUpdates, run,
        title(time) {
            now = time;
            drawing.length = 0;
            run('state = ST.TITLE; render(0.01);');
            return drawing.filter(call => call.method === 'arc').map(call => call.args);
        },
        prepareGame() {
            run('games = createAllGames(16); elim = new Array(16).fill(false); state = ST.ACTIVE; expandT = 0; shake = 10; flash = 0; scanY = 0;');
        },
        frame() {
            drawing.length = 0;
            run('render(0.01);');
            return {
                shake: drawing.some(call => call.method === 'translate' && call.args[0] === -5 && call.args[1] === -5),
                scanlines: drawing.filter(call => call.method === 'fillRect' && call.fillStyle === 'rgba(255,255,255,0.009)').map(call => call.args),
                scanPhase: run('scanY')
            };
        }
    };
}

const normalTitle = fixture();
assert.notDeepEqual(normalTitle.title(0), normalTitle.title(9000), 'Normal title particles must continue moving');
const reducedTitle = fixture(true);
const stillTitle = reducedTitle.title(0);
assert.equal(stillTitle.length, 30, 'Reduced motion preserves the original title decoration');
assert.deepEqual(stillTitle, reducedTitle.title(9000));
normalTitle.preference.matches = true;
assert.deepEqual(normalTitle.title(18000), stillTitle, 'Preference changes freeze title particles without reloading');
normalTitle.preference.matches = false;
assert.notDeepEqual(normalTitle.title(18000), normalTitle.title(19000), 'Turning reduced motion off resumes title motion');
console.log('PASS title decoration respects the live preference and normal motion continues');

const gameplayRender = fixture();
gameplayRender.prepareGame();
const first = gameplayRender.frame();
const second = gameplayRender.frame();
assert(first.shake && second.shake, 'Normal failure shake must remain');
assert.notDeepEqual(first.scanlines, second.scanlines, 'Normal scanlines must continue scrolling');
gameplayRender.preference.matches = true;
const reducedFirst = gameplayRender.frame();
const reducedSecond = gameplayRender.frame();
assert.equal(reducedFirst.shake, false);
assert.equal(reducedSecond.shake, false);
assert.deepEqual(reducedFirst.scanlines, reducedSecond.scanlines);
assert.equal(reducedFirst.scanlines[0][1], 0, 'Reduced scanlines use a static offset');
assert.equal(reducedFirst.scanPhase, second.scanPhase);
assert.equal(reducedSecond.scanPhase, second.scanPhase);
gameplayRender.preference.matches = false;
const resumed = gameplayRender.frame();
assert(resumed.shake, 'Turning reduced motion off restores failure shake');
assert(resumed.scanPhase > reducedSecond.scanPhase);
assert.notDeepEqual(resumed.scanlines, reducedSecond.scanlines);
console.log('PASS failure shake and scanlines respond immediately without changing normal rendering');

function gameProgress(reduced) {
    const game = fixture(reduced);
    game.run('start(); for (let frame = 0; frame < 200; frame++) update(0.05); games[activeIdx].failed = true; for (let frame = 0; frame < 30; frame++) update(0.05);');
    return {
        // JSON removes VM realm prototypes so the actual progress can be compared.
        progress: JSON.parse(game.run('JSON.stringify({state, activeIdx, nextIdx, clockSpd, maxSpd, score, switchT, transT, expandT, expandIdx, gamesLostCount, elim, keys: input.keys})')),
        gameUpdates: game.gameUpdates, audioCalls: game.audioCalls
    };
}
const normalProgress = gameProgress(false);
const reducedProgress = gameProgress(true);
assert(normalProgress.gameUpdates.length > 0);
assert(normalProgress.progress.gamesLostCount > 0, 'Fixture must exercise failure and switch timing');
assert.deepEqual(reducedProgress, normalProgress, 'Reduced motion must preserve updates, controls, score, transitions and audio timing');
console.log('PASS actual game updates and controls are identical under both motion preferences');
