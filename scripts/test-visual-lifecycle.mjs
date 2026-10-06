import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = process.env.ARIEL_SITE_ROOT ? path.resolve(process.env.ARIEL_SITE_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tests = [];
const test = (name, run) => tests.push({ name, run });
const scripts = [
    ['index.js', 'kineticCanvas'],
    ['horizon.js', 'glCanvas'],
    ['nebula.js', 'glcanvas'],
    ['rufus.js', 'bgCanvas']
];

class Surface {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(listener);
    }
    emit(type, properties = {}) {
        const event = {
            type, defaultPrevented: false,
            preventDefault() { this.defaultPrevented = true; },
            ...properties
        };
        for (const listener of this.listeners.get(type) || []) listener(event);
        return event;
    }
}

function fixture(file, canvasId, { reduced = false, available = true, imageComplete = false, imageNaturalWidth = 0, controls = true, observed = false } = {}) {
    const draws = [], shaders = [], frames = new Map(), timers = new Map(), elements = new Map();
    let sequence = 0, clock = 0, contexts = 0, textureUploads = 0;
    let resolveFont, intersectionCallback;
    const fontReady = new Promise(resolve => { resolveFont = resolve; });
    const preference = new Surface();
    preference.matches = reduced;
    const document = new Surface();
    document.hidden = false;
    document.fonts = { load: () => fontReady };
    const window = new Surface();
    Object.assign(window, {
        innerWidth: 1000, innerHeight: 800, devicePixelRatio: 2,
        matchMedia(query) {
            assert.equal(query, '(prefers-reduced-motion: reduce)');
            return preference;
        }
    });
    function element(id) {
        if (!elements.has(id)) elements.set(id, Object.assign(new Surface(), {
            hidden: false, textContent: '', dataset: {}, attributes: {}, width: 0, height: 0,
            setAttribute(name, value) { this.attributes[name] = value; }
        }));
        return elements.get(id);
    }
    document.getElementById = id => id === 'motionToggle' && !controls ? null : element(id);
    document.querySelector = selector => element(selector);
    const canvas = element(canvasId);
    canvas.closest = () => null;
    const button = element('motionToggle');
    button.hidden = true;
    button.dataset.compactLabel = 'true';
    element('webglFallback').hidden = true;
    element('.gallery-controls').hidden = true;
    element('rufusImage').src = 'images/rufus-01.webp';
    element('rufusImage').complete = imageComplete;
    element('rufusImage').naturalWidth = imageNaturalWidth;
    element('photoCount').textContent = '1 / 9';
    document.activeElement = element('nextPhoto');
    let contextAvailable = available;
    const twoD = { fillRect() {}, fillText() {} };
    document.createElement = tag => {
        assert.equal(tag, 'canvas');
        return { getContext(type) { assert.equal(type, '2d'); return twoD; } };
    };
    canvas.getContext = type => {
        assert.equal(type, 'webgl2');
        if (!contextAvailable) return null;
        const id = ++contexts;
        const uniforms = {};
        const constants = ['VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS',
            'ARRAY_BUFFER', 'STATIC_DRAW', 'FLOAT', 'TEXTURE_2D', 'RGBA', 'UNSIGNED_BYTE',
            'TEXTURE_MIN_FILTER', 'TEXTURE_MAG_FILTER', 'LINEAR_MIPMAP_LINEAR', 'LINEAR',
            'TEXTURE_WRAP_S', 'TEXTURE_WRAP_T', 'REPEAT', 'TEXTURE0', 'TRIANGLES'];
        const gl = Object.fromEntries(constants.map(name => [name, name]));
        Object.assign(gl, {
            createShader: () => ({}), createProgram: () => ({}),
            createVertexArray: () => ({}), createBuffer: () => ({}), createTexture: () => ({}),
            shaderSource(shader, source) { shaders.push(source); },
            getShaderParameter: () => true, getProgramParameter: () => true,
            getUniformLocation: (program, name) => name,
            uniform1f(name, value) { uniforms[name] = value; },
            uniform1i(name, value) { uniforms[name] = value; },
            uniform2f(name, x, y) { uniforms[name] = [x, y]; },
            uniform3fv(name, values) { uniforms[name] = Array.from(values); },
            texImage2D() { textureUploads++; },
            drawArrays() {
                draws.push({ context: id, width: canvas.width, height: canvas.height,
                    ...JSON.parse(JSON.stringify(uniforms)) });
            }
        });
        for (const name of ['compileShader', 'deleteShader', 'attachShader', 'bindAttribLocation',
            'linkProgram', 'deleteProgram', 'bindVertexArray', 'bindBuffer', 'bufferData',
            'enableVertexAttribArray', 'vertexAttribPointer', 'viewport', 'useProgram',
            'bindTexture', 'generateMipmap', 'texParameteri', 'activeTexture']) gl[name] = () => {};
        return gl;
    };
    const math = Object.create(Math);
    math.random = () => 0.25;
    const context = vm.createContext({
        window, document, Math: math,
        IntersectionObserver: observed ? class {
            constructor(callback) { intersectionCallback = callback; }
            observe(target) { assert.equal(target, canvas); }
        } : undefined,
        requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
        cancelAnimationFrame(id) { frames.delete(id); },
        setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { callback, due: clock + delay }); return id; },
        clearTimeout(id) { timers.delete(id); }
    });
    // Run the complete deployed script; record its actual uniforms and scheduling.
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    return {
        canvas, button, document, window, preference, draws, shaders, frames, timers, element,
        inView(value) { intersectionCallback([{ isIntersecting: value }]); },
        last: () => draws.at(-1),
        pointer(x, y, type = 'pointermove') { canvas.emit(type, { clientX: x, clientY: y }); },
        click() { button.emit('click'); },
        resize(width = 1000, height = 800) {
            window.innerWidth = width; window.innerHeight = height; window.emit('resize');
        },
        hidden(value) { document.hidden = value; document.emit('visibilitychange'); },
        reduced(value) { preference.matches = value; preference.emit('change', { matches: value }); },
        frame(timestamp) {
            const callbacks = [...frames.values()]; frames.clear();
            for (const callback of callbacks) callback(timestamp);
        },
        elapse(milliseconds) {
            clock += milliseconds;
            const due = [...timers.entries()].filter(([, timer]) => timer.due <= clock);
            for (const [id, timer] of due) { timers.delete(id); timer.callback(); }
        },
        lose() { contextAvailable = false; return canvas.emit('webglcontextlost'); },
        restore() { contextAvailable = true; canvas.emit('webglcontextrestored'); },
        async font() { resolveFont(); await fontReady; await Promise.resolve(); },
        contexts: () => contexts,
        uploads: () => textureUploads
    };
}

for (const [file, canvasId] of scripts) {
    test(file + ': paused redraws freeze a target received just before Pause and ignore later pointer input', async () => {
        const f = fixture(file, canvasId);
        assert.equal(f.frames.size, 1);
        f.frame(100); f.frame(140);
        const before = f.last();
        f.pointer(750, 200, 'pointerdown');
        f.click();
        assert.deepEqual(f.last().u_mouse, before.u_mouse, 'Pause must not advance unfinished interpolation');
        assert.equal(f.frames.size, 0);
        f.pointer(1000, 800);
        f.pointer(1000, 800, 'pointerdown');
        for (let i = 0; i < 3; i++) f.resize(900 + i * 10, 700);
        f.hidden(true); f.hidden(false);
        if (file === 'index.js') await f.font();
        assert.deepEqual(f.last().u_mouse, before.u_mouse);
        assert.equal(f.last().u_time, before.u_time);
        assert.equal(f.frames.size, 0);
        assert.equal(f.timers.size, 0);
        f.click();
        assert.equal(f.frames.size, 1);
        assert.equal(f.last().u_mouse[0], 0.52, 'Play resumes the old target, not pointer movement received during Pause');
        f.frame(100); f.frame(140);
        assert(f.last().u_mouse[0] > 0.52, 'Normal pointer interpolation continues');
        assert(f.last().u_time > before.u_time, 'Normal animation time continues');
    });

    test(file + ': system preference changes preserve manual Pause and explicit Play still opts into reduced motion', () => {
        const f = fixture(file, canvasId);
        f.click();
        f.reduced(true); f.reduced(false);
        assert.equal(f.frames.size, 0, 'Removing reduced motion must not clear manual Pause');
        assert.equal(f.timers.size, 0);
        assert.match(f.button.textContent, /Play/);
        f.reduced(true);
        f.click();
        assert.equal(f.frames.size, 1, 'Explicit Play can opt into motion under reduced motion');
        if (file === 'rufus.js') assert.equal(f.timers.size, 1);
        f.hidden(true); f.hidden(false);
        assert.equal(f.frames.size, 1, 'Visibility does not erase explicit Play');
        f.reduced(false);
        assert.equal(f.frames.size, 1);
        f.reduced(true);
        assert.equal(f.frames.size, 0, 'A new reduce preference pauses unpaused motion');
        f.click(); f.click();
        f.reduced(false);
        assert.equal(f.frames.size, 0, 'A later manual Pause still persists');
    });

    test(file + ': hidden tabs and context loss cancel work, restoration rebuilds without time jumps or duplicate loops', () => {
        const f = fixture(file, canvasId);
        f.frame(100); f.frame(140);
        const before = f.last();
        f.hidden(true);
        const drawCount = f.draws.length;
        f.pointer(1000, 800);
        f.resize(800, 600);
        f.frame(90000);
        if (file === 'rufus.js') f.elapse(20000);
        assert.equal(f.draws.length, drawCount);
        assert.equal(f.frames.size, 0);
        assert.equal(f.timers.size, 0);
        const lost = f.lose();
        assert.equal(lost.defaultPrevented, true, 'Context restoration must remain enabled');
        assert.equal(f.canvas.hidden, true);
        assert.equal(f.element('webglFallback').hidden, false);
        f.restore();
        assert.equal(f.contexts(), 2);
        assert.equal(f.draws.length, drawCount, 'Hidden restoration does not draw');
        assert.equal(f.frames.size, 0);
        assert.equal(f.timers.size, 0);
        f.hidden(false);
        assert.equal(f.canvas.hidden, false);
        assert.equal(f.element('webglFallback').hidden, true);
        assert.deepEqual(f.last().u_mouse, before.u_mouse, 'Hidden pointer input must not move the restored camera');
        assert.equal(f.last().u_time, before.u_time);
        assert.equal(f.frames.size, 1);
        if (file === 'rufus.js') assert.equal(f.timers.size, 1);
        f.document.emit('visibilitychange');
        assert.equal(f.frames.size, 1, 'Repeated visibility sync keeps exactly one frame loop');
        f.frame(100000);
        assert.equal(f.last().u_time, before.u_time, 'The hidden interval does not advance animation time');
        f.frame(100040);
        assert(f.last().u_time > before.u_time);
    });

    test(file + ': reduced-motion default stays frozen across pointer, resize and context restoration', () => {
        const f = fixture(file, canvasId, { reduced: true });
        const before = f.last();
        f.pointer(1000, 800);
        f.resize(600, 900);
        f.lose(); f.restore();
        assert.deepEqual(f.last().u_mouse, before.u_mouse);
        assert.equal(f.last().u_time, before.u_time);
        assert.equal(f.frames.size, 0);
        assert.equal(f.timers.size, 0);
        f.click();
        assert.equal(f.frames.size, 1);
        f.pointer(600, 450);
        f.frame(100); f.frame(140);
        assert(f.last().u_mouse[0] > before.u_mouse[0]);
    });

    test(file + ': unavailable graphics leaves fallback and appropriate controls usable', () => {
        const f = fixture(file, canvasId, { available: false });
        assert.equal(f.canvas.hidden, true);
        assert.equal(f.element('webglFallback').hidden, false);
        assert.equal(f.frames.size, 0);
        if (file !== 'rufus.js') {
            assert.equal(f.button.hidden, true);
            assert.equal(f.timers.size, 0);
        } else {
            assert.equal(f.button.hidden, false);
            assert.equal(f.element('.gallery-controls').hidden, false);
            assert.equal(f.timers.size, 1);
            f.element('nextPhoto').emit('click');
            assert.equal(f.element('photoCount').textContent, '2 / 9');
            f.click();
            assert.equal(f.timers.size, 0);
        }
    });

    test(file + ': visible context interruption stops graphics and one restored loop resumes at the saved time', () => {
        const f = fixture(file, canvasId);
        f.frame(100); f.frame(140);
        const before = f.last();
        const count = f.draws.length;
        assert.equal(f.lose().defaultPrevented, true);
        assert.equal(f.frames.size, 0);
        assert.equal(f.canvas.hidden, true);
        assert.equal(f.element('webglFallback').hidden, false);
        assert.equal(f.button.hidden, file !== 'rufus.js');
        f.frame(90000); f.resize();
        assert.equal(f.draws.length, count, 'Lost graphics does not draw');
        f.restore();
        assert.equal(f.canvas.hidden, false);
        assert.equal(f.element('webglFallback').hidden, true);
        assert.equal(f.button.hidden, false);
        assert.equal(f.frames.size, 1);
        assert.equal(f.last().u_time, before.u_time);
        assert.deepEqual(f.last().u_mouse, before.u_mouse);
        f.frame(100000);
        assert.equal(f.last().u_time, before.u_time);
        f.frame(100040);
        assert(f.last().u_time > before.u_time);
    });
}

test('Rufus: paused manual browsing preserves camera/time, visits all nine photos and Play resumes one slideshow', () => {
    const f = fixture('rufus.js', 'bgCanvas');
    f.click();
    const before = f.last();
    const seen = new Set([f.element('rufusImage').src]);
    for (let i = 0; i < 8; i++) {
        f.element('nextPhoto').emit('click');
        seen.add(f.element('rufusImage').src);
        assert(f.element('rufusImage').alt);
        assert(f.element('rufusImage').width > 0 && f.element('rufusImage').height > 0);
        assert.deepEqual(f.last().u_mouse, before.u_mouse);
        assert.equal(f.last().u_time, before.u_time);
        assert.equal(f.timers.size, 0);
    }
    assert.equal(seen.size, 9);
    assert.equal(f.element('photoCount').textContent, '9 / 9');
    f.element('previousPhoto').emit('click');
    assert.equal(f.element('photoCount').textContent, '8 / 9');
    f.click();
    assert.equal(f.timers.size, 1);
    const photo = f.element('rufusImage').src;
    f.elapse(5000);
    assert.notEqual(f.element('rufusImage').src, photo);
    assert.equal(f.timers.size, 1);
    f.lose();
    assert.equal(f.frames.size, 0);
    assert.equal(f.timers.size, 1, 'A lost background does not disable photo browsing');
});

test('Rufus: cached initial photo failure is announced without disabling controls, moving focus or changing playback', () => {
    for (const reduced of [false, true]) {
        const f = fixture('rufus.js', 'bgCanvas', { reduced, imageComplete: true, imageNaturalWidth: 0 });
        assert.equal(f.element('photoAnnouncement').textContent, 'This photo could not load. Try the next photo.');
        assert.equal(f.element('rufusImage').src, 'images/rufus-01.webp');
        assert.equal(f.element('photoCount').textContent, '1 / 9');
        assert.equal(f.element('.gallery-controls').hidden, false);
        assert.equal(f.button.hidden, false);
        assert.equal(f.document.activeElement, f.element('nextPhoto'));
        assert.equal(f.frames.size, reduced ? 0 : 1);
        assert.equal(f.timers.size, reduced ? 0 : 1);
        f.element('nextPhoto').emit('click');
        assert.equal(f.element('photoCount').textContent, '2 / 9');
        assert.equal(f.element('rufusImage').src, 'images/rufus-02.webp');
        assert.match(f.element('photoAnnouncement').textContent, /^Photo 2 of 9\./);
        assert.equal(f.document.activeElement, f.element('nextPhoto'));
        f.click();
        assert.equal(f.frames.size, reduced ? 1 : 0);
        assert.equal(f.timers.size, reduced ? 1 : 0);
    }
});

test('Rufus: complete successful initial photo keeps the normal gallery without an error announcement', () => {
    const f = fixture('rufus.js', 'bgCanvas', { imageComplete: true, imageNaturalWidth: 900 });
    assert.equal(f.element('photoAnnouncement').textContent, '');
    assert.equal(f.element('rufusImage').src, 'images/rufus-01.webp');
    assert.equal(f.element('photoCount').textContent, '1 / 9');
    assert.equal(f.element('.gallery-controls').hidden, false);
    assert.equal(f.frames.size, 1);
    assert.equal(f.timers.size, 1);
    assert.equal(f.document.activeElement, f.element('nextPhoto'));
});

test('Rufus: automatic successful photo recovery clears only stale error without announcing slides or moving focus', () => {
    const f = fixture('rufus.js', 'bgCanvas', { imageComplete: true, imageNaturalWidth: 0 });
    const image = f.element('rufusImage');
    const expected = 'This photo could not load. Try the next photo.';
    assert.equal(f.element('photoAnnouncement').textContent, expected);
    image.complete = false;
    f.elapse(5000);
    assert.notEqual(image.src, 'images/rufus-01.webp', 'The actual slideshow must advance to another photo');
    assert.equal(f.element('photoAnnouncement').textContent, expected, 'A pending replacement does not prove recovery');
    image.emit('load');
    assert.equal(f.element('photoAnnouncement').textContent, expected, 'A zero-width pending image cannot clear failure');
    image.naturalWidth = 900;
    image.emit('load');
    assert.equal(f.element('photoAnnouncement').textContent, expected, 'An incomplete image cannot clear failure');
    image.complete = true;
    image.naturalWidth = 0;
    image.emit('load');
    assert.equal(f.element('photoAnnouncement').textContent, expected, 'A complete failed image cannot clear failure');
    image.naturalWidth = 900;
    image.emit('load');
    assert.equal(f.element('photoAnnouncement').textContent, '', 'Successful automatic recovery must not leave the old error');
    assert.equal(f.frames.size, 1);
    assert.equal(f.timers.size, 1);
    assert.equal(f.document.activeElement, f.element('nextPhoto'));
    f.element('nextPhoto').emit('click');
    const manual = f.element('photoAnnouncement').textContent;
    assert.match(manual, /^Photo \d of 9\./);
    image.emit('load');
    assert.equal(f.element('photoAnnouncement').textContent, manual, 'Loading a manual selection keeps its announcement');
    assert.equal(f.document.activeElement, f.element('nextPhoto'));
});

test('Rufus: pending and later gallery photo errors announce recovery without altering scheduling or focus', () => {
    const f = fixture('rufus.js', 'bgCanvas', { imageComplete: false, imageNaturalWidth: 0 });
    assert.equal(f.element('photoAnnouncement').textContent, '', 'A pending request is not a failed photo');
    const image = f.element('rufusImage');
    const expected = 'This photo could not load. Try the next photo.';
    image.emit('error');
    assert.equal(f.element('photoAnnouncement').textContent, expected);
    assert.equal(f.frames.size, 1);
    assert.equal(f.timers.size, 1);
    f.element('nextPhoto').emit('click');
    assert.equal(f.element('photoCount').textContent, '2 / 9');
    assert.match(f.element('photoAnnouncement').textContent, /^Photo 2 of 9\./);
    image.emit('error');
    assert.equal(f.element('photoAnnouncement').textContent, expected);
    assert.equal(f.element('rufusImage').src, 'images/rufus-02.webp');
    assert.equal(f.element('photoCount').textContent, '2 / 9');
    assert.equal(f.frames.size, 1);
    assert.equal(f.timers.size, 1);
    assert.equal(f.document.activeElement, f.element('nextPhoto'));
    image.complete = false;
    image.emit('load');
    assert.equal(f.element('photoAnnouncement').textContent, expected);
    image.complete = true;
    image.naturalWidth = 900;
    image.emit('load');
    assert.equal(f.element('photoAnnouncement').textContent, '', 'A later successful gallery load clears its error');
    assert.equal(f.frames.size, 1);
    assert.equal(f.timers.size, 1);
    assert.equal(f.document.activeElement, f.element('nextPhoto'));
});

test('REL: wheel input and paused font refresh preserve the frozen visual', async () => {
    const f = fixture('index.js', 'kineticCanvas');
    f.canvas.emit('wheel', { deltaY: 100, ctrlKey: true });
    f.canvas.emit('wheel', { deltaY: 100, metaKey: true });
    f.resize();
    assert.equal(f.last().u_scroll, 0, 'Browser zoom gestures are not visual scroll input');
    f.canvas.emit('wheel', { deltaY: 100 });
    f.resize();
    assert.ok(f.last().u_scroll > 0 && f.last().u_scroll < 0.04, 'A wheel impulse eases toward its destination instead of jumping');
    f.click();
    const before = f.last();
    f.canvas.emit('wheel', { deltaY: 100 });
    f.pointer(1000, 800);
    await f.font();
    assert(f.uploads() >= 2, 'Font completion refreshes the actual text texture');
    assert.equal(f.last().u_scroll, before.u_scroll);
    assert.equal(f.last().u_time, before.u_time);
    assert.deepEqual(f.last().u_mouse, before.u_mouse);
    assert.equal(f.frames.size, 0);
});

test('REL: pixel, line and page wheel inputs produce equivalent smooth movement', () => {
    const offsets = [
        { deltaY: 48, deltaMode: 0 },
        { deltaY: 3, deltaMode: 1 },
        { deltaY: 0.06, deltaMode: 2 }
    ].map(input => {
        const f = fixture('index.js', 'kineticCanvas', { controls: false });
        f.frame(100);
        f.canvas.emit('wheel', input);
        let previous = 0;
        for (let step = 1; step <= 30; step++) {
            f.frame(100 + step * 1000 / 60);
            const offset = f.last().u_scroll;
            assert.ok(offset > previous && offset < 0.0192, 'Movement approaches its destination without overshoot');
            previous = offset;
        }
        return f.last().u_scroll;
    });
    offsets.forEach(offset => assert.ok(Math.abs(offset - offsets[0]) < 1e-12));
});

test('REL: wheel easing agrees over equal elapsed time at 30, 60, 120 and 144Hz', () => {
    const offsets = [30, 60, 120, 144].map(rate => {
        const f = fixture('index.js', 'kineticCanvas', { controls: false });
        f.frame(100);
        f.canvas.emit('wheel', { deltaY: 120, deltaMode: 0 });
        for (let step = 1; step <= rate / 2; step++) f.frame(100 + step * 1000 / rate);
        assert.equal(f.frames.size, 1);
        return f.last().u_scroll;
    });
    offsets.forEach(offset => assert.ok(Math.abs(offset - 0.048 * (1 - Math.pow(0.82, 30))) < 1e-12));
});

test('REL: hidden, offscreen, reduced-motion and invalid wheel input cannot alter the visual', () => {
    const f = fixture('index.js', 'kineticCanvas', { controls: false, observed: true });
    f.frame(100);
    f.canvas.emit('wheel', { deltaY: NaN });
    f.canvas.emit('wheel', { deltaY: Infinity });
    f.hidden(true); f.canvas.emit('wheel', { deltaY: 120 }); f.hidden(false);
    f.inView(false); f.canvas.emit('wheel', { deltaY: 120 }); f.inView(true);
    f.reduced(true); f.canvas.emit('wheel', { deltaY: 120 }); f.reduced(false);
    f.frame(200); f.frame(220);
    assert.equal(f.last().u_scroll, 0);
    assert.equal(f.frames.size, 1);
});

for (const [file, canvasId] of scripts) {
    test(file + ': actual script works without a motion control and respects system motion changes', () => {
        const f = fixture(file, canvasId, { controls: false });
        assert.equal(f.frames.size, 1);
        f.frame(100); f.frame(116.7);
        f.reduced(true);
        assert.equal(f.frames.size, 0);
        assert.equal(f.timers.size, 0);
        const before = f.last();
        f.pointer(900, 700); f.resize(); f.lose(); f.restore();
        assert.deepEqual(f.last().u_mouse, before.u_mouse);
        assert.equal(f.last().u_time, before.u_time);
        f.reduced(false);
        assert.equal(f.frames.size, 1);
    });
    if (file !== 'rufus.js') test(file + ': renders each animation frame at a 60Hz cadence', () => {
        const f = fixture(file, canvasId, { controls: false });
        const before = f.draws.length;
        f.frame(100); f.frame(116.7); f.frame(133.4);
        assert.equal(f.draws.length - before, 3);
        assert.equal(f.frames.size, 1);
    });
}
test('REL: scrolling offscreen suspends drawing, font refresh and animation time; returning resumes one loop', async () => {
    const f = fixture('index.js', 'kineticCanvas', { controls: false, observed: true });
    f.frame(100); f.frame(120);
    f.inView(false);
    const before = f.last(), count = f.draws.length;
    assert.equal(f.frames.size, 0);
    f.resize(); await f.font(); f.frame(90000); f.pointer(900, 700);
    assert.equal(f.draws.length, count);
    f.inView(true);
    assert.equal(f.frames.size, 1);
    assert.equal(f.last().u_time, before.u_time);
    f.frame(100000);
    assert.equal(f.last().u_time, before.u_time);
});

for (const [file, canvasId] of scripts.filter(([file]) => file !== 'rufus.js')) {
    test(file + ': pointer easing agrees after equal elapsed time at 30, 60, 120 and 144Hz', () => {
        const positions = [30, 60, 120, 144].map(rate => {
            const f = fixture(file, canvasId, { controls: false });
            f.frame(100);
            f.pointer(750, 200);
            for (let step = 1; step <= rate / 2; step++) f.frame(100 + step * 1000 / rate);
            assert.equal(f.frames.size, 1);
            assert.ok(Math.abs(f.last().u_time - 0.5) < 1e-10);
            return f.last().u_mouse;
        });
        for (const position of positions) {
            for (let axis = 0; axis < 2; axis++) {
                assert.ok(Math.abs(position[axis] - positions[1][axis]) < 1e-10,
                    'Pointer response must not accelerate on faster displays');
            }
        }
        const irregular = fixture(file, canvasId, { controls: false });
        irregular.frame(100);
        irregular.pointer(750, 200);
        for (const timestamp of [107, 133, 180, 223, 311, 400, 450, 510, 600]) irregular.frame(timestamp);
        for (let axis = 0; axis < 2; axis++) {
            assert.ok(Math.abs(irregular.last().u_mouse[axis] - positions[1][axis]) < 1e-10,
                'Uneven frame spacing must preserve the same response');
        }
    });
}

test('Rufus: the 30fps budget stays evenly paced at 60, 120 and 144Hz without catch-up bursts', () => {
    for (const rate of [60, 120, 144]) {
        const f = fixture('rufus.js', 'bgCanvas', { controls: false });
        f.frame(1000);
        const before = f.draws.length;
        for (let step = 1; step <= rate * 2; step++) f.frame(1000 + step * 1000 / rate);
        assert.equal(f.draws.length - before, 60, rate + 'Hz should render the intended 30fps over two seconds');
        const after = f.draws.length;
        f.frame(9000);
        assert.equal(f.draws.length - after, 1, 'A long stall renders one frame rather than replaying missed work');
        f.frame(9000 + 1000 / rate);
        assert.equal(f.draws.length - after, 1, 'The next frame keeps the budget after a stall');
        f.hidden(true);
        f.hidden(false);
        assert.equal(f.frames.size, 1, 'Resume maintains exactly one animation loop');
    }
});

for (const { name, run } of tests) {
    await run();
    console.log('PASS ' + name);
}
console.log(tests.length + ' visual lifecycle regression checks passed.');
