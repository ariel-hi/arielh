/* Nebula: layered narrowband gas, dust lanes and parallax stars. */
(() => {
    'use strict';
    const canvas = document.getElementById('glcanvas');
const vsSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fsSource = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

// Noise Functions
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

#define OCTAVES 6
float fbm(in vec2 st) {
    float value = 0.0;
    float amplitude = .5;
    float frequency = 0.;
    for (int i = 0; i < OCTAVES; i++) {
        value += amplitude * noise(st);
        st *= 2.;
        amplitude *= .5;
    }
    return value;
}

float hash21(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
}

// One layer of stars on a jittered grid. Bright ones get four-point diffraction spikes.
vec3 stars(vec2 p, float scale, float density, float spikes) {
    vec2 g = p * scale;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash21(id);
    if (h < 1.0 - density) return vec3(0.0);
    vec2 off = vec2(hash21(id + 3.1), hash21(id + 7.7)) - 0.5;
    vec2 d = f - off * 0.6;
    float mag = pow((h - (1.0 - density)) / density, 3.0);
    float twinkle = 0.85 + 0.15 * sin(u_time * (1.0 + h * 3.0) + h * 40.0);
    float core = exp(-dot(d, d) * 2200.0) * (0.3 + 2.4 * mag);
    float halo = exp(-length(d) * 34.0) * mag * 0.35;
    float spike = spikes * mag * mag * (exp(-abs(d.x) * 420.0) + exp(-abs(d.y) * 420.0)) * exp(-length(d) * 9.0);
    vec3 tint = mix(vec3(1.0, 0.78, 0.58), vec3(0.74, 0.84, 1.0), hash21(id + 1.9));
    return tint * (core + halo + spike) * twinkle;
}

void main() {
    vec2 st = (gl_FragCoord.xy / u_resolution.xy - 0.5) * 2.6;
    st.x *= u_resolution.x / u_resolution.y;
    // Layers shift by different amounts with the pointer, so it reads as depth.
    vec2 look = (u_mouse - 0.5);
    vec2 pGas = st + look * 0.12;
    vec2 pDust = st + look * 0.2;
    vec2 pNear = st + look * 0.32;
    float t = u_time;

    // Domain-warped gas.
    vec2 q = vec2(fbm(pGas + 0.01 * t), fbm(pGas + vec2(5.2, 1.3)));
    vec2 r = vec2(fbm(pGas + 1.6 * q + vec2(1.7, 9.2) + 0.03 * t),
                  fbm(pGas + 1.6 * q + vec2(8.3, 2.8) + 0.026 * t));
    float f = fbm(pGas + 1.8 * r);

    // Narrowband emission: hydrogen-alpha red, doubly ionized oxygen teal, sulphur gold.
    float ha = smoothstep(0.35, 0.95, f) * (0.6 + 0.6 * q.x);
    float oiii = smoothstep(0.4, 0.9, fbm(pGas * 1.3 + r * 1.2 + vec2(3.0, -2.0))) * smoothstep(1.6, 0.2, length(pGas - vec2(0.3, 0.1)));
    float sii = pow(smoothstep(0.5, 1.0, f), 2.0) * r.y;
    vec3 gas = vec3(0.85, 0.16, 0.08) * ha + vec3(0.08, 0.52, 0.55) * oiii * 0.9 + vec3(0.95, 0.62, 0.22) * sii * 0.8;
    float filaments = pow(max(0.0, 1.0 - abs(f - 0.58) * 9.0), 4.0);
    gas += vec3(1.0, 0.82, 0.62) * filaments * 0.35 * (ha + oiii);

    // A young cluster at the core lights the gas from inside.
    vec2 coreP = vec2(0.25, 0.05);
    float coreD = length(pGas - coreP);
    float illum = 0.35 + 1.1 * exp(-coreD * 1.6);
    gas *= illum;
    gas += vec3(1.0, 0.86, 0.7) * exp(-coreD * 7.0) * 0.45;

    // Dark dust lanes absorb whatever lies behind them; their edges catch light.
    float dustField = fbm(pDust * 1.6 + r * 0.6 + vec2(11.0, 4.0));
    float dust = smoothstep(0.52, 0.72, dustField);
    float rim = smoothstep(0.46, 0.52, dustField) * (1.0 - dust);

    vec3 far = stars(st + look * 0.04, 34.0, 0.12, 0.0) * 0.6 + stars(st + look * 0.06, 70.0, 0.1, 0.0) * 0.35;
    vec3 mid = stars(st + look * 0.1, 16.0, 0.08, 0.6);
    vec3 near = stars(pNear, 7.0, 0.07, 1.6) * 1.8;

    vec3 col = vec3(0.006, 0.006, 0.01) + far * (1.0 - 0.8 * smoothstep(0.3, 0.9, f));
    col += gas * 1.15;
    col += mid * 1.2;
    col *= 1.0 - dust * 0.92;
    col += vec3(0.9, 0.55, 0.35) * rim * ha * illum * 0.35;
    col += near;

    // Vignette and filmic tone map.
    vec2 uv = v_uv - 0.5;
    col *= 1.0 - smoothstep(0.35, 0.95, length(uv));
    col = vec3(1.0) - exp(-col * 1.55);
    col = pow(max(col, vec3(0.0)), vec3(0.85));
    col += (hash21(gl_FragCoord.xy + fract(t) * 91.0) - 0.5) * 0.01;
    outColor = vec4(col, 1.0);
}
`;
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
        const delta = lastTick ? Math.min(Math.max(timestamp - lastTick, 0), 100) * 0.001 : 1 / 60;
        if (lastTick) time += delta;
        lastTick = timestamp;
        renderer.draw(time, delta);
        lastDraw = timestamp;
        frameId = requestAnimationFrame(render);
    }
    function syncMotion() {
        cancelAnimationFrame(frameId);
        frameId = 0;
        lastTick = 0;
        lastDraw = 0;
        if (motionButton) motionButton.hidden = !renderer;
        if (motionButton) motionButton.textContent = paused ? 'Play' : 'Pause';
        if (motionButton) motionButton.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
        if (renderer && !document.hidden) {
            renderer.draw(time);
            if (!paused) frameId = requestAnimationFrame(render);
        }

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
            showFallback('This browser cannot display the WebGL experiment. Try a browser with WebGL 2 enabled; the rest of the site is still available.');
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
        showFallback('The visual was interrupted. It will return when your browser restores its graphics connection.');
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
        const fragment = compile(gl.FRAGMENT_SHADER, fsSource);
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
                const scale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3200000 / (width * height)));
                canvas.width = Math.max(1, Math.floor(width * scale));
                canvas.height = Math.max(1, Math.floor(height * scale));
                gl.viewport(0, 0, canvas.width, canvas.height);
            },
            draw(time, delta = 1 / 60) {
                if (!paused) {
                    // Match the existing 60Hz easing at any animation-frame cadence.
                    const blend = 1 - Math.pow(0.92, delta * 60);
                    mouseX += (targetMouseX - mouseX) * blend;
                    mouseY += (targetMouseY - mouseY) * blend;
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

    initializeVisual();
})();
