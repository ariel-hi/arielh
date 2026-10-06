/* Kinetic — original text shader, with accessible motion controls. */
(() => {
    'use strict';
    const canvas = document.getElementById('kineticCanvas');
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
    
    float dist = length(p - mouseP);
    float influence = (1.0 - smoothstep(0.0, 0.5, dist));
    p += (p - mouseP) * influence * 0.1;
    
    // 2. Tunnel / Perspective warping
    // Convert to polar coordinates for tunnel effect? 
    // Let's do a planar grid that bends.
    
    // Z-depth simulation
    float z = 1.0; // + influence * 0.5;
    
    // 3. Kinetic Scrolling
    // We want the text to flow infinitely.
    // Map p back to texture coordinates with repetition.
    
    float density = max(1.0, 1.25 / aspect);
    vec2 texUV = p * vec2(1.1, 2.2) * density;
    
    // Add scroll movement
    texUV.y += u_scroll * 0.5 + u_time * 0.065;
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
    vec3 glow = finalColor * textMask * 1.5;
    
    // Vignette
    float vignette = 1.0 - length(uv - 0.5) * 0.8;
    
    // Depth behind the type: a larger, slower echo of the same lettering,
    // and a soft light in the gradient colours that follows the pointer.
    vec2 echoUV = (uv - 0.5) * vec2(aspect, 1.0) * vec2(0.42, 0.84) * density;
    echoUV.y += u_scroll * 0.18 + u_time * 0.022;
    echoUV.x -= sin(uv.y * 4.0 + u_time * 0.4) * 0.03;
    echoUV = mat2(cos(-angle * 0.6), -sin(-angle * 0.6), sin(-angle * 0.6), cos(-angle * 0.6)) * echoUV + vec2(0.37, 0.21);
    float echo = texture(u_texture, echoUV).r;
    vec3 echoColor = mix(col2, col1, sin(echoUV.y * 2.0 - u_time * 0.7) * 0.5 + 0.5);
    float light = exp(-dist * 2.4);
    vec3 back = echoColor * echo * (0.07 + 0.16 * light) + finalColor * light * 0.07;
    back += vec3(0.05, 0.04, 0.10) * (1.0 - length(uv - 0.5));

    outColor = vec4(glow * vignette + back * (1.0 - textMask) * vignette, 1.0);
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
    let scrollOffset = 0;
    let targetScrollOffset = 0;
    let visualInView = true;

    function render(timestamp) {
        frameId = 0;
        if (!renderer || paused || document.hidden || !visualInView) return;
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
        const motionLabel = paused ? 'Play animation' : 'Pause animation';
        if (motionButton) motionButton.textContent = motionButton.dataset.compactLabel === 'true' ? (paused ? 'Play' : 'Pause') : motionLabel;
        if (motionButton) motionButton.setAttribute('aria-label', motionLabel);
        if (renderer && !document.hidden && visualInView) {
            renderer.draw(time);
            if (!paused) frameId = requestAnimationFrame(render);
        }

    }
    function showFallback(message) {
        canvas.closest('.home-visual')?.classList.remove('visual-ready');
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
            canvas.closest('.home-visual')?.classList.add('visual-ready');
        } catch (error) {
            renderer = null;
            canvas.closest('.home-visual')?.classList.remove('visual-ready');
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
        if (!document.hidden && visualInView) renderer.draw(time);
    });
    function trackPointer(event) {
        if (paused || document.hidden || !visualInView) return;
        const bounds = canvas.getBoundingClientRect?.() || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        targetMouseX = Math.min(1, Math.max(0, (event.clientX - bounds.left) / Math.max(1, bounds.width)));
        targetMouseY = Math.min(1, Math.max(0, (event.clientY - bounds.top) / Math.max(1, bounds.height)));
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


    canvas.addEventListener('wheel', (event) => {
        if (paused || document.hidden || !visualInView || event.ctrlKey || event.metaKey) return;
        // Wheel deltas may be pixels, lines, or pages. Normalize before capping a gesture.
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? (canvas.clientHeight || window.innerHeight) : 1;
        const delta = Number.isFinite(event.deltaY) ? event.deltaY * unit : 0;
        targetScrollOffset += Math.max(-120, Math.min(120, delta)) * 0.0004;
    }, { passive: true });

    function createRenderer() {
        const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
        if (!gl) throw new Error('WebGL 2 is unavailable.');
        const textCanvas = document.createElement('canvas');
        textCanvas.width = 2048;
        textCanvas.height = 1024;
        const textContext = textCanvas.getContext('2d');
        if (!textContext) throw new Error('The text texture is unavailable.');
        const texture = gl.createTexture();
        function updateTextTexture() {
            textContext.fillStyle = '#000000';
            textContext.fillRect(0, 0, 2048, 1024);
            textContext.fillStyle = '#FFFFFF';
            textContext.font = 'bold 1000px "Space Mono", monospace';
            textContext.textAlign = 'center';
            textContext.textBaseline = 'middle';
            textContext.fillText('REL', 1024, 512, 1800);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        }
        updateTextTexture();
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
        const vertex = compile(gl.VERTEX_SHADER, vertexShaderSource);
        const fragment = compile(gl.FRAGMENT_SHADER, fragmentShaderSource);
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
            scroll: gl.getUniformLocation(program, 'u_scroll'),
            texture: gl.getUniformLocation(program, 'u_texture')
        };
        return {
            updateTextTexture,
            resize() {
                const width = Math.max(1, canvas.clientWidth || window.innerWidth);
                const height = Math.max(1, canvas.clientHeight || window.innerHeight);
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
                    // Ease wheel impulses at the same speed on every display refresh rate.
                    scrollOffset += (targetScrollOffset - scrollOffset) * (1 - Math.pow(0.82, delta * 60));
                }
                gl.useProgram(program);
                gl.bindVertexArray(vao);
                gl.uniform1f(uniforms.time, time);
                gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
                gl.uniform2f(uniforms.mouse, mouseX, mouseY);
                gl.uniform1f(uniforms.scroll, scrollOffset);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.uniform1i(uniforms.texture, 0);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }
        };
    }
    if (typeof IntersectionObserver !== 'undefined') {
        const observer = new IntersectionObserver(entries => {
            visualInView = entries[0].isIntersecting;
            syncMotion();
        });
        observer.observe(canvas);
    }
    initializeVisual();
    // Refresh the texture when the original typeface is ready.
    // The monospace fallback still works if the font service is unreachable.
    if (document.fonts) {
        document.fonts.load('bold 1000px "Space Mono"').then(() => {
            if (!renderer) return;
            renderer.updateTextTexture();
            if (!document.hidden && visualInView) renderer.draw(time);
        }).catch(() => {});
    }

})();
