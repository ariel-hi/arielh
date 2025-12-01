/*
 * Horizon - WebGL Black Hole Simulation
 * Based on raymarching and gravitational lensing principles.
 */

const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });

if (!gl) {
    console.error('WebGL 2 not supported');
}

function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

// --- Shaders ---

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

// Constants
#define MAX_STEPS 100
#define MAX_DIST 50.0
#define SURF_DIST 0.01
#define PI 3.14159265

// Black Hole Parameters
const float bhMass = 0.5;
const float bhRadius = 2.0 * bhMass; // Event Horizon
const float accretionInner = 3.0 * bhMass;
const float accretionOuter = 8.0 * bhMass;

// Rotation matrix
mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

// Noise function for accretion disk
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
    }
    return v;
}

// Accretion Disk Color
vec3 getDiskColor(vec3 p) {
    float dist = length(p);
    if (dist < accretionInner || dist > accretionOuter) return vec3(0.0);
    
    // Thin disk
    if (abs(p.y) > 0.1 * (1.0 + dist*0.1)) return vec3(0.0);
    
    // Rotate texture with time
    float angle = atan(p.z, p.x);
    float speed = 2.0 / sqrt(dist); // Keplerian-ish
    float val = fbm(vec2(dist * 2.0, angle * 3.0 + u_time * speed));
    
    // Heat gradient
    vec3 col = mix(vec3(1.0, 0.3, 0.1), vec3(0.1, 0.4, 1.0), smoothstep(accretionInner, accretionOuter, dist));
    
    // Intensity falloff
    float intensity = smoothstep(accretionOuter, accretionInner, dist);
    intensity *= smoothstep(0.1, 0.0, abs(p.y)); // Vertical fade
    
    return col * val * intensity * 5.0;
}

// Starfield background
vec3 getStars(vec3 dir) {
    vec2 uv = dir.xy / dir.z; // Simple projection
    float n = hash(uv * 100.0);
    float stars = pow(n, 20.0);
    return vec3(stars);
}

void main() {
    vec2 uv = (v_uv - 0.5) * u_resolution / u_resolution.y;
    vec2 mouse = u_mouse * 2.0 - 1.0;
    
    // Camera setup
    float camDist = 12.0;
    float camY = mouse.y * 5.0;
    float camX = mouse.x * 5.0;
    
    vec3 ro = vec3(sin(u_time * 0.1 + camX) * camDist, camY, cos(u_time * 0.1 + camX) * camDist);
    vec3 ta = vec3(0.0, 0.0, 0.0);
    
    vec3 fwd = normalize(ta - ro);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
    vec3 up = cross(fwd, right);
    
    vec3 rd = normalize(fwd + right * uv.x + up * uv.y);
    
    vec3 col = vec3(0.0);
    vec3 p = ro;
    
    // Raymarching with gravity
    float dt = 0.1;
    vec3 velocity = rd;
    
    for(int i = 0; i < 150; i++) {
        float r = length(p);
        
        // Event Horizon
        if (r < bhRadius) {
            col = vec3(0.0); // Black hole
            break;
        }
        
        // Gravity (Bending light)
        // F = G * M / r^2
        // Acceleration vector points to center
        vec3 accel = -normalize(p) * (bhMass / (r * r));
        velocity += accel * dt;
        p += velocity * dt;
        
        // Accumulate Accretion Disk Light (Volumetric-ish)
        vec3 disk = getDiskColor(p);
        col += disk * dt * 0.5;
        
        if (r > MAX_DIST) {
            // Hit background stars (warped)
            col += getStars(velocity) * 0.5;
            break;
        }
    }
    
    // Tone mapping
    col = col / (col + 1.0);
    col = pow(col, vec3(0.4545)); // Gamma correction
    
    outColor = vec4(col, 1.0);
}
`;

// --- WebGL Setup ---

function createProgram(fsSource) {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);

    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(fs));
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    return prog;
}

const program = createProgram(fsSource);

// Quad
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
]), gl.STATIC_DRAW);

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

// --- Logic ---

let startTime = Date.now();
let mouseX = 0.5;
let mouseY = 0.5;
let targetMouseX = 0.5;
let targetMouseY = 0.5;

// Mouse Tracking
window.addEventListener('mousemove', (e) => {
    targetMouseX = e.clientX / window.innerWidth;
    targetMouseY = 1.0 - e.clientY / window.innerHeight;
});

window.addEventListener('touchmove', (e) => {
    e.preventDefault();
    targetMouseX = e.touches[0].clientX / window.innerWidth;
    targetMouseY = 1.0 - e.touches[0].clientY / window.innerHeight;
}, { passive: false });

function render() {
    const time = (Date.now() - startTime) * 0.001;

    // Smooth mouse
    mouseX += (targetMouseX - mouseX) * 0.05;
    mouseY += (targetMouseY - mouseY) * 0.05;

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(program);
    gl.bindVertexArray(vao);

    const uTime = gl.getUniformLocation(program, 'u_time');
    const uRes = gl.getUniformLocation(program, 'u_resolution');
    const uMouse = gl.getUniformLocation(program, 'u_mouse');

    gl.uniform1f(uTime, time);
    gl.uniform2f(uRes, gl.canvas.width, gl.canvas.height);
    gl.uniform2f(uMouse, mouseX, mouseY);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(render);
}

// Init
setActiveNav('horizon');
requestAnimationFrame(render);
