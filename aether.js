/*
 * The Aether - WebGL Fluid Simulation
 * Based on "Real-Time Fluid Dynamics for Games" by Jos Stam
 * and GPU Gems implementations.
 */

const canvas = document.getElementById('glcanvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const gl = canvas.getContext('webgl2', { alpha: false });

if (!gl) {
    console.error('WebGL 2 not supported');
    document.body.innerHTML = 'WebGL 2 is required for this experience.';
}

// Configuration
const config = {
    TEXTURE_DOWNSAMPLE: 0, // Full resolution
    DENSITY_DISSIPATION: 0.98,
    VELOCITY_DISSIPATION: 0.99,
    PRESSURE_DISSIPATION: 0.8,
    PRESSURE_ITERATIONS: 20,
    CURL: 30,
    SPLAT_RADIUS: 0.0025,
    SPLAT_FORCE: 6000,
    SHADING: true
};

// State
let pointers = [];
let splatStack = [];

// GL Extensions
gl.getExtension('EXT_color_buffer_float');

// Shaders
const baseVertexShader = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 texelSize;

void main () {
    vUv = aPosition * 0.5 + 0.5;
    vL = vUv - vec2(texelSize.x, 0.0);
    vR = vUv + vec2(texelSize.x, 0.0);
    vT = vUv + vec2(0.0, texelSize.y);
    vB = vUv - vec2(0.0, texelSize.y);
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const clearShader = `#version 300 es
precision highp float;
uniform float value;
out vec4 fragColor;

void main () {
    fragColor = value * vec4(1.0, 1.0, 1.0, 1.0);
}
`;

const displayShader = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTexture;
out vec4 fragColor;

void main () {
    vec3 c = texture(uTexture, vUv).rgb;
    // Simple tone mapping
    c = c / (c + vec3(1.0));
    fragColor = vec4(c, 1.0);
}
`;

const splatShader = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
out vec4 fragColor;

void main () {
    vec2 p = vUv - point.xy;
    p.x *= aspectRatio;
    vec3 splat = exp(-dot(p, p) / radius) * color;
    vec3 base = texture(uTarget, vUv).xyz;
    fragColor = vec4(base + splat, 1.0);
}
`;

const advectionShader = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
out vec4 fragColor;

void main () {
    vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
    vec4 result = texture(uSource, coord);
    fragColor = result * dissipation;
}
`;

const divergenceShader = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
out vec4 fragColor;

void main () {
    float L = texture(uVelocity, vL).x;
    float R = texture(uVelocity, vR).x;
    float T = texture(uVelocity, vT).y;
    float B = texture(uVelocity, vB).y;
    
    vec2 C = texture(uVelocity, vUv).xy;
    if (vL.x < 0.0) { L = -C.x; }
    if (vR.x > 1.0) { R = -C.x; }
    if (vT.y > 1.0) { T = -C.y; }
    if (vB.y < 0.0) { B = -C.y; }

    float div = 0.5 * (R - L + T - B);
    fragColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

const curlShader = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
out vec4 fragColor;

void main () {
    float L = texture(uVelocity, vL).y;
    float R = texture(uVelocity, vR).y;
    float T = texture(uVelocity, vT).x;
    float B = texture(uVelocity, vB).x;
    float vorticity = R - L - T + B;
    fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}
`;

const vorticityShader = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
out vec4 fragColor;

void main () {
    float L = texture(uCurl, vL).x;
    float R = texture(uCurl, vR).x;
    float T = texture(uCurl, vT).x;
    float B = texture(uCurl, vB).x;
    float C = texture(uCurl, vUv).x;

    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 0.0001;
    force *= curl * C;
    force.y *= -1.0;

    vec2 vel = texture(uVelocity, vUv).xy;
    fragColor = vec4(vel + force * dt, 0.0, 1.0);
}
`;

const pressureShader = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
out vec4 fragColor;

void main () {
    float L = texture(uPressure, vL).x;
    float R = texture(uPressure, vR).x;
    float T = texture(uPressure, vT).x;
    float B = texture(uPressure, vB).x;
    float C = texture(uPressure, vUv).x;
    float divergence = texture(uDivergence, vUv).x;
    float pressure = (L + R + B + T - divergence) * 0.25;
    fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

const gradientSubtractShader = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
out vec4 fragColor;

void main () {
    float L = texture(uPressure, vL).x;
    float R = texture(uPressure, vR).x;
    float T = texture(uPressure, vT).x;
    float B = texture(uPressure, vB).x;
    vec2 velocity = texture(uVelocity, vUv).xy;
    velocity.xy -= vec2(R - L, T - B);
    fragColor = vec4(velocity, 0.0, 1.0);
}
`;

// Helper Functions
function createProgram(vertexShader, fragmentShader) {
    const program = gl.createProgram();
    const vs = createShader(vertexShader, gl.VERTEX_SHADER);
    const fs = createShader(fragmentShader, gl.FRAGMENT_SHADER);

    if (!vs || !fs) return null;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return null;
    }
    return program;
}

function createShader(source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        return null;
    }
    return shader;
}

function createTexture(width, height) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    return texture;
}

function createDoubleFBO(width, height) {
    let fbo1 = createFBO(width, height);
    let fbo2 = createFBO(width, height);
    return {
        width, height,
        texelSizeX: 1.0 / width,
        texelSizeY: 1.0 / height,
        get read() { return fbo1; },
        get write() { return fbo2; },
        swap() {
            let temp = fbo1;
            fbo1 = fbo2;
            fbo2 = temp;
        }
    };
}

function createFBO(width, height) {
    const texture = createTexture(width, height);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return {
        fbo, texture, width, height,
        attach(id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };
}

// Programs
const programs = {
    clear: createProgram(baseVertexShader, clearShader),
    display: createProgram(baseVertexShader, displayShader),
    splat: createProgram(baseVertexShader, splatShader),
    advection: createProgram(baseVertexShader, advectionShader),
    divergence: createProgram(baseVertexShader, divergenceShader),
    curl: createProgram(baseVertexShader, curlShader),
    vorticity: createProgram(baseVertexShader, vorticityShader),
    pressure: createProgram(baseVertexShader, pressureShader),
    gradientSubtract: createProgram(baseVertexShader, gradientSubtractShader)
};

// Buffers
let simWidth = canvas.width >> config.TEXTURE_DOWNSAMPLE;
let simHeight = canvas.height >> config.TEXTURE_DOWNSAMPLE;

let density = createDoubleFBO(simWidth, simHeight);
let velocity = createDoubleFBO(simWidth, simHeight);
let divergence = createFBO(simWidth, simHeight);
let curl = createFBO(simWidth, simHeight);
let pressure = createDoubleFBO(simWidth, simHeight);

// Blit
const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    return (destination) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, destination ? destination.fbo : null);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };
})();

// Simulation Step
function step(dt) {
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, simWidth, simHeight);

    // Curl
    gl.useProgram(programs.curl);
    gl.uniform2f(gl.getUniformLocation(programs.curl, 'texelSize'), velocity.texelSizeX, velocity.texelSizeY);
    velocity.read.attach(0);
    gl.uniform1i(gl.getUniformLocation(programs.curl, 'uVelocity'), 0);
    blit(curl);

    // Vorticity
    gl.useProgram(programs.vorticity);
    gl.uniform2f(gl.getUniformLocation(programs.vorticity, 'texelSize'), velocity.texelSizeX, velocity.texelSizeY);
    velocity.read.attach(0);
    gl.uniform1i(gl.getUniformLocation(programs.vorticity, 'uVelocity'), 0);
    curl.attach(1);
    gl.uniform1i(gl.getUniformLocation(programs.vorticity, 'uCurl'), 1);
    gl.uniform1f(gl.getUniformLocation(programs.vorticity, 'curl'), config.CURL);
    gl.uniform1f(gl.getUniformLocation(programs.vorticity, 'dt'), dt);
    blit(velocity.write);
    velocity.swap();

    // Divergence
    gl.useProgram(programs.divergence);
    gl.uniform2f(gl.getUniformLocation(programs.divergence, 'texelSize'), velocity.texelSizeX, velocity.texelSizeY);
    velocity.read.attach(0);
    gl.uniform1i(gl.getUniformLocation(programs.divergence, 'uVelocity'), 0);
    blit(divergence);

    // Clear Pressure
    gl.useProgram(programs.clear);
    gl.uniform1f(gl.getUniformLocation(programs.clear, 'value'), config.PRESSURE_DISSIPATION);
    blit(pressure.write);
    pressure.swap();

    // Pressure
    gl.useProgram(programs.pressure);
    gl.uniform2f(gl.getUniformLocation(programs.pressure, 'texelSize'), velocity.texelSizeX, velocity.texelSizeY);
    divergence.attach(0);
    gl.uniform1i(gl.getUniformLocation(programs.pressure, 'uDivergence'), 0);
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        pressure.read.attach(1);
        gl.uniform1i(gl.getUniformLocation(programs.pressure, 'uPressure'), 1);
        blit(pressure.write);
        pressure.swap();
    }

    // Gradient Subtract
    gl.useProgram(programs.gradientSubtract);
    gl.uniform2f(gl.getUniformLocation(programs.gradientSubtract, 'texelSize'), velocity.texelSizeX, velocity.texelSizeY);
    pressure.read.attach(0);
    gl.uniform1i(gl.getUniformLocation(programs.gradientSubtract, 'uPressure'), 0);
    velocity.read.attach(1);
    gl.uniform1i(gl.getUniformLocation(programs.gradientSubtract, 'uVelocity'), 1);
    blit(velocity.write);
    velocity.swap();

    // Advection
    gl.useProgram(programs.advection);
    gl.uniform2f(gl.getUniformLocation(programs.advection, 'texelSize'), velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1f(gl.getUniformLocation(programs.advection, 'dt'), dt);
    gl.uniform1f(gl.getUniformLocation(programs.advection, 'dissipation'), config.VELOCITY_DISSIPATION);
    velocity.read.attach(0);
    gl.uniform1i(gl.getUniformLocation(programs.advection, 'uVelocity'), 0);
    velocity.read.attach(1);
    gl.uniform1i(gl.getUniformLocation(programs.advection, 'uSource'), 1);
    blit(velocity.write);
    velocity.swap();

    gl.uniform1f(gl.getUniformLocation(programs.advection, 'dissipation'), config.DENSITY_DISSIPATION);
    velocity.read.attach(0);
    gl.uniform1i(gl.getUniformLocation(programs.advection, 'uVelocity'), 0);
    density.read.attach(1);
    gl.uniform1i(gl.getUniformLocation(programs.advection, 'uSource'), 1);
    blit(density.write);
    density.swap();
}

function render() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(programs.display);
    density.read.attach(0);
    gl.uniform1i(gl.getUniformLocation(programs.display, 'uTexture'), 0);
    blit(null);
}

function splat(x, y, dx, dy, color) {
    gl.viewport(0, 0, simWidth, simHeight);
    gl.useProgram(programs.splat);
    gl.uniform1f(gl.getUniformLocation(programs.splat, 'aspectRatio'), canvas.width / canvas.height);
    gl.uniform2f(gl.getUniformLocation(programs.splat, 'point'), x / canvas.width, 1.0 - y / canvas.height);
    gl.uniform3f(gl.getUniformLocation(programs.splat, 'color'), dx, dy, 0.0);
    gl.uniform1f(gl.getUniformLocation(programs.splat, 'radius'), config.SPLAT_RADIUS);
    velocity.read.attach(0);
    gl.uniform1i(gl.getUniformLocation(programs.splat, 'uTarget'), 0);
    blit(velocity.write);
    velocity.swap();

    gl.uniform3f(gl.getUniformLocation(programs.splat, 'color'), color.r, color.g, color.b);
    density.read.attach(0);
    gl.uniform1i(gl.getUniformLocation(programs.splat, 'uTarget'), 0);
    blit(density.write);
    density.swap();
}

// Interaction
function updatePointers() {
    pointers.forEach(p => {
        if (p.moved) {
            splat(p.x, p.y, p.dx * config.SPLAT_FORCE, p.dy * config.SPLAT_FORCE, p.color);
            p.moved = false;
        }
    });
}

// Loop
let lastTime = Date.now();
function frame() {
    const now = Date.now();
    const dt = Math.min((now - lastTime) / 1000, 0.016);
    lastTime = now;

    updatePointers();
    step(dt);
    render();
    requestAnimationFrame(frame);
}

// Input Handling
function generateColor() {
    let c = HSVtoRGB(Math.random(), 1.0, 1.0);
    c.r *= 0.15; c.g *= 0.15; c.b *= 0.15;
    return c;
}

function HSVtoRGB(h, s, v) {
    let r, g, b, i, f, p, q, t;
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return { r, g, b };
}

canvas.addEventListener('mousemove', e => {
    pointers[0] = {
        x: e.offsetX,
        y: e.offsetY,
        dx: (e.movementX || 0) * 5,
        dy: -(e.movementY || 0) * 5,
        moved: Math.abs(e.movementX) > 0 || Math.abs(e.movementY) > 0,
        color: generateColor()
    };
});

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
        let pointer = pointers[i] || {};
        pointer.moved = pointer.down;
        pointer.dx = (touches[i].pageX - pointer.x) * 8 || 0;
        pointer.dy = -(touches[i].pageY - pointer.y) * 8 || 0;
        pointer.x = touches[i].pageX;
        pointer.y = touches[i].pageY;
        pointer.down = true;
        pointer.color = generateColor();
        pointers[i] = pointer;
    }
}, false);

// Init
setActiveNav('aether');
frame();

// Initial Splat
splat(canvas.width / 2, canvas.height / 2, 0, 0, { r: 0.2, g: 0.4, b: 0.8 });
