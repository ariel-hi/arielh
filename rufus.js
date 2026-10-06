/* Rufus — original cosmic shader and names, with an accessible gallery. */
(() => {
    'use strict';
    const canvas = document.getElementById('bgCanvas');
const names = [
    'Rufus', 'RUFUS', 'Rufus!', 'Bluefus', 'Truefus', 'Goofus', 'Jewfus', 'Moofus',
    'Twofus', 'Throughfus', 'Woofus', 'Zeusfus',
    'Confucius', 'Massachusetts', 'Proofus', 'Brewfus', 'Truefus',
    'Crewfus', 'Kalamazoofus', 'Zoofus', 'Whereareyoufus',
    'Kangaroofus', 'Queuefus', 'Hullabaloofus',
    'Lecordonbleufus', 'Peekaboofus', 'Bartholomewfus', 'I\'mlookingatyoufus',
    'Matthewfus', 'Andrewfus', 'Misconstruefus', 'Pursuefus', 'Howdoyoudofus',
    'Cashewfus', 'Honeydewfus', 'Shampoofus', 'Tattoofus', 'Taboofus', 'Bamboofus',
    'Waterloofus', 'Tofufus', 'Fonduefus', 'Shoefus', 'Gluefus', 'Cluefus'
];
const vsSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
const fsSpace = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec3 u_color;
uniform vec2 u_mouse;

#define iterations 17
#define formuparam 0.53
#define volsteps 20
#define stepsize 0.1
#define zoom   0.800
#define tile   0.850
#define speed  0.010 
#define brightness 0.0009
#define darkmatter 0.300
#define distfading 0.730
#define saturation 0.180

void main() {
    vec2 uv = v_uv - 0.5;
    uv.x *= u_resolution.x / u_resolution.y;
    
    // Mouse Interaction
    vec2 mouse = u_mouse * 2.0 - 1.0;
    mouse.x *= u_resolution.x / u_resolution.y;
    
    // 1. Parallax: Shift view based on mouse
    vec3 dir = vec3(uv * zoom, 1.0);
    dir.xy += mouse * 0.05; // Subtle shift
    
    // 2. Gravitational Lensing (Distortion)
    float dist = length(uv - mouse * 0.5);
    float lens = smoothstep(0.5, 0.0, dist);
    dir.xy -= (uv - mouse * 0.5) * lens * 0.1;

    float time = u_time * speed + 0.25;

    // Animate the "from" position to fly through space
    vec3 from = vec3(1.0, 0.5, 0.5);
    from += vec3(time * 2.0, time, -2.0);
    
    // Add mouse influence to movement
    from.xy += mouse * 0.1;
    
    float s = 0.1, fade = 1.0;
    vec3 v = vec3(0.0);
    
    for (int r = 0; r < volsteps; r++) {
        vec3 p = from + s * dir * 0.5;
        p = abs(vec3(tile) - mod(p, vec3(tile * 2.0)));
        float pa, a = pa = 0.0;
        for (int i = 0; i < iterations; i++) { 
            p = abs(p) / dot(p, p) - formuparam;
            a += abs(length(p) - pa);
            pa = length(p);
        }
        float dm = max(0.0, darkmatter - a * a * 0.001);
        a *= a * a;
        if (r > 6) fade *= 1.0 - dm;
        v += fade;
        v += vec3(s, s * s, s * s * s * s) * a * brightness * fade;
        fade *= distfading;
        s += stepsize;
    }
    
    v = mix(vec3(length(v)), v, saturation);
    
    // Apply the randomized color tint
    vec3 finalColor = v * 0.01;
    finalColor *= u_color * 2.5; // Boost intensity
    
    // Vignette
    finalColor *= 1.0 - length(uv) * 0.5;
    
    outColor = vec4(finalColor, 1.0);
}
`;
// Quiet, near-neutral tints so the photos carry the color.
const spaceColors = [
    [0.55, 0.52, 0.48], // Bone
    [0.60, 0.46, 0.38], // Ember dust
    [0.42, 0.47, 0.48]  // Cool slate
];
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionButton = document.getElementById('motionToggle');
    const fallback = document.getElementById('webglFallback');
    let manuallyPaused = false;
    let paused = motionPreference.matches;
    let renderer = null;
    let gl = null;
    let frameId = 0;
    let lastTick = 0;
    let lastDraw = 0;
    let time = 0;
    let mouseX = 0.5;
    let mouseY = 0.5;
    let targetMouseX = 0.5;
    let targetMouseY = 0.5;
    let currentColor = [0.1, 0.4, 0.8];

    function render(timestamp) {
        frameId = 0;
        if (!renderer || paused || document.hidden) return;
        if (lastTick) time += Math.min(timestamp - lastTick, 100) * 0.001;
        lastTick = timestamp;
        // Keep the 30fps budget aligned instead of discarding fractional frame time.
        const interval = 1000 / 30;
        const elapsed = timestamp - lastDraw;
        if (elapsed >= interval - 0.01) {
            renderer.draw(time);
            // Skip missed frames after a stall; never replay expensive fragment work.
            lastDraw += Math.max(1, Math.floor((elapsed + 0.01) / interval)) * interval;
        }
        frameId = requestAnimationFrame(render);
    }
    function syncMotion() {
        cancelAnimationFrame(frameId);
        frameId = 0;
        lastTick = 0;
        lastDraw = 0;
        if (motionButton) motionButton.hidden = false;
        if (motionButton) motionButton.textContent = paused ? 'Play' : 'Pause';
        if (motionButton) motionButton.setAttribute('aria-label', paused ? 'Play slideshow and background animation' : 'Pause slideshow and background animation');
        if (renderer && !document.hidden) {
            renderer.draw(time);
            if (!paused) frameId = requestAnimationFrame(render);
        }
        scheduleSlideshow();
    }
    function showFallback(message) {
        fallback.textContent = message;
        fallback.hidden = false;
        canvas.hidden = true;
    }
    function initializeVisual() {
        try {
            renderer = createRenderer();
            renderer.resize();
            fallback.hidden = true;
            canvas.hidden = false;
        } catch (error) {
            renderer = null;
            showFallback('The animated background is unavailable in this browser. All nine photos are still here.');
        }
        syncMotion();
    }
    motionButton?.addEventListener('click', () => {
        // Play can opt into motion even when the system preference is reduced.
        manuallyPaused = !paused;
        paused = manuallyPaused;
        syncMotion();
    });
    motionPreference.addEventListener('change', (event) => {
        paused = manuallyPaused || event.matches;
        syncMotion();
    });
    document.addEventListener('visibilitychange', syncMotion);
    window.addEventListener('resize', () => {
        if (!renderer) return;
        renderer.resize();
        if (!document.hidden) renderer.draw(time);
    });
    function trackPointer(event) {
        if (paused || document.hidden) return;
        targetMouseX = Math.min(1, Math.max(0, event.clientX / window.innerWidth));
        targetMouseY = 1 - Math.min(1, Math.max(0, event.clientY / window.innerHeight));
    }
    canvas.addEventListener('pointermove', trackPointer);
    canvas.addEventListener('pointerdown', trackPointer);
    canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        renderer = null;
        showFallback('The animated background was interrupted. You can keep browsing the photos.');
        syncMotion();
    });
    canvas.addEventListener('webglcontextrestored', initializeVisual);

    // Shader uniforms and buffers are created once, outside the animation loop.
    function createRenderer() {
        const context = canvas.getContext('webgl2', { antialias: false, alpha: false });
        if (!context) throw new Error('WebGL 2 is unavailable.');
        gl = context;
        function compile(type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                gl.deleteShader(shader);
                throw new Error('The visual could not be compiled.');
            }
            return shader;
        }
        const vertex = compile(gl.VERTEX_SHADER, vsSource);
        const fragment = compile(gl.FRAGMENT_SHADER, fsSpace);
        const program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.bindAttribLocation(program, 0, 'a_position');
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            gl.deleteProgram(program);
            throw new Error('The visual could not be initialized.');
        }
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1
        ]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const uniforms = {
            time: gl.getUniformLocation(program, 'u_time'),
            resolution: gl.getUniformLocation(program, 'u_resolution'),
            mouse: gl.getUniformLocation(program, 'u_mouse'),
            color: gl.getUniformLocation(program, 'u_color')
        };
        return {
            resize() {
                const width = Math.max(1, window.innerWidth);
                const height = Math.max(1, window.innerHeight);
                // Limit expensive fragment work on high-density and very large displays.
                const scale = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1800000 / (width * height)));
                canvas.width = Math.max(1, Math.floor(width * scale));
                canvas.height = Math.max(1, Math.floor(height * scale));
                gl.viewport(0, 0, canvas.width, canvas.height);
            },
            draw(time) {
                if (!paused) {
                    mouseX += (targetMouseX - mouseX) * 0.08;
                    mouseY += (targetMouseY - mouseY) * 0.08;
                }
                gl.useProgram(program);
                gl.bindVertexArray(vao);
                gl.uniform1f(uniforms.time, time);
                gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
                gl.uniform2f(uniforms.mouse, mouseX, mouseY);
                if (uniforms.color !== null) gl.uniform3fv(uniforms.color, currentColor);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }
        };
    }

    const photos = [
        { src: 'images/rufus-01.webp', width: 900, height: 1600, alt: 'Rufus sleeping on a burgundy blanket with his tongue hanging out.' },
        { src: 'images/rufus-02.webp', width: 900, height: 1600, alt: 'Rufus standing on a gray couch beside a red toy, licking his nose.' },
        { src: 'images/rufus-03.webp', width: 900, height: 1600, alt: 'A close-up of Rufus asleep on a burgundy blanket, his tongue resting outside his mouth.' },
        { src: 'images/rufus-04.webp', width: 900, height: 1600, alt: 'Rufus looking up from a patterned rug with his tongue curled over his nose.' },
        { src: 'images/rufus-05.webp', width: 900, height: 1600, alt: 'Rufus enjoying a chin scratch while standing on a tiled floor.' },
        { src: 'images/rufus-06.webp', width: 900, height: 1600, alt: 'Rufus resting his head on a turquoise toy while someone scratches his forehead.' },
        { src: 'images/rufus-07.webp', width: 576, height: 1024, alt: 'Rufus sitting on a burgundy blanket with his tongue out during a chest scratch.' },
        { src: 'images/rufus-08.webp', width: 576, height: 1024, alt: 'Rufus looking up beside a chair with one eye closed as someone scratches his neck.' },
        { src: 'images/rufus-09.webp', width: 576, height: 1024, alt: 'Rufus licking his nose with his eyes closed beside a chair.' }
    ];
    const image = document.getElementById('rufusImage');
    const name = document.getElementById('randomName');
    const count = document.getElementById('photoCount');
    const announcement = document.getElementById('photoAnnouncement');
    let currentPhoto = 0;
    let slideshowTimer = 0;
    const backdrop = document.getElementById('rufusBackdrop');
    const thumbList = document.getElementById('rufusThumbs');
    const thumbButtons = [];
    // Every photo stays one click away; the list is built only where the DOM supports it.
    if (thumbList && typeof thumbList.append === 'function' && typeof document.createElement === 'function') {
        photos.forEach((photo, index) => {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'rufus-thumb';
            button.setAttribute('aria-label', 'Show photo ' + (index + 1) + ': ' + photo.alt);
            const thumb = document.createElement('img');
            thumb.src = photo.src;
            thumb.alt = '';
            thumb.loading = 'lazy';
            thumb.decoding = 'async';
            button.append(thumb);
            button.addEventListener('click', () => showPhoto(index, true));
            item.append(button);
            thumbList.append(item);
            thumbButtons.push(button);
        });
    }
    function syncSelection() {
        thumbButtons.forEach((button, index) => {
            if (index === currentPhoto) button.setAttribute('aria-current', 'true');
            else button.removeAttribute('aria-current');
        });
        if (backdrop && backdrop.style) backdrop.style.backgroundImage = 'url("' + photos[currentPhoto].src + '")';
    }

    function nextRandomPhoto() {
        // Pick any other photo without a retry loop.
        return (currentPhoto + 1 + Math.floor(Math.random() * (photos.length - 1))) % photos.length;
    }
    function showPhoto(index, announce = false) {
        currentPhoto = (index + photos.length) % photos.length;
        const photo = photos[currentPhoto];
        image.alt = photo.alt;
        image.width = photo.width;
        image.height = photo.height;
        image.src = photo.src;
        name.textContent = names[Math.floor(Math.random() * names.length)];
        count.textContent = (currentPhoto + 1) + ' / ' + photos.length;
        syncSelection();
        const baseColor = spaceColors[Math.floor(Math.random() * spaceColors.length)];
        currentColor = baseColor.map(channel => Math.max(0, Math.min(1, channel + (Math.random() - 0.5) * 0.2)));
        if (renderer && !document.hidden) renderer.draw(time);
        if (announce) announcement.textContent = 'Photo ' + (currentPhoto + 1) + ' of ' + photos.length + '. ' + photo.alt;
        scheduleSlideshow();
    }
    function scheduleSlideshow() {
        clearTimeout(slideshowTimer);
        slideshowTimer = 0;
        if (paused || document.hidden) return;
        slideshowTimer = setTimeout(() => showPhoto(nextRandomPhoto()), 5000);
    }
    document.getElementById('previousPhoto').addEventListener('click', () => showPhoto(currentPhoto - 1, true));
    document.getElementById('nextPhoto').addEventListener('click', () => showPhoto(currentPhoto + 1, true));
    document.addEventListener('keydown', (event) => {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey
            || event.target?.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        showPhoto(currentPhoto + (event.key === 'ArrowLeft' ? -1 : 1), true);
    });
    const photoErrorMessage = 'This photo could not load. Try the next photo.';
    function reportPhotoError() {
        announcement.textContent = photoErrorMessage;
    }
    function clearPhotoError() {
        if (image.complete && image.naturalWidth > 0 && announcement.textContent === photoErrorMessage) {
            announcement.textContent = '';
        }
    }
    image.addEventListener('error', reportPhotoError);
    image.addEventListener('load', clearPhotoError);
    if (image.complete && image.naturalWidth === 0) reportPhotoError();
    document.querySelector('.gallery-controls').hidden = false;
    syncSelection();

    initializeVisual();
})();
