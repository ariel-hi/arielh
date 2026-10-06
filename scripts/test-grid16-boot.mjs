// Load the actual ESM game graph in temporary roots with controlled DOM/RAF only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'grid16/index.html'), 'utf8');
const bootstrap = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('window.grid16Boot'));
assert.ok(bootstrap, 'The production startup controller must exist');
assert.equal([...bootstrap.matchAll(/\bimport\(/g)].length, 1);

// Only inject the module resolver; controller code and every imported game file are real.
const runBootstrap = new Function('loadGame', bootstrap.replace(/\bimport\(/, 'loadGame('));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'arielh-grid16-boot-'));
const tests = [];
const test = (name, run) => tests.push({ name, run });
let caseNumber = 0;

class Surface {
  listeners = new Map();
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  dispatchEvent(event) {
    for (const handler of this.listeners.get(event.type) || []) handler(event);
  }
}

async function fixture(options, check) {
  const location = path.join(temporary, 'case-' + ++caseNumber);
  fs.mkdirSync(path.join(location, 'grid16/js'), { recursive: true });
  fs.writeFileSync(path.join(location, 'package.json'), '{"type":"module"}\n');
  for (const filename of ['main.js', 'input.js', 'audio.js', 'microgames.js', 'leaderboard.js']) {
    if ((options.missingEntry && filename === 'main.js') || (options.missingDependency && filename === 'audio.js')) continue;
    fs.copyFileSync(path.join(root, 'grid16/js', filename), path.join(location, 'grid16/js', filename));
  }

  const document = new Surface();
  const window = new Surface();
  const elements = new Map();
  function element(id, attributes = '') {
    const node = new Surface();
    const classes = new Set(/\bclass="([^"]*)"/.exec(attributes)?.[1].split(/\s+/) || []);
    Object.assign(node, {
      id, style: {}, disabled: /\bdisabled\b/.test(attributes), hidden: /\bhidden\b/.test(attributes),
      inert: /\binert\b/.test(attributes), tabIndex: Number(/\btabindex="(-?\d+)"/.exec(attributes)?.[1] ?? -1),
      textContent: '', value: '',
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
      focus() { if (!node.disabled && !node.hidden && !node.inert) document.activeElement = node; },
      click() { if (!node.disabled && !node.hidden && !node.inert) node.dispatchEvent({ type: 'click', target: node }); },
      closest() { return null; }
    });
    elements.set(id, node);
    return node;
  }
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) element(match[1], match[0]);
  const get = id => elements.get(id);
  const nub = element('fixture-nub');
  get('dpad').querySelector = () => nub;
  get('game-canvas').getContext = () => options.noCanvas ? null : new Proxy({}, { get: () => () => {} });
  document.getElementById = get;
  document.querySelector = () => null;
  const nav = element('fixture-nav');
  document.activeElement = nav;
  let reloads = 0;
  window.location = { href: 'https://arielh.com/grid16/', reload() { reloads++; } };
  window.matchMedia = () => ({ matches: false });
  const frames = [];
  const descriptors = new Map();
  for (const [name, value] of Object.entries({
    window, document, navigator: { maxTouchPoints: 0 }, devicePixelRatio: 1, innerWidth: 960, innerHeight: 640,
    addEventListener: window.addEventListener.bind(window),
    requestAnimationFrame(callback) {
      if (options.rafFailure) throw new Error('<img onerror=secret>');
      frames.push(callback);
      return frames.length;
    },
    fetch() { throw new Error('Unexpected network request in offline fixture'); }
  })) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }

  let loading, release, readyCalls = 0;
  const gate = options.delayed ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  try {
    runBootstrap(specifier => {
      assert.equal(specifier, './js/main.js?v=20261002v');
      loading = gate.then(() => import(new URL(specifier, pathToFileURL(path.join(location, 'grid16/index.html')))));
      return loading;
    });
    const actualReady = window.grid16Boot.ready;
    window.grid16Boot.ready = () => {
      readyCalls++;
      for (const id of ['start-btn', 'board-btn', 'restart-btn', 'submit-btn', 'board-close', 'game-canvas']) {
        assert.equal(typeof get(id).onclick, 'function', `${id} must have its real handler before ready`);
      }
      assert.equal(frames.length, 1, 'Ready must follow registration of the actual first frame');
      assert.equal(get('start-btn').disabled, true, 'Play must remain disabled until this signal');
      assert.equal(get('game-canvas').inert, true);
      actualReady();
    };
    const settle = async () => { await loading.catch(() => {}); await Promise.resolve(); };
    await check({ get, window, document, nav, frames, settle, release,
      readyCalls: () => readyCalls, reloads: () => reloads });
  } finally {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

function locked(h) {
  assert.equal(h.get('start-btn').disabled, true);
  assert.equal(h.get('board-btn').disabled, true);
  assert.equal(h.get('game-canvas').inert, true);
  assert.equal(h.get('game-canvas').tabIndex, -1);
}
function failed(h) {
  locked(h);
  assert.equal(h.readyCalls(), 0);
  assert.equal(h.get('boot-status').hidden, false);
  assert.equal(h.get('boot-reload').hidden, false);
  assert.equal(h.get('boot-status').textContent, 'The game could not start. Reload to try again.');
  assert.doesNotMatch(h.get('boot-status').textContent, /secret|ERR_MODULE|TypeError/);
  h.get('boot-reload').click();
  assert.equal(h.reloads(), 1, 'Native recovery button must reload this document');
}

test('Default markup is disabled/inert and no-JS guidance replaces loading text', async () => {
  assert.match(html, /<noscript>[\s\S]*#boot-status\s*\{\s*display:\s*none\s*!important[\s\S]*JavaScript is needed to play Grid16\.[\s\S]*<\/noscript>/);
  assert.match(html, /\[hidden\]\s*\{\s*display:\s*none\s*!important/,
    'Author display:block buttons must not override hidden recovery controls');
  await fixture({ delayed: true }, async h => {
    locked(h);
    assert.equal(h.get('boot-reload').hidden, true);
    assert.equal(h.frames.length, 0);
    h.release(); await h.settle();
    assert.equal(h.readyCalls(), 1);
  });
});

test('Actual complete ESM initialization enables controls after handlers/RAF without stealing nav focus', async () => {
  await fixture({}, async h => {
    await h.settle();
    assert.equal(h.readyCalls(), 1);
    assert.equal(h.get('start-btn').disabled, false);
    assert.equal(h.get('board-btn').disabled, false);
    assert.equal(h.get('game-canvas').inert, false);
    assert.equal(h.get('game-canvas').tabIndex, 0);
    assert.equal(h.get('boot-status').hidden, true);
    assert.equal(h.get('boot-reload').hidden, true);
    assert.equal(h.document.activeElement, h.nav);
    assert.ok((h.window.listeners.get('keydown') || []).length > 0, 'Actual InputManager must be installed');
    h.window.grid16Boot.fail();
    assert.equal(h.get('boot-status').hidden, true, 'Late failure cannot replace a running game');
  });
});

test('Missing actual entry module shows fixed failure and working Reload', async () => {
  await fixture({ missingEntry: true }, async h => { await h.settle(); failed(h); });
});
test('Missing actual imported dependency shows failure without unlocking controls', async () => {
  await fixture({ missingDependency: true }, async h => { await h.settle(); failed(h); });
});
test('Actual no-2D-context evaluation failure remains safely inert', async () => {
  await fixture({ noCanvas: true }, async h => { await h.settle(); failed(h); });
});
test('Actual first-frame registration failure cannot falsely announce readiness', async () => {
  await fixture({ rafFailure: true }, async h => { await h.settle(); failed(h); });
});
test('Ready restores focus only when the hidden recovery control owned it', async () => {
  await fixture({ delayed: true }, async h => {
    h.window.grid16Boot.fail();
    h.get('boot-reload').focus();
    h.release(); await h.settle();
    assert.equal(h.document.activeElement, h.get('start-btn'));
    assert.equal(h.get('boot-reload').hidden, true);
  });
});

let failures = 0;
try {
  for (const { name, run } of tests) {
    try { await run(); console.log('PASS ' + name); }
    catch (error) { failures++; console.error('FAIL ' + name + '\n' + error.stack); }
  }
} finally {
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()), 'Unexpected temporary root');
  assert.ok(path.basename(temporary).startsWith('arielh-grid16-boot-'));
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(`${tests.length - failures}/${tests.length} Grid16 boot checks passed.`);
if (failures) process.exitCode = 1;
