/*
 * Rufus Multiverse - WebGL Shader Manager
 * "Immaculate" Space Edition - Interactive
 */

const canvas = document.getElementById('bgCanvas');
const gl = canvas.getContext('webgl2');

if (!gl) {
    console.error('WebGL 2 not supported');
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

// --- Data ---

const images = [
    'images/rufus-01.jpg', 'images/rufus-02.jpg', 'images/rufus-03.jpg',
    'images/rufus-04.jpg', 'images/rufus-05.jpg', 'images/rufus-06.jpg',
    'images/rufus-07.jpg', 'images/rufus-08.jpg', 'images/rufus-09.jpg'
];

// User-provided Names
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

// --- Shaders ---

const vsSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Space: "Deep Cosmos" with Parallax & Distortion
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
#define brightness 0.0015
#define darkmatter 0.300
#define distfading 0.730
#define saturation 0.850

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

const spaceProgram = createProgram(fsSpace);

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

let currentColor = [0.5, 0.5, 0.5];
let startTime = Date.now();
let mouseX = 0.5;
let mouseY = 0.5;
let targetMouseX = 0.5;
let targetMouseY = 0.5;

// Mouse Tracking
window.addEventListener('mousemove', (e) => {
    targetMouseX = e.clientX / window.innerWidth;
    targetMouseY = 1.0 - e.clientY / window.innerHeight; // Flip Y
});

window.addEventListener('touchmove', (e) => {
    e.preventDefault();
    targetMouseX = e.touches[0].clientX / window.innerWidth;
    targetMouseY = 1.0 - e.touches[0].clientY / window.innerHeight;
}, { passive: false });

function render() {
    const time = (Date.now() - startTime) * 0.001;

    // Smooth mouse
    mouseX += (targetMouseX - mouseX) * 0.1;
    mouseY += (targetMouseY - mouseY) * 0.1;

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(spaceProgram);
    gl.bindVertexArray(vao);

    const uTime = gl.getUniformLocation(spaceProgram, 'u_time');
    const uRes = gl.getUniformLocation(spaceProgram, 'u_resolution');
    const uColor = gl.getUniformLocation(spaceProgram, 'u_color');
    const uMouse = gl.getUniformLocation(spaceProgram, 'u_mouse');

    gl.uniform1f(uTime, time);
    gl.uniform2f(uRes, gl.canvas.width, gl.canvas.height);
    gl.uniform3fv(uColor, currentColor);
    gl.uniform2f(uMouse, mouseX, mouseY);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(render);
}

// --- App Logic ---

const imgElement = document.getElementById('rufusImage');
const nameElement = document.getElementById('randomName');

function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

let lastImageIndex = -1;

function getUniqueRandomImage() {
    let newIndex;
    do {
        newIndex = Math.floor(Math.random() * images.length);
    } while (newIndex === lastImageIndex && images.length > 1);

    lastImageIndex = newIndex;
    return images[newIndex];
}

// Space-Safe Color Palette
const spaceColors = [
    [0.1, 0.4, 0.8], // Deep Blue
    [0.5, 0.0, 0.8], // Nebula Purple
    [0.0, 0.8, 0.8], // Cyan/Teal
    [0.8, 0.2, 0.5], // Magenta
    [0.2, 0.1, 0.4], // Dark Indigo
    [0.0, 0.5, 0.5], // Deep Teal
    [0.6, 0.1, 0.1], // Red Dwarf
    [0.1, 0.6, 0.3]  // Emerald Nebula
];

function generateSpaceColor() {
    // Pick a base color
    const base = spaceColors[Math.floor(Math.random() * spaceColors.length)];

    // Add slight variance
    return [
        Math.max(0, Math.min(1, base[0] + (Math.random() - 0.5) * 0.2)),
        Math.max(0, Math.min(1, base[1] + (Math.random() - 0.5) * 0.2)),
        Math.max(0, Math.min(1, base[2] + (Math.random() - 0.5) * 0.2))
    ];
}

function updateContent() {
    // Fade out
    nameElement.classList.remove('show');

    setTimeout(() => {
        // Update data
        const newName = getRandomElement(names);
        const newImage = getUniqueRandomImage();

        nameElement.textContent = newName;
        imgElement.src = newImage;

        // Update Color
        currentColor = generateSpaceColor();

        // Fade in
        nameElement.classList.add('show');
    }, 500);
}

// Init
setActiveNav('rufus');
updateContent();
setInterval(updateContent, 5000);
requestAnimationFrame(render);
