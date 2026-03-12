import { InputManager } from './input.js';
import { AudioEngine } from './audio.js';
import { createAllGames, GAME_SIZE } from './microgames.js';
import { submitScore, fetchLeaderboard } from './leaderboard.js';

const GS = GAME_SIZE, GRID = GS * 4;
const BASE_SWITCH = 5.0, SPEED_INC = 0.03, FAIL_DUR = 0.35;
const SW_TOTAL = 1.2, SW_P1 = 0.3, SW_P2 = 0.85;
const ST = { TITLE: 0, ACTIVE: 1, SWITCHING: 2, FAILING: 3, OVER: 4 };
const lp = (a, b, t) => a + (b - a) * t;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;
function resize() {
    const d = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    canvas.width = W * d; canvas.height = H * d;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(d, 0, 0, d, 0, 0);
}
addEventListener('resize', resize); resize();

const input = new InputManager();
const audio = new AudioEngine();
const mob = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Grid layout — always fixed position
function getGrid() {
    const navH = 72;
    const availH = H - navH;
    const size = Math.min(W * 0.94, availH * (mob() ? 0.50 : 0.86));
    const gs = size / 4;
    return { gs, x: (W - size) / 2, y: navH + (availH - size) / 2 };
}

// Expanded game layout
function getExpand() {
    const navH = 72;
    const availH = H - navH;
    const size = Math.min(W * 0.94, availH * (mob() ? 0.50 : 0.86));
    return { x: (W - size) / 2, y: navH + (availH - size) / 2, size };
}

let state = ST.TITLE, games = [], elim = [], activeIdx = 0, nextIdx = -1;
let clockSpd = 1, maxSpd = 1, score = 0, switchT = 0, transT = 0;
let shake = 0, flash = 0, scanY = 0, gamesLostCount = 0;
let expandT = 0, expandIdx = 0;

function start() {
    games = createAllGames(16); elim = new Array(16).fill(false);
    clockSpd = 1; maxSpd = 1; score = 0; switchT = BASE_SWITCH;
    shake = 0; flash = 0; gamesLostCount = 0; expandT = 0;
    activeIdx = (Math.random() * 16) | 0; expandIdx = activeIdx;
    state = ST.ACTIVE; audio.init(); audio.resume();
    document.getElementById('lb-results').classList.add('hidden');
    document.getElementById('name-entry').style.display = 'flex';
}

function remain() { return elim.filter(e => !e).length; }
function pickNext() {
    const pool = []; for (let i = 0; i < 16; i++) if (!elim[i] && i !== activeIdx) pool.push(i);
    return pool.length ? pool[(Math.random() * pool.length) | 0] : -1;
}

async function gameOver() {
    state = ST.OVER; audio.playGameOver();
    document.getElementById('final-stats').innerHTML = `
        <div class="stat-item"><span class="stat-value">${score.toFixed(1)}s</span><span class="stat-label">Survived</span></div>
        <div class="stat-item"><span class="stat-value">${maxSpd.toFixed(2)}×</span><span class="stat-label">Max Speed</span></div>`;
    document.getElementById('gameover-screen').classList.remove('hidden');
    document.getElementById('player-name').focus();
}

function renderBoard(rows, c) {
    if (!rows.length) { c.innerHTML = '<div class="lb-empty">No scores yet — be first!</div>'; return; }
    c.innerHTML = rows.slice(0, 10).map((r, i) => `<div class="lb-row"><span class="lb-rank">${i + 1}</span><span class="lb-name">${(r.name || 'ANON').slice(0, 12)}</span><span class="lb-score">${Number(r.score).toFixed(1)}s</span></div>`).join('');
}

document.getElementById('start-btn').onclick = () => { document.getElementById('title-screen').classList.add('hidden'); start(); };
document.getElementById('restart-btn').onclick = () => { document.getElementById('gameover-screen').classList.add('hidden'); start(); };
document.getElementById('submit-btn').onclick = async () => {
    const name = (document.getElementById('player-name').value || 'ANON').trim().toUpperCase();
    document.getElementById('name-entry').style.display = 'none';
    await submitScore({ name, score, maxSpeed: maxSpd, gamesLost: gamesLostCount });
    const rows = await fetchLeaderboard(10); const lb = document.getElementById('lb-results');
    renderBoard(rows, lb); lb.classList.remove('hidden');
};
document.getElementById('board-btn').onclick = async () => {
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('board-screen').classList.remove('hidden');
    renderBoard(await fetchLeaderboard(10), document.getElementById('board-list'));
};
document.getElementById('board-close').onclick = () => {
    document.getElementById('board-screen').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
};
canvas.onclick = () => { if (state === ST.TITLE) { document.getElementById('title-screen').classList.add('hidden'); start(); } };

let lastT = 0;
function loop(ts) { requestAnimationFrame(loop); const dt = Math.min((ts - lastT) / 1000, 0.05); lastT = ts; update(dt); render(dt); }

function update(dt) {
    if (state === ST.TITLE || state === ST.OVER) return;
    shake *= .88; flash *= .9;
    audio.setBPM(clockSpd); audio.tick(dt); score += dt;

    // Expansion animation
    const ES = 7;
    if (state === ST.ACTIVE || state === ST.FAILING) {
        expandT = Math.min(1, expandT + ES * dt); expandIdx = activeIdx;
    }
    if (state === ST.SWITCHING) {
        if (transT < SW_P2) { expandT = Math.max(0, expandT - ES * dt); expandIdx = activeIdx; }
        else { expandT = Math.min(1, expandT + ES * dt); expandIdx = nextIdx; }
    }

    if (state === ST.ACTIVE) {
        if (!elim[activeIdx]) games[activeIdx].update(dt, input.keys, clockSpd, true);
        if (games[activeIdx].failed) {
            elim[activeIdx] = true; gamesLostCount++; shake = 10; flash = .7; audio.playFail();
            if (remain() <= 0) { gameOver(); return; }
            nextIdx = pickNext(); if (nextIdx === -1) { gameOver(); return; }
            transT = 0; state = ST.FAILING; return;
        }
        switchT -= dt;
        if (switchT <= 0) {
            nextIdx = pickNext();
            if (nextIdx === -1) { clockSpd += SPEED_INC; maxSpd = Math.max(maxSpd, clockSpd); switchT = BASE_SWITCH / clockSpd; return; }
            transT = 0; state = ST.SWITCHING; audio.playSwitch();
        }
    }
    if (state === ST.FAILING) { transT += dt; if (transT >= FAIL_DUR) { transT = 0; state = ST.SWITCHING; } }
    if (state === ST.SWITCHING) {
        transT += dt;
        if (transT >= SW_TOTAL) { activeIdx = nextIdx; switchT = BASE_SWITCH / clockSpd; clockSpd += SPEED_INC; maxSpd = Math.max(maxSpd, clockSpd); state = ST.ACTIVE; }
    }
}

// Draw one game cell at screen rect (sx,sy,sw,sh)
function drawCell(i, sx, sy, sw, sh) {
    ctx.save();
    ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.clip();
    ctx.fillStyle = '#0c0c18'; ctx.fillRect(sx, sy, sw, sh);
    ctx.save(); ctx.translate(sx, sy); ctx.scale(sw / GS, sh / GS); games[i].render(ctx); ctx.restore();
    if (elim[i]) {
        // Slick eliminated: solid dark overlay to completely hide the mini-game
        ctx.fillStyle = '#050508'; ctx.fillRect(sx, sy, sw, sh); // Solid, not transparent
        ctx.save();
        ctx.strokeStyle = games[i].color + '40'; ctx.lineWidth = sw * 0.014; // Slightly more visible lines
        // Draw an X instead of diagonal wash to make it clear it's dead
        ctx.beginPath();
        ctx.moveTo(sx + sw * 0.1, sy + sh * 0.1);
        ctx.lineTo(sx + sw * 0.9, sy + sh * 0.9);
        ctx.moveTo(sx + sw * 0.9, sy + sh * 0.1);
        ctx.lineTo(sx + sw * 0.1, sy + sh * 0.9);
        ctx.stroke();
        ctx.restore();
    }
    ctx.restore();
}

function render(dt) {
    ctx.fillStyle = '#08080e'; ctx.fillRect(0, 0, W, H);
    if (state === ST.TITLE) { renderTitle(); return; }

    ctx.save();
    if (shake > 0.1) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

    const { gs, x: gx, y: gy } = getGrid();
    const exp = getExpand();

    // 1. Always draw full 4×4 grid
    for (let i = 0; i < 16; i++) {
        const col = i % 4, row = (i / 4) | 0;
        const cx = gx + col * gs, cy = gy + row * gs;
        drawCell(i, cx, cy, gs, gs);

        // Cell border
        let bCol = '#ffffff07', bW = 0.5;
        const isNext = i === nextIdx && state === ST.SWITCHING && transT >= SW_P1 && transT < SW_P2;
        const isFailing = i === activeIdx && state === ST.FAILING;
        if (isNext && !elim[i]) { bCol = Math.sin(transT * 18) > 0 ? games[i].color + 'cc' : '#ffffff07'; bW = 2; }
        else if (isFailing) { bCol = '#ff335570'; bW = 2; }
        const hs = bW / 2;
        ctx.strokeStyle = bCol; ctx.lineWidth = bW; ctx.strokeRect(cx + hs, cy + hs, gs - bW, gs - bW);
    }

    // 2. Dark backdrop behind expanded game
    if (expandT > 0 && !elim[expandIdx]) {
        ctx.fillStyle = `rgba(6,4,14,${expandT * 0.88})`; ctx.fillRect(0, 0, W, H);
    }

    // 3. Expanded active/next game
    if (expandT > 0 && expandIdx >= 0 && !elim[expandIdx]) {
        const col = expandIdx % 4, row = (expandIdx / 4) | 0;
        const gcx = gx + col * gs, gcy = gy + row * gs;
        const ex = lp(gcx, exp.x, expandT), ey = lp(gcy, exp.y, expandT);
        const ew = lp(gs, exp.size, expandT), eh = lp(gs, exp.size, expandT);

        drawCell(expandIdx, ex, ey, ew, eh);

        // Glowing border
        const gc = games[expandIdx].color;
        ctx.shadowColor = gc; ctx.shadowBlur = 12;
        ctx.strokeStyle = gc; ctx.lineWidth = 2;
        ctx.strokeRect(ex + 1, ey + 1, ew - 2, eh - 2);
        ctx.shadowBlur = 0;

        // Timer bar — game color only, no red
        if (state === ST.ACTIVE && expandT > 0.5) {
            const pct = Math.max(0, switchT / (BASE_SWITCH / clockSpd));
            const a = Math.min(1, (expandT - 0.5) * 2);
            ctx.globalAlpha = a;
            ctx.fillStyle = gc + '28'; ctx.fillRect(ex, ey + eh - 5, ew, 5);         // track
            ctx.fillStyle = gc + 'b5'; ctx.fillRect(ex, ey + eh - 5, ew * pct, 5);   // fill
            ctx.globalAlpha = 1;
        }

        // Game name top-left of expanded
        if (expandT > 0.55) {
            ctx.globalAlpha = Math.min(1, (expandT - 0.55) * 2.2);
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.font = "bold 12px 'Orbitron',sans-serif";
            ctx.fillStyle = gc + 'aa'; ctx.fillText(games[expandIdx].name, ex + 9, ey + 9);
            ctx.globalAlpha = 1;
        }
    }

    // NEXT label during grid overview phase
    if (state === ST.SWITCHING && transT >= SW_P1 && transT < SW_P2 && games[nextIdx]) {
        const ny = mob() ? H * 0.86 : H * 0.93;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = "9px 'Share Tech Mono',monospace"; ctx.fillStyle = '#ffffff44';
        ctx.fillText('NEXT', W / 2, ny);
        ctx.font = "bold 20px 'Orbitron',sans-serif"; ctx.fillStyle = games[nextIdx].color;
        ctx.fillText(games[nextIdx].name, W / 2, ny + 18);
    }

    ctx.restore(); // end shake

    // Flash overlay
    if (flash > 0.01) { ctx.fillStyle = `rgba(255,30,60,${flash * 0.55})`; ctx.fillRect(0, 0, W, H); }

    // UI Offset for navbar
    const uiY = 72 + 14;

    // Life dots (top-left)
    const dotR = 4, gap = 13, sx = 14;
    for (let i = 0; i < 16; i++) {
        const r = (i / 8) | 0, c = i % 8;
        ctx.beginPath(); ctx.arc(sx + c * gap + dotR, uiY + r * (dotR * 2 + 4) + dotR, dotR, 0, Math.PI * 2);
        ctx.fillStyle = elim[i] ? '#ff335530' : '#00ffaa'; ctx.fill();
    }

    // Speed indicator (top-right, only above 1.5×)
    if (clockSpd > 1.5) {
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.font = "bold 11px 'Orbitron',sans-serif";
        ctx.fillStyle = clockSpd > 2.5 ? '#ff4422' : '#ffaa33';
        ctx.fillText(`${clockSpd.toFixed(2)}×`, W - 14, uiY);
    }

    // Scanlines
    scanY += dt * 80; if (scanY > H) scanY = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.009)';
    for (let y = scanY % 4; y < H; y += 4) ctx.fillRect(0, y, W, 1);
}

function renderTitle() {
    const t = performance.now() / 1000;
    for (let i = 0; i < 30; i++) {
        const x = ((Math.sin(i * 1.7 + t * .3) + 1) / 2) * W, y = ((Math.cos(i * 2.3 + t * .2) + 1) / 2) * H;
        ctx.beginPath(); ctx.arc(x, y, 1.5 + Math.sin(i + t), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${(i * 23) % 360},80%,60%,0.15)`; ctx.fill();
    }
}

requestAnimationFrame(loop);
