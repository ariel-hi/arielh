export const S = 200;
const cl = (v, a, b) => Math.max(a, Math.min(b, v)), rn = (a, b) => Math.random() * (b - a) + a, ri = (a, b) => Math.floor(rn(a, b + 1)), ds = (x1, y1, x2, y2) => Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
function col(ax, ay, aw, ah, bx, by, bw, bh) { return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by; }

// 1: TURRET
class Turret {
    constructor() { this.name = 'TURRET'; this.color = '#ff3366'; this.hint = 'AVOID THE BULLETS'; this.controls = ['up', 'down', 'left', 'right']; this.reset(); }
    reset() { this.px = 100; this.py = 100; this.failed = false; this.b = []; this.t = .5; }
    update(dt, k, sp, on) { const m = 140 * sp; if (on) { if (k.left) this.px -= m * dt; if (k.right) this.px += m * dt; if (k.up) this.py -= m * dt; if (k.down) this.py += m * dt; } this.px = cl(this.px, 10, S - 10); this.py = cl(this.py, 10, S - 10); this.t -= dt; if (this.t <= 0) { const s = ri(0, 3), v = 105 * sp; let x, y, vx, vy; if (s === 0) { x = rn(15, S - 15); y = -4; vx = rn(-20, 20); vy = v; } else if (s === 1) { x = rn(15, S - 15); y = S + 4; vx = rn(-20, 20); vy = -v; } else if (s === 2) { x = -4; y = rn(15, S - 15); vx = v; vy = rn(-20, 20); } else { x = S + 4; y = rn(15, S - 15); vx = -v; vy = rn(-20, 20); } this.b.push({ x, y, vx, vy }); this.t = rn(.35, .6) / sp; } for (const b of this.b) { b.x += b.vx * dt; b.y += b.vy * dt; } this.b = this.b.filter(b => b.x > -15 && b.x < S + 15 && b.y > -15 && b.y < S + 15); if (on) for (const b of this.b) if (ds(this.px, this.py, b.x, b.y) < 11) this.failed = true; }
    render(c) { c.fillStyle = this.color + '30'; for (let i = 0; i < 5; i++) { c.fillRect(i * 40 + 6, 0, 6, 3); c.fillRect(i * 40 + 6, S - 3, 6, 3); c.fillRect(0, i * 40 + 6, 3, 6); c.fillRect(S - 3, i * 40 + 6, 3, 6); } c.fillStyle = this.color; for (const b of this.b) { c.beginPath(); c.arc(b.x, b.y, 4, 0, Math.PI * 2); c.fill(); } c.beginPath(); c.arc(this.px, this.py, 7, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
}

// 2: TRAP
class Trap {
    constructor() { this.name = 'TRAP'; this.color = '#ff3333'; this.hint = 'AVOID THE TILES'; this.controls = ['up', 'down', 'left', 'right']; this.reset(); }
    reset() { this.px = 100; this.py = 100; this.failed = false; this.tiles = []; this.t = 0; }
    update(dt, k, sp, on) { const m = 130 * sp; if (on) { if (k.left) this.px -= m * dt; if (k.right) this.px += m * dt; if (k.up) this.py -= m * dt; if (k.down) this.py += m * dt; } this.px = cl(this.px, 7, S - 7); this.py = cl(this.py, 7, S - 7); this.t -= dt; if (this.t <= 0) { const gx = ri(0, 3), gy = ri(0, 3); if (!this.tiles.some(t => t.gx === gx && t.gy === gy)) this.tiles.push({ gx, gy, warnT: 0, activeT: 0, phase: 'warn', warnDur: Math.max(0.4, 0.55 / Math.sqrt(sp)) }); this.t = rn(.4, .8) / sp; } for (const t of this.tiles) { if (t.phase === 'warn') { t.warnT += dt; if (t.warnT >= t.warnDur) { t.phase = 'active'; t.activeT = 0; } } else if (t.phase === 'active') { t.activeT += dt; if (t.activeT > 0.45) t.phase = 'done'; } } this.tiles = this.tiles.filter(t => t.phase !== 'done'); if (on) for (const t of this.tiles) if (t.phase === 'active') { if (col(this.px - 6, this.py - 6, 12, 12, t.gx * 50, t.gy * 50, 50, 50)) this.failed = true; } }
    render(c) { for (const t of this.tiles) { const x = t.gx * 50, y = t.gy * 50; if (t.phase === 'warn') { const p = t.warnT / t.warnDur; c.fillStyle = this.color + Math.floor(p * 0x66 + 0x18).toString(16).padStart(2, '0'); } else { c.fillStyle = this.color + 'cc'; } c.fillRect(x + 2, y + 2, 46, 46); } c.strokeStyle = this.color + '15'; c.lineWidth = .5; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(i * 50, 0); c.lineTo(i * 50, S); c.stroke(); c.beginPath(); c.moveTo(0, i * 50); c.lineTo(S, i * 50); c.stroke(); } c.beginPath(); c.arc(this.px, this.py, 7, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
}

// 3: FLAP
class Flap {
    constructor() { this.name = 'FLAP'; this.color = '#ffaa33'; this.hint = 'STAY AIRBORNE'; this.controls = ['up']; this.reset(); }
    reset() { this.py = 100; this.vy = 0; this.failed = false; this.pipes = []; this.t = 0; this.x = 50; }
    update(dt, k, sp, on) { if (on && k.up) this.vy = -190; this.vy += 520 * dt; this.py += this.vy * dt; if (this.py < 5 || this.py > S - 5) { if (on) this.failed = true; this.py = cl(this.py, 5, S - 5); this.vy = 0; } this.t -= dt; if (this.t <= 0) { const gap = cl(62 - sp * 3, 36, 60), gy = rn(gap / 2 + 20, S - gap / 2 - 20); this.pipes.push({ x: S + 10, gy, gap }); this.t = rn(1.2, 2) / sp; } for (const p of this.pipes) p.x -= 75 * sp * dt; this.pipes = this.pipes.filter(p => p.x > -20); if (on) for (const p of this.pipes) if (Math.abs(p.x - this.x) < 12 && (this.py < p.gy - p.gap / 2 || this.py > p.gy + p.gap / 2)) this.failed = true; }
    render(c) { c.fillStyle = this.color; for (const p of this.pipes) { c.fillRect(p.x - 6, 0, 12, p.gy - p.gap / 2); c.fillRect(p.x - 6, p.gy + p.gap / 2, 12, S - p.gy - p.gap / 2); } c.beginPath(); c.arc(this.x, this.py, 7, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
}

// 4: PATH — stay on the moving path of lit squares
class Path {
    constructor() { this.name = 'PATH'; this.color = '#44ffaa'; this.hint = 'FOLLOW THE TILES'; this.controls = ['up', 'down', 'left', 'right']; this.reset(); }
    reset() {
        this.px = 40; this.py = 100; this.failed = false;
        this.path = [{ c: 0, r: 2 }, { c: 1, r: 2 }, { c: 2, r: 2 }];
        this.t = 0; this.interval = 0.55;
    }
    _gridAt(x, y) { return { c: cl(Math.floor(x / 40), 0, 4), r: cl(Math.floor(y / 40), 0, 4) }; }
    update(dt, k, sp, on) {
        const m = 150 * sp; if (on) { if (k.left) this.px -= m * dt; if (k.right) this.px += m * dt; if (k.up) this.py -= m * dt; if (k.down) this.py += m * dt; }
        this.px = cl(this.px, 4, S - 4); this.py = cl(this.py, 4, S - 4);
        this.t += dt * sp;
        if (this.t >= this.interval) {
            this.t = 0;
            const head = this.path[this.path.length - 1];
            const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }].filter(d => {
                const nx = head.c + d.x, ny = head.r + d.y;
                return nx >= 0 && nx < 5 && ny >= 0 && ny < 5 && !this.path.some(p => p.c === nx && p.r === ny);
            });
            if (dirs.length > 0) {
                const pick = dirs[ri(0, dirs.length - 1)];
                this.path.push({ c: head.c + pick.x, r: head.r + pick.y });
                if (this.path.length > 4) this.path.shift();
            } else {
                this.path.shift(); // shrinks if stuck to clear out
            }
        }
        if (on) {
            const pos = this._gridAt(this.px, this.py);
            if (!this.path.some(p => p.c === pos.c && p.r === pos.r)) this.failed = true;
        }
    }
    render(c) {
        c.fillStyle = '#ffffff04'; c.fillRect(0, 0, S, S);
        for (let i = 0; i < this.path.length; i++) {
            const p = this.path[i];
            const a = Math.floor((i + 1) / this.path.length * 200).toString(16).padStart(2, '0');
            c.fillStyle = this.color + a;
            c.fillRect(p.c * 40 + 1, p.r * 40 + 1, 38, 38);
        }
        c.strokeStyle = '#ffffff10'; c.lineWidth = 1;
        for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(i * 40, 0); c.lineTo(i * 40, S); c.stroke(); c.beginPath(); c.moveTo(0, i * 40); c.lineTo(S, i * 40); c.stroke(); }
        c.beginPath(); c.arc(this.px, this.py, 7, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    }
}

// 5: CRUSH — bars always have escapable gaps, consistent speeds
class WallCrush {
    constructor() { this.name = 'CRUSH'; this.color = '#ff4444'; this.hint = 'STAY IN THE GAPS'; this.controls = ['up', 'down', 'left', 'right']; this.reset(); }
    reset() { this.px = 100; this.py = 100; this.failed = false; this.w = []; this.t = 0; this.baseSpd = 72; }
    update(dt, k, sp, on) {
        const m = 140 * sp;
        if (on) { if (k.left) this.px -= m * dt; if (k.right) this.px += m * dt; if (k.up) this.py -= m * dt; if (k.down) this.py += m * dt; }
        this.px = cl(this.px, 8, S - 8); this.py = cl(this.py, 8, S - 8);
        // Normalize all existing bar speeds on every frame so re-entry is fair
        const curSpd = this.baseSpd * sp;
        for (const w of this.w) w.spd = curSpd;
        this.t -= dt;
        if (this.t <= 0) {
            const h = Math.random() > .5;
            const gs = Math.max(30, 48 - sp * 3); // wider gap
            // Ensure gap overlaps with previous bar's gap if they're the same axis
            const lastSame = [...this.w].reverse().find(w2 => w2.h === h);
            let gp;
            if (lastSame) {
                // Ensure at least 20px overlap with previous gap so player can always move through
                const minGp = Math.max(15, lastSame.gp - gs + 20);
                const maxGp = Math.min(S - gs - 15, lastSame.gp + lastSame.gs - 20);
                gp = minGp < maxGp ? rn(minGp, maxGp) : rn(15, S - gs - 15);
            } else {
                gp = rn(15, S - gs - 15);
            }
            this.w.push({ h, pos: -10, gp, gs, spd: curSpd });
            this.t = rn(.75, 1.4) / sp;
        }
        for (const w of this.w) w.pos += w.spd * dt;
        this.w = this.w.filter(w => w.pos < S + 20);
        if (on) for (const w of this.w) {
            if (w.h) { if (Math.abs(this.py - w.pos) < 8 && (this.px < w.gp || this.px > w.gp + w.gs)) this.failed = true; }
            else { if (Math.abs(this.px - w.pos) < 8 && (this.py < w.gp || this.py > w.gp + w.gs)) this.failed = true; }
        }
    }
    render(c) { c.fillStyle = this.color; for (const w of this.w) { if (w.h) { c.fillRect(0, w.pos - 3, w.gp, 6); c.fillRect(w.gp + w.gs, w.pos - 3, S - w.gp - w.gs, 6); } else { c.fillRect(w.pos - 3, 0, 6, w.gp); c.fillRect(w.pos - 3, w.gp + w.gs, 6, S - w.gp - w.gs); } } c.beginPath(); c.arc(this.px, this.py, 7, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
}

// 6: MATCH — hold direction, slightly slower, target shifted left
class Match {
    constructor() { this.name = 'MATCH'; this.color = '#aa66ff'; this.hint = 'FACE THE ARROWS'; this.controls = ['up', 'down', 'left', 'right']; this.reset(); }
    reset() { this.failed = false; this.blocks = []; this.t = .3; this.held = ''; this.hitX = 32; }
    update(dt, k, sp, on) {
        this.t -= dt; if (this.t <= 0) { const dirs = ['up', 'down', 'left', 'right']; this.blocks.push({ x: S + 20, dir: dirs[ri(0, 3)], scored: false }); this.t = rn(0.75, 1.25) / sp; }
        for (const b of this.blocks) b.x -= 140 * sp * dt;
        if (on) {
            const h = k.up ? 'up' : k.down ? 'down' : k.left ? 'left' : k.right ? 'right' : '';
            if (h) this.held = h;
            for (const b of this.blocks) {
                if (!b.scored && Math.abs(b.x - this.hitX) < 24) {
                    if (this.held === b.dir) b.scored = true;
                }
            }
            for (const b of this.blocks) if (!b.scored && b.x < this.hitX - 24) { this.failed = true; return; }
        }
        this.blocks = this.blocks.filter(b => b.x > -25); if (!on) this.held = '';
    }
    render(c) {
        const arrows = { up: '▲', down: '▼', left: '◄', right: '►' };

        c.strokeStyle = '#ffffff22'; c.lineWidth = 1; c.beginPath(); c.moveTo(this.hitX + 22, S / 2); c.lineTo(S, S / 2); c.stroke();

        c.strokeStyle = this.held ? '#fff' : this.color;
        c.lineWidth = 3;
        c.strokeRect(this.hitX - 20, S / 2 - 20, 40, 40);

        if (this.held) {
            c.fillStyle = '#fff'; c.font = '22px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(arrows[this.held], this.hitX, S / 2 + 1);
        }

        for (const b of this.blocks) {
            if (b.scored) continue;
            c.fillStyle = this.color; c.fillRect(b.x - 16, S / 2 - 16, 32, 32);
            c.fillStyle = '#fff'; c.font = '18px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(arrows[b.dir], b.x, S / 2 + 1);
        }
    }
}

// 8: PONG — faster
class Pong {
    constructor() { this.name = 'PONG'; this.color = '#ffff33'; this.hint = 'DEFLECT THE BALL'; this.controls = ['up', 'down']; this.reset(); }
    reset() { this.paddleY = 85; this.failed = false; this.bx = 100; this.by = 100; this.bvx = 110 * (Math.random() > .5 ? 1 : -1); this.bvy = rn(-80, 80); }
    update(dt, k, sp, on) { if (on) { if (k.up) this.paddleY -= 180 * sp * dt; if (k.down) this.paddleY += 180 * sp * dt; } this.paddleY = cl(this.paddleY, 0, S - 35); this.bx += this.bvx * sp * dt; this.by += this.bvy * sp * dt; if (this.by <= 4) { this.by = 4; this.bvy = Math.abs(this.bvy); } if (this.by >= S - 4) { this.by = S - 4; this.bvy = -Math.abs(this.bvy); } if (this.bx >= S - 4) { this.bx = S - 4; this.bvx = -Math.abs(this.bvx); } if (this.bx <= 18 && this.bx >= 10 && this.by >= this.paddleY && this.by <= this.paddleY + 35) { this.bvx = Math.abs(this.bvx) * 1.08; this.bvy += (this.by - (this.paddleY + 17)) * 2; this.bx = 18; } if (this.bx < -5) { if (on) this.failed = true; this.bx = 100; this.by = 100; this.bvx = 110; this.bvy = rn(-80, 80); } }
    render(c) { c.fillStyle = '#fff'; c.fillRect(8, this.paddleY, 8, 35); c.beginPath(); c.arc(this.bx, this.by, 5, 0, Math.PI * 2); c.fillStyle = this.color; c.fill(); }
}

// 9: LANES
class Highway {
    constructor() { this.name = 'LANES'; this.color = '#ff8833'; this.hint = 'AVOID THE CARS'; this.controls = ['left', 'right']; this.reset(); }
    reset() { this.lane = 1; this.failed = false; this.cars = []; this.t = 0; this.cd = 0; this.lastLane = -1; }
    update(dt, k, sp, on) { this.cd -= dt; if (on && this.cd <= 0) { if (k.left && this.lane > 0) { this.lane--; this.cd = .15; } if (k.right && this.lane < 2) { this.lane++; this.cd = .15; } } this.t -= dt; if (this.t <= 0) { let l; do { l = ri(0, 2); } while (l === this.lastLane); this.lastLane = l; this.cars.push({ lane: l, y: -20 }); this.t = rn(.4, .7) / sp; } const lx = [S * .25, S * .5, S * .75]; for (const c of this.cars) c.y += 130 * sp * dt; this.cars = this.cars.filter(c => c.y < S + 30); if (on) for (const c of this.cars) if (c.lane === this.lane && Math.abs(c.y - 165) < 20) this.failed = true; }
    render(c) { const lx = [S * .25, S * .5, S * .75]; c.setLineDash([8, 12]); c.strokeStyle = this.color + '20'; c.lineWidth = 1; for (let i = 0; i < 2; i++) { const x = (lx[i] + lx[i + 1]) / 2; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, S); c.stroke(); } c.setLineDash([]); c.fillStyle = this.color; for (const cr of this.cars) c.fillRect(lx[cr.lane] - 8, cr.y - 12, 16, 24); c.fillStyle = '#fff'; c.fillRect(lx[this.lane] - 8, 157, 16, 16); }
}

// 10: CHAOS
class BouncingChaos {
    constructor() { this.name = 'CHAOS'; this.color = '#ff5555'; this.hint = 'AVOID THE BALLS'; this.controls = ['up', 'down', 'left', 'right']; this.reset(); }
    reset() { this.px = 100; this.py = 100; this.failed = false; this.balls = []; const cx = [20, 180, 20, 180], cy = [20, 20, 180, 180]; for (let i = 0; i < 4; i++)this.balls.push({ x: cx[i] + rn(-8, 8), y: cy[i] + rn(-8, 8), r: rn(8, 14), vx: rn(-100, 100), vy: rn(-100, 100) }); }
    update(dt, k, sp, on) {
        const m = 130 * sp; if (on) { if (k.left) this.px -= m * dt; if (k.right) this.px += m * dt; if (k.up) this.py -= m * dt; if (k.down) this.py += m * dt; }
        this.px = cl(this.px, 7, S - 7); this.py = cl(this.py, 7, S - 7);
        for (const b of this.balls) { b.x += b.vx * sp * dt; b.y += b.vy * sp * dt; if (b.x - b.r < 0 || b.x + b.r > S) b.vx *= -1; if (b.y - b.r < 0 || b.y + b.r > S) b.vy *= -1; b.x = cl(b.x, b.r, S - b.r); b.y = cl(b.y, b.r, S - b.r); }
        for (let i = 0; i < this.balls.length; i++) {
            for (let j = i + 1; j < this.balls.length; j++) {
                const b1 = this.balls[i], b2 = this.balls[j], dx = b2.x - b1.x, dy = b2.y - b1.y, d = Math.sqrt(dx * dx + dy * dy);
                if (d < b1.r + b2.r && d > 0) {
                    const nx = dx / d, ny = dy / d, p = 2 * (b1.vx * nx + b1.vy * ny - b2.vx * nx - b2.vy * ny) / 2;
                    b1.vx -= p * nx; b1.vy -= p * ny; b2.vx += p * nx; b2.vy += p * ny;
                    const overlap = (b1.r + b2.r - d) / 2;
                    b1.x -= overlap * nx; b1.y -= overlap * ny; b2.x += overlap * nx; b2.y += overlap * ny;
                }
            }
        }
        if (on) for (const b of this.balls) if (ds(this.px, this.py, b.x, b.y) < 7 + b.r - 2) this.failed = true;
    }
    render(c) { for (const b of this.balls) { c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fillStyle = this.color + '80'; c.fill(); c.strokeStyle = this.color; c.lineWidth = 1.5; c.stroke(); } c.beginPath(); c.arc(this.px, this.py, 7, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
}

// 11: ZONE — arc timer always green, highlight when inside
class SafeZone {
    constructor() { this.name = 'ZONE'; this.color = '#33ffcc'; this.hint = 'ENTER THE CIRCLES'; this.controls = ['up', 'down', 'left', 'right']; this.reset(); }
    reset() { this.px = 100; this.py = 100; this.failed = false; this.zones = []; this._spawn(); }
    _spawn() { this.zones.push({ x: rn(35, S - 35), y: rn(35, S - 35), r: 32, timer: 0, dur: rn(2.2, 3) }); }
    update(dt, k, sp, on) { const m = 140 * sp; if (on) { if (k.left) this.px -= m * dt; if (k.right) this.px += m * dt; if (k.up) this.py -= m * dt; if (k.down) this.py += m * dt; } this.px = cl(this.px, 7, S - 7); this.py = cl(this.py, 7, S - 7); for (const z of this.zones) z.timer += dt * sp; if (this.zones.length < 2 && this.zones[0] && this.zones[0].timer / this.zones[0].dur > .55) this._spawn(); const expired = []; for (const z of this.zones) { if (z.timer >= z.dur) { if (ds(this.px, this.py, z.x, z.y) > z.r && on) this.failed = true; expired.push(z); } } this.zones = this.zones.filter(z => !expired.includes(z)); if (this.zones.length === 0) this._spawn(); }
    render(c) {
        for (const z of this.zones) {
            const pct = z.timer / z.dur, inside = ds(this.px, this.py, z.x, z.y) <= z.r;
            // Fill
            c.beginPath(); c.arc(z.x, z.y, z.r, 0, Math.PI * 2);
            c.fillStyle = inside ? this.color + '75' : this.color + '0a'; c.fill();
            // Outer ring (always game color)
            c.beginPath(); c.arc(z.x, z.y, z.r, 0, Math.PI * 2);
            c.strokeStyle = this.color + (inside ? 'ff' : '50'); c.lineWidth = 1; c.stroke();
            // Arc countdown
            const remaining = 1 - pct;
            c.beginPath(); c.arc(z.x, z.y, z.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remaining);
            c.strokeStyle = this.color; c.lineWidth = 3; c.stroke();
        }
        c.beginPath(); c.arc(this.px, this.py, 7, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    }
}

// 12: GRAVITY — stronger gravity, smaller gaps
class Gravity {
    constructor() { this.name = 'GRAVITY'; this.color = '#6699ff'; this.hint = 'FALL THROUGH THE GAPS'; this.controls = ['left', 'right']; this.reset(); }
    reset() { this.px = 100; this.py = 30; this.vy = 0; this.failed = false; this.bars = []; this.t = 0; }
    update(dt, k, sp, on) { if (on) { if (k.left) this.px -= 130 * sp * dt; if (k.right) this.px += 130 * sp * dt; } this.px = cl(this.px, 8, S - 8); this.vy += 850 * dt; this.py += this.vy * dt; this.t -= dt; if (this.t <= 0) { const gw = cl(40 - sp * 3, 22, 40); this.bars.push({ y: S + 5, gx: rn(8, S - gw - 8), gw }); this.t = rn(.65, 1.1) / sp; } for (const b of this.bars) b.y -= 55 * sp * dt; this.bars = this.bars.filter(b => b.y > -15); for (const b of this.bars) { if (this.py + 7 >= b.y && this.py + 7 <= b.y + 10 && this.vy >= 0) { if (this.px >= b.gx && this.px <= b.gx + b.gw) { } else { this.py = b.y - 7; this.vy = 0; } } } if (this.py > S - 7) { this.py = S - 7; this.vy = 0; } if (this.py < 5 && on) this.failed = true; this.py = Math.max(5, this.py); }
    render(c) { c.fillStyle = this.color; for (const b of this.bars) { c.fillRect(0, b.y, b.gx, 8); c.fillRect(b.gx + b.gw, b.y, S - b.gx - b.gw, 8); c.fillStyle = this.color + '30'; c.fillRect(b.gx, b.y, b.gw, 8); c.fillStyle = this.color; } c.beginPath(); c.arc(this.px, this.py, 7, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
}

// 13: CHASE — increased safe radius from 55 to 70
class LightChase {
    constructor() { this.name = 'CHASE'; this.color = '#ffcc33'; this.hint = 'STAY NEAR THE LIGHT'; this.controls = ['up', 'down', 'left', 'right']; this.safeR = 70; this.reset(); }
    reset() { this.px = 100; this.py = 100; this.failed = false; this.lx = 100; this.ly = 100; this.lvx = 55; this.lvy = 42; }
    update(dt, k, sp, on) { const m = 150 * sp; if (on) { if (k.left) this.px -= m * dt; if (k.right) this.px += m * dt; if (k.up) this.py -= m * dt; if (k.down) this.py += m * dt; } this.px = cl(this.px, 7, S - 7); this.py = cl(this.py, 7, S - 7); this.lx += this.lvx * sp * dt; this.ly += this.lvy * sp * dt; if (this.lx < 20 || this.lx > S - 20) this.lvx *= -1; if (this.ly < 20 || this.ly > S - 20) this.lvy *= -1; this.lx = cl(this.lx, 10, S - 10); this.ly = cl(this.ly, 10, S - 10); if (Math.random() < 1.5 * dt) { this.lvx = rn(-60, 60) * sp; this.lvy = rn(-60, 60) * sp; } if (on && ds(this.px, this.py, this.lx, this.ly) > this.safeR) this.failed = true; }
    render(c) { c.strokeStyle = this.color + '30'; c.lineWidth = 1; c.beginPath(); c.moveTo(this.px, this.py); c.lineTo(this.lx, this.ly); c.stroke(); c.beginPath(); c.arc(this.lx, this.ly, this.safeR, 0, Math.PI * 2); c.strokeStyle = this.color + '18'; c.lineWidth = 1; c.stroke(); c.beginPath(); c.arc(this.lx, this.ly, 8, 0, Math.PI * 2); c.fillStyle = this.color; c.fill(); c.beginPath(); c.arc(this.px, this.py, 7, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
}

// 14: ASTEROID — OG Asteroids style: rotate, thrust, constant shooting, split
class Asteroid {
    constructor() { this.name = 'ASTEROID'; this.color = '#cc66ff'; this.hint = 'BLAST THE ROCKS'; this.controls = ['up', 'left', 'right']; this.reset(); }
    reset() { 
        this.px = 100; this.py = 100; this.angle = -Math.PI/2; this.vx = 0; this.vy = 0;
        this.failed = false; this.enemies = []; this.bullets = []; this.t = 0; this.st = 0; 
    }
    update(dt, k, sp, on) {
        if (!on) return;
        if (k.left) this.angle -= 4.5 * dt;
        if (k.right) this.angle += 4.5 * dt;
        if (k.up) {
            this.vx += Math.cos(this.angle) * 350 * dt;
            this.vy += Math.sin(this.angle) * 350 * dt;
        }
        this.vx *= 0.98; this.vy *= 0.98;
        this.px += this.vx * dt; this.py += this.vy * dt;
        if (this.px < 0) this.px += S; if (this.px > S) this.px -= S;
        if (this.py < 0) this.py += S; if (this.py > S) this.py -= S;

        this.st += dt;
        if (this.st > 0.18) {
            this.bullets.push({ x: this.px, y: this.py, vx: Math.cos(this.angle) * 220, vy: Math.sin(this.angle) * 220, t: 0.8 });
            this.st = 0;
        }

        for (const b of this.bullets) {
            b.x += b.vx * dt; b.y += b.vy * dt; b.t -= dt;
            // No warping for bullets
        }
        this.bullets = this.bullets.filter(b => b.t > 0 && b.x > 0 && b.x < S && b.y > 0 && b.y < S);

        for (const e of this.enemies) {
            e.x += e.vx * dt; e.y += e.vy * dt;
            if (e.x < -20) e.x += S + 40; if (e.x > S + 20) e.x -= S + 40;
            if (e.y < -20) e.y += S + 40; if (e.y > S + 20) e.y -= S + 40;
        }

        this.t -= dt;
        if (this.t <= 0 && this.enemies.length < 8) {
            const side = ri(0, 3);
            let x, y;
            if (side === 0) { x = -15; y = rn(0, S); }
            else if (side === 1) { x = S + 15; y = rn(0, S); }
            else if (side === 2) { x = rn(0, S); y = -15; }
            else { x = rn(0, S); y = S + 15; }
            this.enemies.push({ x, y, vx: rn(-45, 45) * sp, vy: rn(-45, 45) * sp, r: 11, split: true });
            this.t = 1.8 / sp;
        }

        for (const b of this.bullets) {
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const e = this.enemies[i];
                if (ds(b.x, b.y, e.x, e.y) < e.r + 4) {
                    b.t = 0;
                    if (e.split) {
                        this.enemies.push({ x: e.x, y: e.y, vx: e.vy*1.2, vy: -e.vx*1.2, r: 6, split: false });
                        this.enemies.push({ x: e.x, y: e.y, vx: -e.vy*1.2, vy: e.vx*1.2, r: 6, split: false });
                    }
                    this.enemies.splice(i, 1);
                    break;
                }
            }
        }
        for (const e of this.enemies) if (ds(this.px, this.py, e.x, e.y) < e.r + 5) this.failed = true;
    }
    render(c) {
        c.save(); c.translate(this.px, this.py); c.rotate(this.angle);
        // Ship as circle with a "nose" line to show direction
        c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); 
        c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke();
        c.beginPath(); c.moveTo(0, 0); c.lineTo(9, 0); c.stroke();
        c.restore();
        c.fillStyle = '#fff'; for (const b of this.bullets) { c.beginPath(); c.arc(b.x, b.y, 1.5, 0, Math.PI * 2); c.fill(); }
        c.strokeStyle = this.color; c.lineWidth = 1.5;
        for (const e of this.enemies) {
            c.beginPath(); const s = 6;
            for (let i = 0; i < s; i++) {
                const ang = (i / s) * Math.PI * 2, r = e.r * (0.8 + Math.sin(i * 11) * 0.2);
                const x = e.x + Math.cos(ang) * r, y = e.y + Math.sin(ang) * r;
                if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
            }
            c.closePath(); c.stroke();
        }
    }
}

// 15: PULSE — only kill when ring is clearly visible
class PulseRings {
    constructor() { this.name = 'PULSE'; this.color = '#ff4400'; this.hint = 'AVOID THE RIPPLES'; this.controls = ['up', 'down', 'left', 'right']; this.reset(); }
    reset() { this.px = 100; this.py = 100; this.failed = false; this.rings = []; this.t = 0; }
    update(dt, k, sp, on) {
        const m = 140 * sp; if (on) { if (k.left) this.px -= m * dt; if (k.right) this.px += m * dt; if (k.up) this.py -= m * dt; if (k.down) this.py += m * dt; } this.px = cl(this.px, 7, S - 7); this.py = cl(this.py, 7, S - 7); this.t -= dt; if (this.t <= 0) { let rx, ry, tries = 0; do { rx = rn(20, S - 20); ry = rn(20, S - 20); tries++; } while (ds(this.px, this.py, rx, ry) < 45 && tries < 20); this.rings.push({ x: rx, y: ry, r: 0, max: rn(55, 95), th: 7 }); this.t = rn(.7, 1.3) / sp; } for (const r of this.rings) r.r += 45 * sp * dt; this.rings = this.rings.filter(r => r.r < r.max + 20);// Only kill when ring opacity > 40% (not fading in or out)
        if (on) for (const r of this.rings) { const pct = r.r / r.max; if (pct > 0.05 && pct < 0.92) { const d = ds(this.px, this.py, r.x, r.y); if (Math.abs(d - r.r) < r.th / 2 + 5) this.failed = true; } }
    }
    render(c) { for (const r of this.rings) { const pct = r.r / r.max, a = pct < 0.1 ? pct / 0.1 : pct > 0.85 ? Math.max(0, (1 - pct) / 0.15) : 1; c.beginPath(); c.arc(r.x, r.y, r.r, 0, Math.PI * 2); c.strokeStyle = this.color + Math.floor(a * 200).toString(16).padStart(2, '0'); c.lineWidth = r.th; c.stroke(); } c.beginPath(); c.arc(this.px, this.py, 7, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
}

// 16: LASER — dual alternating system, longer warning
class Laser {
    constructor() { this.name = 'LASER'; this.color = '#ff66aa'; this.hint = 'EVADE THE BEAMS'; this.controls = ['up', 'down', 'left', 'right']; this.reset(); }
    reset() { this.px = 100; this.py = 100; this.failed = false; this.beams = [{ horiz: Math.random() > .5, pos: rn(5, S - 5), phase: 'warn', t: 0, warnDur: .8 }, { horiz: Math.random() > .5, pos: rn(5, S - 5), phase: 'warn', t: .4, warnDur: .8 }]; this.offset = 0; }
    update(dt, k, sp, on) { const m = 140 * sp; if (on) { if (k.left) this.px -= m * dt; if (k.right) this.px += m * dt; if (k.up) this.py -= m * dt; if (k.down) this.py += m * dt; } this.px = cl(this.px, 7, S - 7); this.py = cl(this.py, 7, S - 7); for (const b of this.beams) { b.t += dt; if (b.phase === 'warn' && b.t >= b.warnDur) { b.phase = 'fire'; b.t = 0; } else if (b.phase === 'fire' && b.t >= .28) { b.phase = 'warn'; b.t = 0; b.horiz = Math.random() > .5; b.pos = rn(8, S - 8); b.warnDur = Math.max(.5, .85 / Math.sqrt(sp)); } } if (on) for (const b of this.beams) if (b.phase === 'fire') { if (b.horiz && Math.abs(this.py - b.pos) < 8) this.failed = true; if (!b.horiz && Math.abs(this.px - b.pos) < 8) this.failed = true; } }
    render(c) { for (const b of this.beams) { if (b.phase === 'warn') { const p = b.t / b.warnDur; c.strokeStyle = this.color + Math.floor(p * 0x77 + 0x22).toString(16).padStart(2, '0'); c.lineWidth = 1; c.setLineDash([4, 4]); c.beginPath(); if (b.horiz) { c.moveTo(0, b.pos); c.lineTo(S, b.pos); } else { c.moveTo(b.pos, 0); c.lineTo(b.pos, S); } c.stroke(); c.setLineDash([]); } else { c.fillStyle = this.color + 'a0'; if (b.horiz) c.fillRect(0, b.pos - 5, S, 10); else c.fillRect(b.pos - 5, 0, 10, S); } } c.beginPath(); c.arc(this.px, this.py, 7, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
}

// 17: SHRINK — 4 walls converge to a random inner rectangle
class Shrink {
    constructor() { this.name = 'SHRINK'; this.color = '#ff9944'; this.hint = 'STAY INSIDE'; this.controls = ['up', 'down', 'left', 'right']; this.reset(); }
    reset() { this.px = 100; this.py = 100; this.failed = false; this.t = 0; this.dur = 2.5; this._newTarget(); }
    _newTarget() {
        const tw = rn(35, 70), th = rn(35, 70);
        this.tl = rn(10, S - tw - 10); this.tr = this.tl + tw;
        this.tt = rn(10, S - th - 10); this.tb = this.tt + th;
    }
    _lerp(a, b, t) { return a + (b - a) * t; }
    update(dt, k, sp, on) {
        const m = 140 * sp; if (on) { if (k.left) this.px -= m * dt; if (k.right) this.px += m * dt; if (k.up) this.py -= m * dt; if (k.down) this.py += m * dt; }
        this.t += dt * sp; const pct = Math.min(1, this.t / this.dur);
        const l = this._lerp(0, this.tl, pct), r = this._lerp(S, this.tr, pct);
        const t2 = this._lerp(0, this.tt, pct), b = this._lerp(S, this.tb, pct);
        this.px = cl(this.px, l + 7, r - 7); this.py = cl(this.py, t2 + 7, b - 7);
        if (on && pct > 0.12 && (this.px <= l + 9 || this.px >= r - 9 || this.py <= t2 + 9 || this.py >= b - 9)) this.failed = true;
        if (pct >= 1) { this.t = 0; this._newTarget(); }
    }
    render(c) {
        const pct = Math.min(1, this.t / this.dur);
        const l = this._lerp(0, this.tl, pct), r = this._lerp(S, this.tr, pct);
        const t2 = this._lerp(0, this.tt, pct), b = this._lerp(S, this.tb, pct);
        c.fillStyle = this.color + '18';
        c.fillRect(0, 0, l, S); c.fillRect(r, 0, S - r, S);
        c.fillRect(l, 0, r - l, t2); c.fillRect(l, b, r - l, S - b);
        c.strokeStyle = this.color; c.lineWidth = 2; c.strokeRect(l, t2, r - l, b - t2);
        c.beginPath(); c.arc(this.px, this.py, 7, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    }
}

// 18: CATCH — no red balls, wider basket bar with edges
class Catch {
    constructor() { this.name = 'CATCH'; this.color = '#44ffaa'; this.hint = 'COLLECT THE DROPS'; this.controls = ['left', 'right']; this.reset(); }
    reset() { this.px = 100; this.py = 170; this.failed = false; this.items = []; this.t = 1.0; }
    update(dt, k, sp, on) {
        const m = 280 * sp;
        if (on) { if (k.left) this.px -= m * dt; if (k.right) this.px += m * dt; }
        this.px = cl(this.px, 18, S - 18);
        this.t -= dt;
        if (this.t <= 0) {
            this.items.push({ x: rn(15, S - 15), y: -8 });
            this.t = rn(.35, .65) / sp;
        }
        for (const it of this.items) it.y += 110 * sp * dt;
        for (const it of this.items) {
            if (!it.hit && Math.abs(it.x - this.px) < 22 && Math.abs(it.y - 170) < 14) {
                it.hit = true;
            }
            if (!it.hit && it.y > S + 5) { if (on) this.failed = true; return; }
        }
        this.items = this.items.filter(it => it.y < S + 15 && !it.hit);
    }
    render(c) {
        for (const it of this.items) { c.beginPath(); c.arc(it.x, it.y, 7, 0, Math.PI * 2); c.fillStyle = '#44ff88'; c.fill(); }
        // Basket: wider bar with side edges
        const bw = 36, bh = 10, bx = this.px - bw / 2, by = 165;
        c.fillStyle = '#fff';
        c.fillRect(bx, by, bw, bh); // base
        c.fillRect(bx - 3, by - 8, 3, bh + 8); // left edge
        c.fillRect(bx + bw, by - 8, 3, bh + 8); // right edge
    }
}

// 19: CLIMB — fast rise, sparse platforms, smush at top = fail, smaller initial bar
class Climb {
    constructor() { this.name = 'CLIMB'; this.color = '#88aaff'; this.hint = 'STAY ON SCREEN'; this.controls = ['up', 'left', 'right']; this.reset(); }
    reset() { this.px = 100; this.py = 150; this.vy = 0; this.gr = false; this.failed = false; this.plats = [{ x: 55, y: 168, w: 90 }]; this.t = 0; }
    update(dt, k, sp, on) {
        const m = 110 * sp; if (on) { if (k.left) this.px -= m * dt; if (k.right) this.px += m * dt; }
        this.px = cl(this.px, 8, S - 8);
        if (on && k.up && this.gr) { this.vy = -340; this.gr = false; }
        this.vy += 850 * dt; this.py += this.vy * dt;
        const rise = 75 * sp * dt;
        for (const p of this.plats) p.y -= rise; this.py -= rise;
        this.t -= dt; if (this.t <= 0) { this.plats.push({ x: rn(10, S - 60), y: S + 10, w: rn(35, 60) }); this.t = rn(0.4, 0.8) / sp; }
        this.plats = this.plats.filter(p => p.y > -25);
        this.gr = false;
        for (const p of this.plats) { if (this.vy > 0 && this.py + 7 >= p.y && this.py + 7 <= p.y + 10 && this.px >= p.x && this.px <= p.x + p.w) { this.py = p.y - 7; this.vy = 0; this.gr = true; } }
        if (this.py > S + 20 && on) this.failed = true; // fell off bottom
        if (this.py < 8 && on) this.failed = true; // smushed at top
        this.py = cl(this.py, 5, S + 25);
    }
    render(c) {
        c.fillStyle = this.color; for (const p of this.plats) c.fillRect(p.x, p.y, p.w, 6);
        c.beginPath(); c.arc(this.px, this.py, 7, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    }
}

// 19: JUMP — side-scrolling block jump, variable jump height + L/R
class Jump {
    constructor() { this.name = 'JUMP'; this.color = '#ffdd44'; this.hint = 'LEAP OVER OBSTACLES'; this.controls = ['up', 'left', 'right']; this.reset(); }
    reset() { this.px = 40; this.py = 173; this.vy = 0; this.failed = false; this.blocks = []; this.t = 0; }
    update(dt, k, sp, on) {
        if (on) { if (k.left) this.px -= 150 * sp * dt; if (k.right) this.px += 150 * sp * dt; }
        this.px = cl(this.px, 15, 120);
        if (on && k.up && this.py >= 173) this.vy = -380;
        const grav = (on && k.up && this.vy < 0) ? 600 : 1800;
        this.vy += grav * dt; this.py += this.vy * dt;
        if (this.py > 173) { this.py = 173; this.vy = 0; }
        this.t -= dt; if (this.t <= 0) { const w = rn(12, 22), h = rn(18, 30); this.blocks.push({ x: S + 10, w, h }); this.t = rn(0.7, 1.6) / sp; }
        for (const b of this.blocks) b.x -= 140 * sp * dt;
        this.blocks = this.blocks.filter(b => b.x > -40);
        if (on) for (const b of this.blocks) if (col(this.px - 7, this.py - 7, 14, 14, b.x, 180 - b.h, b.w, b.h)) this.failed = true;
    }
    render(c) {
        c.fillStyle = this.color + '40'; c.fillRect(0, 180, S, 20);
        c.strokeStyle = this.color; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 180); c.lineTo(S, 180); c.stroke();
        c.fillStyle = this.color; for (const b of this.blocks) c.fillRect(b.x, 180 - b.h, b.w, b.h);
        c.beginPath(); c.arc(this.px, this.py, 7, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    }
}

export const ALL_GAMES = [Turret, Trap, Flap, Path, WallCrush, Match, Pong, Highway, BouncingChaos, SafeZone, Gravity, LightChase, Asteroid, PulseRings, Laser, Shrink, Catch, Climb, Jump];
export function createAllGames(count = 16) { return [...ALL_GAMES].sort(() => Math.random() - .5).slice(0, count).map(G => new G()); }
export { S as GAME_SIZE };
