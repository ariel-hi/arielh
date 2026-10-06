import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../analytics/analytics.js', import.meta.url), 'utf8');
const shooterBridge = readFileSync(new URL('../shooter-events.js', import.meta.url), 'utf8');
function run(overrides = {}) {
  const requests = [];
  const listeners = {};
  const readiness = [];
  const window = new EventTarget();
  window.top = window;
  window.addEventListener('ariel-analytics-ready', (event) => {
    readiness.push({ type: event.type, interfaceReady: typeof window.ArielAnalytics?.track === 'function' });
  });
  const context = {
    window, location: { protocol: 'https:', hostname: 'arielh.com', pathname: '/', href: 'https://arielh.com/?private=query', origin: 'https://arielh.com', ...overrides.location },
    navigator: { userAgent: 'Mozilla/5.0', doNotTrack: '0', globalPrivacyControl: false, sendBeacon: (url, body) => { requests.push({ url, body }); return true; }, ...overrides.navigator },
    document: { visibilityState: 'visible', referrer: 'https://example.org/private?email=secret', addEventListener: (type, handler) => { listeners[type] = handler; }, ...overrides.document },
    URL, Blob, Event, Element: class {}, performance: { now: () => 10000 }, matchMedia: () => ({ matches: true }),
    fetch: () => { throw new Error('Unexpected fallback fetch'); },
  };
  if (overrides.iframe) window.top = {};
  overrides.beforeLoad?.(context);
  vm.runInNewContext(source, context);
  return { ...context, requests, listeners, readiness };
}
for (const overrides of [
  { location: { hostname: 'localhost' } }, { location: { protocol: 'http:' } },
  { location: { pathname: '/analytics/dashboard.php' } },
  { navigator: { doNotTrack: '1' } }, { navigator: { globalPrivacyControl: true } },
  { navigator: { userAgent: 'HeadlessChrome' } }, { navigator: { userAgent: 'Googlebot' } },
]) assert.equal(run(overrides).requests.length, 0, JSON.stringify(overrides));
const automated = run({ navigator: { webdriver: true } });
assert.equal(automated.requests.length, 0, 'WebDriver with a normal user agent must not count a visit.');
assert.equal(automated.window.ArielAnalytics, undefined, 'Excluded automation must not publish a tracking interface.');
assert.deepEqual(automated.readiness, [], 'Excluded automation must not flush pending game starts.');
assert.deepEqual(Object.keys(automated.listeners), [], 'Excluded automation must not install tracking hooks.');
assert.equal(run({ navigator: { webdriver: false } }).requests.length, 1, 'An ordinary browser with webdriver false must still count.');
const initial = run();
assert.deepEqual(initial.readiness, [{ type: 'ariel-analytics-ready', interfaceReady: true }], 'The ready event must fire after the public interface exists.');
assert.ok(Object.isFrozen(initial.window.ArielAnalytics));
assert.equal(initial.requests.length, 1);
assert.equal(initial.requests[0].url, '/analytics/collect.php');
const payload = JSON.parse(await initial.requests[0].body.text());
assert.deepEqual(payload, { event: 'page_view', path: '/', tag: '', referrer: 'example.org', device: 'small' });
assert.ok(!JSON.stringify(payload).includes('secret') && !JSON.stringify(payload).includes('private'));
initial.listeners.visibilitychange();
assert.equal(initial.requests.length, 1, 'Visibility changes must not count a second pageview.');
initial.window.ArielAnalytics.track('project_open', 'word-king');
initial.window.ArielAnalytics.track('project_open', 'word-king');
assert.equal(initial.requests.length, 2, 'Repeat click handlers must not double count.');
initial.window.ArielAnalytics.track('unknown', 'private-value');
initial.window.ArielAnalytics.track('project_open', 'private-value');
assert.equal(initial.requests.length, 2);
assert.equal(run({ iframe: true }).requests.length, 0, 'Embedded game frames must not duplicate the parent pageview.');
const missingPage = run({ location: { pathname: '/missing/private-address', href: 'https://arielh.com/missing/private-address?token=secret#private' }, document: { querySelector: (selector) => selector === '.not-found' ? {} : null } });
assert.equal(missingPage.requests.length, 1, 'A rendered missing page must be counted once.');
const missingPayload = JSON.parse(await missingPage.requests[0].body.text());
assert.equal(missingPayload.path, '/404.html');
assert.ok(!JSON.stringify(missingPayload).includes('private-address') && !JSON.stringify(missingPayload).includes('secret'), 'Missing addresses, queries, and fragments must not enter analytics.');
assert.equal(run({ location: { pathname: '/missing/private-address' } }).requests.length, 0, 'Unknown routes without the missing-page marker remain excluded.');
assert.equal(run({ location: { pathname: '/missing/private-address' }, navigator: { doNotTrack: '1' }, document: { querySelector: () => ({}) } }).requests.length, 0, 'Privacy opt-outs also apply to missing pages.');
const hidden = run({ document: { visibilityState: 'hidden' } });
assert.equal(hidden.requests.length, 0);
hidden.document.visibilityState = 'visible';
hidden.listeners.visibilitychange();
assert.equal(hidden.requests.length, 1);

// Check the public page's delegated hooks, including newly added project tags.
const hooks = run({ location: { pathname: '/projects.html' } });
function click(selector, element) {
  const target = new hooks.Element();
  target.closest = (candidate) => candidate === selector ? element : null;
  hooks.listeners.click({ target });
}
click('[data-project-filter], [data-filter]', { dataset: { filter: 'tools' } });
click('a[href]', { dataset: { project: 'worldbreaker' }, href: 'https://worldbreaker.example/' });
click('a[href]', { dataset: { project: 'copysprig' }, href: 'https://copysprig.web.app/' });
assert.deepEqual(await Promise.all(hooks.requests.slice(1).map(async ({ body }) => {
  const event = JSON.parse(await body.text());
  return [event.event, event.tag];
})), [['project_filter', 'tools'], ['project_open', 'worldbreaker'], ['project_open', 'copysprig']]);

const directory = readFileSync(new URL('../projects.html', import.meta.url), 'utf8');
const inventory = run({ location: { pathname: '/projects.html' } });
const projectTags = new Set([...directory.matchAll(/data-project="([^"]+)"/g)].map((match) => match[1]));
const filterTags = new Set([...directory.matchAll(/data-filter="([^"]+)"/g)].map((match) => match[1]));
for (const tag of projectTags) inventory.window.ArielAnalytics.track('project_open', tag);
for (const tag of filterTags) inventory.window.ArielAnalytics.track('project_filter', tag);
assert.equal(inventory.requests.length, 1 + projectTags.size + filterTags.size, 'Every project/filter shown in the directory must have an approved analytics tag.');

function dispatchStart(window, { source, origin = 'https://arielh.com', data = { type: 'ariel-game-start', game: 'shooter' } }) {
  const event = new Event('message');
  Object.assign(event, { source, origin, data });
  window.dispatchEvent(event);
}
function bridgeContext() {
  const calls = [];
  const iframe = { contentWindow: {} };
  const window = new EventTarget();
  const context = { window, location: { origin: 'https://arielh.com' }, document: { getElementById: (id) => id === 'game-iframe' ? iframe : null } };
  vm.runInNewContext(shooterBridge, context);
  const enable = () => { window.ArielAnalytics = { track: (...args) => calls.push(args) }; window.dispatchEvent(new Event('ariel-analytics-ready')); };
  return { ...context, iframe, calls, enable };
}

const invalidBridge = bridgeContext();
for (const message of [
  { source: {} }, { source: invalidBridge.iframe.contentWindow, origin: 'https://evil.example' },
  { source: invalidBridge.iframe.contentWindow, data: null },
  { source: invalidBridge.iframe.contentWindow, data: { type: 'unexpected', game: 'shooter' } },
  { source: invalidBridge.iframe.contentWindow, data: { type: 'ariel-game-start', game: 'unknown' } },
]) dispatchStart(invalidBridge.window, message);
invalidBridge.enable();
assert.equal(invalidBridge.calls.length, 0, 'Untrusted origins, frames, or message values must never create a pending start.');

const pendingBridge = bridgeContext();
for (let i = 0; i < 20; i++) dispatchStart(pendingBridge.window, { source: pendingBridge.iframe.contentWindow });
assert.equal(pendingBridge.calls.length, 0);
pendingBridge.enable();
assert.deepEqual(pendingBridge.calls, [['game_start', 'shooter']], 'Pre-readiness starts must coalesce into one start.');
pendingBridge.window.dispatchEvent(new Event('ariel-analytics-ready'));
assert.equal(pendingBridge.calls.length, 1, 'Repeat readiness must not replay a flushed start.');
dispatchStart(pendingBridge.window, { source: pendingBridge.iframe.contentWindow });
assert.deepEqual(pendingBridge.calls, [['game_start', 'shooter'], ['game_start', 'shooter']], 'Later valid restarts must dispatch while analytics is ready.');

const integrated = run({ location: { pathname: '/shooter.html' }, beforeLoad: (context) => {
  const iframe = { contentWindow: {} };
  context.document.getElementById = (id) => id === 'game-iframe' ? iframe : null;
  vm.runInNewContext(shooterBridge, context);
  dispatchStart(context.window, { source: iframe.contentWindow });
} });
assert.equal(integrated.requests.length, 2);
assert.deepEqual(await Promise.all(integrated.requests.map(async ({ body }) => {
  const event = JSON.parse(await body.text());
  return [event.event, event.tag];
})), [['game_start', 'shooter'], ['page_view', '']], 'Publishing the analytics interface must flush a real pending Shooter start.');

console.log('Analytics browser logic: privacy exclusions, approved hooks, readiness, Shooter message validation/pending starts, deduplication, visibility and iframe handling passed.');
