// Run complete production iframe scripts with controlled browser events/timers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const iframeHTML = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : read('shooter_game/index.html');
const parentHTML = read('shooter.html');
const bundle = read('shooter_game/shooter_game.js');
const entry = bundle.slice(bundle.lastIndexOf('var Ol='), bundle.indexOf('/*! Bundled license', bundle.lastIndexOf('var Ol=')))
  .replace(/\}\)\(\);\s*$/, ''); // Remove only the outer bundle IIFE's closing delimiter.
const inline = html => [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).filter(source => source.trim());
const tests = [];
const test = (name, run) => tests.push({ name, run });

class Surface {
  listeners = new Map();
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler); this.listeners.set(type, handlers);
  }
  removeEventListener(type, handler) { this.listeners.set(type, (this.listeners.get(type) || []).filter(fn => fn !== handler)); }
  dispatchEvent(event) { for (const fn of this.listeners.get(event.type) || []) fn(event); }
}
class BrowserEvent {
  constructor(type, values = {}) { this.type = type; Object.assign(this, values); }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.propagationStopped = true; }
}
function fixture(html = iframeHTML, standalone = false) {
  const window = new Surface(), document = new Surface();
  const elements = new Map(), messages = [], microtasks = [], observers = [], timers = new Map();
  let now = 0, nextTimer = 1, reloads = 0;
  function element(id, tag = 'DIV', attributes = '') {
    const target = new Surface();
    Object.assign(target, { id, tagName: tag.toUpperCase(), style: {}, textContent: '', hidden: /\bhidden\b/.test(attributes) });
    target.setAttribute = (name, value) => { target[name] = value; };
    target.closest = selector => selector.includes('#' + id) ? target : null;
    target.focus = () => { document.activeElement = target; document.dispatchEvent({ type: 'focusin', target }); };
    target.click = () => target.dispatchEvent({ type: 'click', target });
    target.appendChild = child => { elements.set(child.id, child); observers.forEach(fn => fn()); };
    elements.set(id, target); return target;
  }
  for (const match of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) element(match[3], match[1], match[2]);
  const classes = new Set(/<body[^>]*class="([^"]*)"/.exec(html)?.[1].split(/\s+/) || []);
  document.body = { classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) } };
  document.activeElement = document.body;
  document.documentElement = {};
  document.getElementById = id => elements.get(id) || null;
  document.querySelectorAll = selector => selector === 'audio' ? [...elements.values()].filter(e => e.tagName === 'AUDIO') : [];
  document.querySelector = () => elements.get('home');
  window.location = { origin: 'https://arielh.com', href: 'https://arielh.com/shooter_game/index.html?v=20261002u', reload() { reloads++; } };
  window.parent = standalone ? window : { postMessage: (data, origin) => messages.push({ data, origin }) };
  const schedule = (fn, delay, interval = 0) => { const id = nextTimer++; timers.set(id, { fn, due: now + delay, interval }); return id; };
  const context = vm.createContext({
    window, document, URL, Event: BrowserEvent, KeyboardEvent: BrowserEvent,
    screen: {}, navigator: { userAgent: 'Desktop fixture' },
    console: { log() {} },
    queueMicrotask: fn => microtasks.push(fn),
    MutationObserver: class { constructor(fn) { this.fn = fn; } observe() { observers.push(this.fn); } },
    setTimeout: (fn, delay) => schedule(fn, delay), clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => schedule(fn, delay, delay), clearInterval: id => timers.delete(id)
  });
  for (const source of inline(html)) vm.runInContext(source, context);
  function flush() { while (microtasks.length) microtasks.shift()(); }
  function advance(ms) {
    const end = now + ms;
    for (let guard = 0; guard < 1000; guard++) {
      const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) { now = end; return; }
      const [id, timer] = next; now = timer.due;
      if (timer.interval) timer.due += timer.interval; else timers.delete(id);
      timer.fn(); flush();
    }
    throw new Error('Unbounded fixture timers');
  }
  const get = id => elements.get(id);
  const signal = text => { vm.runInContext(`console.log(${JSON.stringify(text)})`, context); flush(); };
  const visible = () => !get('loading').hidden && get('loading').style.display !== 'none';
  return { window, document, context, get, element, messages, timers, advance, flush, signal, visible, reloads: () => reloads };
}

test('Loading remains visible after old fake-completion time and window load', () => {
  const h = fixture();
  h.document.dispatchEvent({ type: 'DOMContentLoaded' });
  h.window.dispatchEvent({ type: 'load' });
  h.advance(5000);
  assert.ok(h.visible(), 'A missing bundle must not produce a blank game');
  assert.equal(h.get('reload-game').hidden, true);
  h.signal('Game started');
  assert.ok(h.visible(), 'First game-start log precedes full setup');
  h.signal('Unrelated log');
  assert.ok(h.visible());
});

test('Actual served entry finishes game and mute setup before confirming readiness', () => {
  const h = fixture();
  let created = 0, started = 0;
  h.context.ra = class {
    constructor() { created++; } init() {} start() { started++; h.signal('Game started'); }
  };
  h.document.createElement = tag => h.element('', tag);
  h.document.body.appendChild = child => { h.get('game-container').appendChild(child); };
  vm.runInContext(entry, h.context);
  h.window.onload(); h.advance(1999);
  assert.ok(h.visible()); assert.equal(created, 0);
  h.advance(1);
  assert.equal(created, 1); assert.equal(started, 1);
  assert.equal(h.visible(), false);
  assert.equal(h.get('mute-toggle').role, 'button');
  assert.equal(h.get('mute-toggle').tabIndex, 0);
  assert.equal(h.document.body.classList.contains('game-loading'), false);
  assert.deepEqual(h.messages.map(message => message.data.type), ['ariel-game-start', 'ariel-game-boot']);
  assert.equal(h.messages[1].data.state, 'ready');
});

test('Bundle resource error offers honest recovery; Reload reloads only this document', () => {
  const h = fixture();
  h.window.dispatchEvent({ type: 'error', target: h.get('game-bundle') });
  assert.ok(h.visible()); assert.equal(h.get('reload-game').hidden, false);
  assert.match(h.get('loading-status').textContent, /could not start/);
  h.advance(30000);
  assert.match(h.get('loading-status').textContent, /could not start/, 'Watchdog cannot overwrite a known failure');
  h.get('reload-game').click(); assert.equal(h.reloads(), 1);
  assert.equal(h.messages[0].data.state, 'failed');
});

test('Pre-ready runtime error is limited to the game bundle and never exposes raw error text', () => {
  const h = fixture();
  h.window.dispatchEvent({ type: 'error', filename: 'https://arielh.com/unrelated.js', message: '<img onerror=secret>' });
  assert.equal(h.get('reload-game').hidden, true);
  h.window.dispatchEvent({ type: 'error', filename: 'https://arielh.com/shooter_game/shooter_game.js?v=20261002r', message: '<img onerror=secret>' });
  assert.equal(h.get('reload-game').hidden, false);
  assert.doesNotMatch(h.get('loading-status').textContent, /secret|img/);
  h.signal('Game initialized and started!');
  assert.equal(h.visible(), false, 'A genuine late ready signal recovers even after a reported failure');
});

test('Watchdog offers waiting and late actual readiness clears it without stealing focus', () => {
  const h = fixture();
  h.advance(20000);
  assert.ok(h.visible()); assert.equal(h.get('reload-game').hidden, false);
  assert.match(h.get('loading-status').textContent, /wait or reload/);
  const outside = {}; h.document.activeElement = outside;
  h.element('mute-toggle'); h.signal('Game initialized and started!');
  assert.equal(h.visible(), false); assert.equal(h.document.activeElement, outside);
  h.window.dispatchEvent({ type: 'error', target: h.get('game-bundle') }); h.advance(60000);
  assert.equal(h.visible(), false); assert.equal(h.messages.at(-1).data.state, 'ready');
});

test('Standalone readiness restores focused recovery control to existing mute', () => {
  const h = fixture(iframeHTML, true);
  h.advance(20000); h.get('reload-game').focus();
  const mute = h.element('mute-toggle'); mute.textContent = 'MUTE';
  h.get('game-container').appendChild(mute);
  h.signal('Game initialized and started!');
  assert.equal(h.document.activeElement, mute);
  assert.equal(h.visible(), false); assert.equal(h.messages.length, 0);
});

test('Existing restart messages and input release remain intact', () => {
  const h = fixture();
  const released = []; h.window.addEventListener('keyup', event => released.push(event.code));
  h.signal('Game restarted');
  assert.deepEqual(released, ['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD', 'Space']);
  assert.equal(h.messages[0].data.type, 'ariel-game-start');
  assert.equal(h.messages[0].origin, 'https://arielh.com');
  assert.ok(h.visible(), 'A restart log cannot fake initial readiness');
});

function parentFixture() {
  const beforeIframe = parentHTML.slice(0, parentHTML.indexOf('<iframe'));
  const scripts = inline(beforeIframe);
  assert.equal(scripts.length, 1, 'Portrait listener must register before the iframe');
  const h = fixture(beforeIframe);
  const iframe = h.element('game-iframe', 'iframe');
  let reloads = 0; iframe.contentWindow = { location: { reload() { reloads++; } } };
  const home = h.element('home', 'a');
  const message = (state, extra = {}) => h.window.dispatchEvent({ type: 'message', origin: 'https://arielh.com', source: iframe.contentWindow,
    data: { type: 'ariel-game-boot', game: 'shooter', state }, ...extra });
  return { ...h, message, iframe, home, reloads: () => reloads };
}
test('Early iframe failure is shown in parent portrait prompt and only iframe reloads', () => {
  const h = parentFixture();
  h.message('failed');
  assert.equal(h.get('portrait-boot-status').hidden, false);
  assert.match(h.get('portrait-boot-status').textContent, /could not start/);
  h.get('portrait-reload').focus(); h.get('portrait-reload').click();
  assert.equal(h.reloads(), 1); assert.equal(h.get('portrait-boot-status').textContent, 'Loading…');
  h.message('ready');
  assert.equal(h.get('portrait-reload').hidden, true);
  assert.equal(h.get('portrait-boot-status').hidden, true);
  assert.equal(h.document.activeElement, h.home);
});
test('Parent rejects foreign source/origin/type/game/state and never renders payload text', () => {
  const h = parentFixture();
  for (const extra of [ { origin: 'https://evil.example' }, { source: {} },
    { data: { type: 'other', game: 'shooter', state: 'failed' } },
    { data: { type: 'ariel-game-boot', game: 'grid16', state: 'failed' } },
    { data: { type: 'ariel-game-boot', game: 'shooter', state: 'unexpected' } } ]) h.message('failed', extra);
  assert.equal(h.get('portrait-reload').hidden, true);
  h.message('waiting', { data: { type: 'ariel-game-boot', game: 'shooter', state: 'waiting', message: '<img onerror=secret>' } });
  assert.match(h.get('portrait-boot-status').textContent, /wait or reload/);
  assert.doesNotMatch(h.get('portrait-boot-status').textContent, /img|secret/);
  const outside = {}; h.document.activeElement = outside;
  h.message('ready'); assert.equal(h.document.activeElement, outside);
});

let failures = 0;
for (const { name, run } of tests) {
  try { run(); console.log('PASS ' + name); }
  catch (error) { failures++; console.error('FAIL ' + name + '\n' + error.message); }
}
console.log(`${tests.length - failures}/${tests.length} Shooter boot checks passed.`);
if (failures) process.exitCode = 1;
