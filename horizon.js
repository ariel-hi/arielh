/* Horizon: a ray-traced Schwarzschild black hole with a thin accretion disk. */
(() => {
    'use strict';
    const canvas = document.getElementById('glCanvas');
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
uniform float u_zoom;

// Units: Schwarzschild radius = 1. The photon sphere sits at 1.5, the innermost stable orbit at 3.
const float DISK_IN = 3.0;
const float DISK_OUT = 15.0;

float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
}
float hash12(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
}
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x),
               mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p * 2.02 + 3.1; a *= 0.5; }
    return v;
}

// Point stars, tinted by a rough stellar temperature.
vec3 starLayer(vec3 d, float scale, float density) {
    vec3 p = d * scale;
    vec3 id = floor(p);
    vec3 f = fract(p) - 0.5;
    float h = hash13(id);
    if (h < 1.0 - density) return vec3(0.0);
    vec3 off = vec3(hash13(id + 1.7), hash13(id + 4.3), hash13(id + 9.1)) - 0.5;
    float dist = length(f - off * 0.7);
    float mag = pow((h - (1.0 - density)) / density, 4.0);
    float core = exp(-dist * dist * 260.0) * (0.25 + 4.0 * mag);
    vec3 tint = mix(vec3(1.0, 0.72, 0.48), vec3(0.72, 0.82, 1.0), hash13(id + 2.9));
    return tint * core;
}

// Background sky: a tilted galactic band with dust lanes, plus stars.
vec3 sky(vec3 d) {
    vec3 n = normalize(vec3(0.25, 0.92, 0.3));
    float lat = dot(d, n);
    vec3 e1 = normalize(cross(n, vec3(0.0, 0.0, 1.0)));
    vec3 e2 = cross(n, e1);
    vec2 sp = vec2(atan(dot(d, e2), dot(d, e1)), lat);
    float band = exp(-lat * lat * 14.0);
    float clouds = fbm(sp * vec2(2.5, 9.0) + 4.0);
    float dust = smoothstep(0.42, 0.75, fbm(sp * vec2(4.0, 16.0) - 2.0));
    vec3 glow = mix(vec3(0.33, 0.26, 0.20), vec3(0.18, 0.21, 0.30), clouds) * band * (0.35 + clouds);
    glow *= 1.0 - dust * 0.85 * band;
    float core = exp(-pow(length(sp - vec2(1.2, 0.0)) * 1.3, 2.0)) * band;
    glow += vec3(0.55, 0.38, 0.22) * core * 0.6 * (1.0 - dust * 0.7);
    vec3 stars = starLayer(d, 110.0, 0.09) * 0.8 + starLayer(d, 230.0, 0.12) * 0.45 + starLayer(d, 55.0, 0.04) * 1.6;
    stars *= 1.0 + band * 1.5;
    return glow * 0.07 + stars * (1.0 - dust * band * 0.8);
}

vec3 blackbody(float t) {
    // t: 0 is a deep red ember, 1 is white-hot, above 1 drifts blue-white.
    vec3 c = mix(vec3(0.55, 0.06, 0.01), vec3(1.0, 0.42, 0.10), smoothstep(0.0, 0.45, t));
    c = mix(c, vec3(1.0, 0.86, 0.68), smoothstep(0.4, 0.85, t));
    return mix(c, vec3(0.78, 0.86, 1.0), smoothstep(0.9, 1.6, t));
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// Emission and opacity of the thin disk where a ray crosses its plane.
vec4 disk(vec3 hp, vec3 rayDir) {
    float r = length(hp.xz);
    if (r < DISK_IN * 0.92 || r > DISK_OUT) return vec4(0.0);
    float edge = smoothstep(DISK_IN * 0.92, DISK_IN * 1.15, r) * smoothstep(DISK_OUT, DISK_OUT * 0.55, r);
    // Keplerian speed (Paczynski-Wiita potential) and differential rotation.
    float v = clamp(sqrt(0.5 / (r - 1.0)), 0.0, 0.7);
    float omega = v / r;
    vec2 q = rot(u_time * omega * 2.2) * hp.xz;
    vec2 nq = q / r;
    float lanes = fbm(vec2(log(r) * 7.0, 0.0) + nq * 2.6);
    float streak = fbm(nq * 5.0 + vec2(r * 0.9, -r * 0.5));
    float rings = 0.86 + 0.14 * sin(log(r) * 60.0 + lanes * 10.0);
    float dens = edge * (0.3 + 0.9 * lanes * lanes + 0.3 * streak) * rings;
    // Relativistic Doppler beaming and gravitational redshift.
    vec3 tangent = normalize(vec3(-hp.z, 0.0, hp.x));
    float cosTheta = dot(tangent, -rayDir);
    float gamma = inversesqrt(1.0 - v * v);
    float doppler = 1.0 / (gamma * (1.0 - v * cosTheta));
    float grav = sqrt(max(1.0 - 1.0 / r, 0.0));
    float shift = doppler * grav;
    float temp = pow(DISK_IN / r, 0.75) * pow(max(1.0 - sqrt(DISK_IN / r), 0.0) + 0.02, 0.25);
    float t = temp * 1.45 * shift;
    vec3 col = blackbody(t) * pow(shift, 3.5) * temp * 2.4 * dens;
    float alpha = clamp(dens * 1.1, 0.0, 0.92);
    return vec4(col, alpha);
}

void main() {
    vec2 uv = (v_uv - 0.5) * u_resolution / u_resolution.y;
    // The camera orbit follows the pointer and also drifts slowly on its own.
    float az = (u_mouse.x - 0.5) * 3.6 + u_time * 0.025;
    float el = 0.08 + (u_mouse.y - 0.5) * 1.15;
    float dist = 30.0 * u_zoom;
    vec3 ro = dist * vec3(cos(el) * sin(az), sin(el), cos(el) * cos(az));
    vec3 fwd = normalize(-ro);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
    vec3 up = cross(fwd, right);
    vec3 rd = normalize(fwd * 1.7 + right * uv.x + up * uv.y);

    vec3 pos = ro;
    vec3 vel = rd;
    vec3 L = cross(pos, vel);
    float h2 = dot(L, L);
    vec3 col = vec3(0.0);
    float trans = 1.0;
    bool captured = false;
    for (int i = 0; i < 260; i++) {
        float r2 = dot(pos, pos);
        float r = sqrt(r2);
        if (r < 1.0) { captured = true; break; }
        if (r > dist * 1.6 && dot(pos, vel) > 0.0) break;
        float dt = clamp(0.06 * r, 0.015, 1.2);
        vec3 prev = pos;
        // Photon geodesic in Schwarzschild coordinates: a = -3/2 h^2 r_hat / r^4.
        vel += -1.5 * h2 * pos / (r2 * r2 * r) * dt;
        pos += vel * dt;
        if (prev.y * pos.y < 0.0) {
            vec3 hp = mix(prev, pos, prev.y / (prev.y - pos.y));
            vec4 d = disk(hp, normalize(vel));
            col += trans * d.rgb * d.a;
            trans *= 1.0 - d.a;
            if (trans < 0.02) break;
        }
    }
    if (!captured) col += trans * sky(normalize(vel));

    // Filmic exposure, gentle vignette and grain.
    col = 1.0 - exp(-col * 1.1);
    col *= 1.0 - 0.7 * dot(v_uv - 0.5, v_uv - 0.5);
    col = pow(max(col, vec3(0.0)), vec3(0.4545));
    col += (hash12(gl_FragCoord.xy + fract(u_time) * 61.0) - 0.5) * 0.012;
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
    let zoom = 1;
    let targetZoom = 1;

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
    // Scroll moves the camera closer or farther, eased like the pointer.
    canvas.addEventListener('wheel', (event) => {
        if (event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        targetZoom = Math.min(1.8, Math.max(0.45, targetZoom * Math.exp(event.deltaY * 0.0012)));
        if (paused && renderer) { zoom = targetZoom; renderer.draw(time); }
    }, { passive: false });
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
            color: gl.getUniformLocation(program, 'u_color'),
            zoom: gl.getUniformLocation(program, 'u_zoom')
        };
        return {
            resize() {
                const width = Math.max(1, window.innerWidth);
                const height = Math.max(1, window.innerHeight);
                // Limit expensive fragment work on high-density and very large displays.
                const scale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(1600000 / (width * height)));
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
                    zoom += (targetZoom - zoom) * blend;
                }
                gl.useProgram(program);
                gl.bindVertexArray(vao);
                gl.uniform1f(uniforms.time, time);
                gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
                gl.uniform2f(uniforms.mouse, mouseX, mouseY);
                gl.uniform1f(uniforms.zoom, zoom);
                if (uniforms.color !== null) gl.uniform3fv(uniforms.color, currentColor);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }
        };
    }

    initializeVisual();
})();
