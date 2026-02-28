/*
 * Nebula - Cosmic Nebula
 * Procedural Domain Warped Noise
 */

const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });

if (!gl) {
    console.error('WebGL 2 not supported');
    document.body.innerHTML = 'WebGL 2 is required for this experience.';
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

void main() {
    vec2 st = gl_FragCoord.xy / u_resolution.xy;
    st.x *= u_resolution.x / u_resolution.y;
    
    vec2 mouse = u_mouse * 0.5;
    
    // Domain Warping
    // f(p) = fbm( p + fbm( p + fbm( p ) ) )
    
    vec2 q = vec2(0.);
    q.x = fbm( st + 0.00 * u_time);
    q.y = fbm( st + vec2(1.0));

    vec2 r = vec2(0.);
    r.x = fbm( st + 1.0 * q + vec2(1.7, 9.2) + 0.15 * u_time + mouse.x);
    r.y = fbm( st + 1.0 * q + vec2(8.3, 2.8) + 0.126 * u_time + mouse.y);

    float f = fbm(st + r);

    // Color Palette
    // Dark, moody, ethereal
    vec3 color = mix(vec3(0.101961,0.619608,0.666667),
                vec3(0.666667,0.666667,0.498039),
                clamp((f*f)*4.0,0.0,1.0));

    color = mix(color,
                vec3(0,0,0.164706),
                clamp(length(q),0.0,1.0));

    color = mix(color,
                vec3(0.666667,1,1),
                clamp(length(r.x),0.0,1.0));
                
    // Deep Void tint
    vec3 voidColor = vec3(0.05, 0.05, 0.1);
    color = mix(voidColor, color, f * 1.5);
    
    // Vignette
    vec2 uv = v_uv - 0.5;
    float len = length(uv);
    color *= smoothstep(0.8, 0.2, len);

    outColor = vec4((f*f*f+.6*f*f+.5*f)*color, 1.);
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
setActiveNav('nebula');
requestAnimationFrame(render);
