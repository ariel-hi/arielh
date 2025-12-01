/*
 * Kinetic Void - WebGL Text Renderer
 */

const canvas = document.getElementById('kineticCanvas');
const gl = canvas.getContext('webgl2');

if (!gl) {
    console.error('WebGL 2 not supported');
}

// Resize handling
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

// --- Texture Generation ---
// Create a texture containing the text "REL"
const textCanvas = document.createElement('canvas');
const textCtx = textCanvas.getContext('2d');
const texSize = 1024;
textCanvas.width = texSize;
textCanvas.height = texSize;

function createTextTexture() {
    textCtx.fillStyle = '#000000'; // Background
    textCtx.fillRect(0, 0, texSize, texSize);

    textCtx.fillStyle = '#FFFFFF';
    textCtx.font = 'bold 800px "Space Mono", monospace';
    textCtx.textAlign = 'center';
    textCtx.textBaseline = 'middle';
    textCtx.fillText('REL', texSize / 2, texSize / 2);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    return texture;
}

const textTexture = createTextTexture();

// --- Shaders ---

const vertexShaderSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    // Flip Y because WebGL texture coordinates are bottom-left
    v_uv.y = 1.0 - v_uv.y;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_texture;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_scroll;

#define PI 3.14159265359

void main() {
    vec2 uv = v_uv;
    
    // Aspect ratio correction
    float aspect = u_resolution.x / u_resolution.y;
    
    // Center UVs
    vec2 p = uv - 0.5;
    p.x *= aspect;
    
    // --- Distortion Effects ---
    
    // 1. Mouse interaction (repel/warp)
    vec2 mouseP = u_mouse - 0.5;
    mouseP.x *= aspect;
    mouseP.y *= -1.0; // Flip mouse Y to match screen coords
    
    float dist = length(p - mouseP);
    float influence = smoothstep(0.5, 0.0, dist);
    p += (p - mouseP) * influence * 0.2;
    
    // 2. Tunnel / Perspective warping
    // Convert to polar coordinates for tunnel effect? 
    // Let's do a planar grid that bends.
    
    // Z-depth simulation
    float z = 1.0; // + influence * 0.5;
    
    // 3. Kinetic Scrolling
    // We want the text to flow infinitely.
    // Map p back to texture coordinates with repetition.
    
    vec2 texUV = p * vec2(2.0, 2.0); // Scale grid
    
    // Add scroll movement
    texUV.y += u_scroll * 0.5 + u_time * 0.1;
    texUV.x += sin(uv.y * 10.0 + u_time) * 0.05; // Wavy x
    
    // Rotate slightly based on mouse x
    float angle = (u_mouse.x - 0.5) * 0.5;
    float s = sin(angle);
    float c = cos(angle);
    mat2 rot = mat2(c, -s, s, c);
    texUV = rot * texUV;

    // Sample texture
    vec4 color = texture(u_texture, texUV);
    
    // Colorize
    // Create a gradient based on position and time
    vec3 col1 = vec3(0.4, 0.5, 0.9); // Blueish
    vec3 col2 = vec3(0.9, 0.4, 0.8); // Pinkish
    
    vec3 finalColor = mix(col1, col2, sin(texUV.y * 2.0 + u_time) * 0.5 + 0.5);
    
    // Apply texture mask
    // The texture is white text on black. Use red channel as alpha/intensity.
    float textMask = color.r;
    
    // Add glow
    // Simple bloom-like effect by boosting intensity
    vec3 glow = finalColor * textMask * 2.0;
    
    // Vignette
    float vignette = 1.0 - length(uv - 0.5) * 0.8;
    
    outColor = vec4(glow * vignette, 1.0);
}
`;

// --- Setup ---

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

const vs = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
const program = createProgram(gl, vs, fs);

// Attributes & Uniforms
const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
const resolutionUniformLocation = gl.getUniformLocation(program, "u_resolution");
const timeUniformLocation = gl.getUniformLocation(program, "u_time");
const mouseUniformLocation = gl.getUniformLocation(program, "u_mouse");
const scrollUniformLocation = gl.getUniformLocation(program, "u_scroll");
const textureUniformLocation = gl.getUniformLocation(program, "u_texture");

// Buffers
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
// Full screen quad
const positions = [
    -1, -1,
    1, -1,
    -1, 1,
    -1, 1,
    1, -1,
    1, 1,
];
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
gl.enableVertexAttribArray(positionAttributeLocation);
gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

// --- Loop ---

let mouseX = 0.5;
let mouseY = 0.5;
let targetMouseX = 0.5;
let targetMouseY = 0.5;
let scrollY = 0;

window.addEventListener('mousemove', (e) => {
    targetMouseX = e.clientX / window.innerWidth;
    targetMouseY = e.clientY / window.innerHeight;
});

window.addEventListener('wheel', (e) => {
    scrollY += e.deltaY * 0.001;
});

// Touch support
window.addEventListener('touchmove', (e) => {
    e.preventDefault();
    targetMouseX = e.touches[0].clientX / window.innerWidth;
    targetMouseY = e.touches[0].clientY / window.innerHeight;
}, { passive: false });


function render(time) {
    time *= 0.001; // Convert to seconds

    // Smooth mouse
    mouseX += (targetMouseX - mouseX) * 0.1;
    mouseY += (targetMouseY - mouseY) * 0.1;

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);
    gl.bindVertexArray(vao);

    gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(timeUniformLocation, time);
    gl.uniform2f(mouseUniformLocation, mouseX, mouseY);
    gl.uniform1f(scrollUniformLocation, scrollY);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textTexture);
    gl.uniform1i(textureUniformLocation, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(render);
}

setActiveNav('index');
requestAnimationFrame(render);
