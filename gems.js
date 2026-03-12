/**
 * Star Cluster Blitz - ULTIMATE EDITION
 * Features: Special Gems (Nova/Pulsar), Cascading Combos, Floating Score, T/L Junction detection
 */

const CONFIG = {
    ROWS: 8,
    COLS: 8,
    BLITZ_TIME: 45,
    GOAL_SCORE: 2500,
    POINTS_PER_GEM: 150, // Slightly more juice
    GEMS: [
        { id: 'ruby', color: '#ff4d4d', svg: '<path d="M12 2L2 12l10 10 10-10z"/>' },
        { id: 'sapphire', color: '#4d94ff', svg: '<rect x="3" y="3" width="18" height="18" rx="4"/>' },
        { id: 'emerald', color: '#4dff88', svg: '<circle cx="12" cy="12" r="10"/>' },
        { id: 'topaz', color: '#ffdb4d', svg: '<path d="M12 2l3 7h7l-5.5 4.5 2 7.5-6.5-4.5-6.5 4.5 2-7.5L2 9h7z"/>' },
        { id: 'amethyst', color: '#d14dff', svg: '<path d="M12 2l10 18H2z"/>' },
        { id: 'stellar-core', color: '#ffffff', svg: '<rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><rect x="8" y="8" width="8" height="8" rx="1" fill="currentColor"/>' }
    ],
    TYPES: {
        NORMAL: 'normal',
        NOVA: 'nova',     // 4-match or Junction: Explodes 3x3
        PULSAR: 'pulsar', // 5-match: Wipes color
        CORE: 'core'     // Drop objective
    }
};

class GameState {
    constructor() {
        this.score = 0;
        this.timeLeft = CONFIG.BLITZ_TIME;
        this.combo = 0;
        this.maxCombo = 1;
        this.isProcessing = false;
        this.selectedGem = null;
        this.board = [];
        this.level = 1;
        this.xp = 0;
        this.gameActive = false;
        this.hyperdriveBonus = 1;
        this.loadProgression();
    }

    loadProgression() {
        const saved = JSON.parse(localStorage.getItem('star_cluster_save')) || { level: 1, xp: 0, highscore: 0 };
        this.level = saved.level || 1;
        this.xp = saved.xp || 0;
        this.highscore = saved.highscore || 0;
        this.updateProgressionUI();
    }

    saveProgression() {
        localStorage.setItem('star_cluster_save', JSON.stringify({
            level: this.level,
            xp: this.xp,
            highscore: Math.max(this.score, this.highscore)
        }));
    }

    updateProgressionUI() {
        const rankEl = document.getElementById('explorer-rank');
        const bestEl = document.getElementById('best-score');
        const xpEl = document.getElementById('xp-progress');
        const goalEl = document.getElementById('goal-value');

        if (rankEl) rankEl.textContent = `RANK ${this.level}`;
        if (bestEl) bestEl.textContent = this.highscore.toLocaleString();

        const xpNeeded = this.level * 1000;
        if (xpEl) xpEl.style.width = `${(this.xp / xpNeeded) * 100}%`;

        if (goalEl) {
            // Smoother scaling: 2500, 5000, 8500, 13000...
            const currentGoal = CONFIG.GOAL_SCORE + (this.level - 1) * 2500 + (Math.pow(this.level - 1, 2) * 1000);
            goalEl.textContent = currentGoal.toLocaleString();
        }
    }

    gainXP(amount) {
        this.xp += Math.floor(amount);
        const xpNeeded = this.level * 1000;
        if (this.xp >= xpNeeded) {
            this.xp -= xpNeeded;
            this.level++;
            this.addLogEntry(`PROMOTED TO RANK ${this.level}!`, 'warning');
        }
        this.updateProgressionUI();
    }

    addLogEntry(text, type = 'info') {
        const log = document.getElementById('log-entries');
        if (!log) return;
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        const time = new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' });
        entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-msg">${text}</span>`;
        log.prepend(entry);
        if (log.children.length > 8) log.lastElementChild.remove();
        if (log.querySelector('.empty')) log.querySelector('.empty').remove();
    }
}

const State = new GameState();

function initBoard() {
    const boardEl = document.getElementById('game-board');
    if (!boardEl) return;
    boardEl.innerHTML = '';
    State.board = [];

    for (let r = 0; r < CONFIG.ROWS; r++) {
        State.board[r] = [];
        for (let c = 0; c < CONFIG.COLS; c++) {
            let gemType;
            do {
                gemType = CONFIG.GEMS[Math.floor(Math.random() * (CONFIG.GEMS.length - 1))];
            } while (
                (c >= 2 && State.board[r][c - 1].color === gemType.color && State.board[r][c - 2].color === gemType.color) ||
                (r >= 2 && State.board[r - 1][c].color === gemType.color && State.board[r - 2][c].color === gemType.color)
            );

            const isCore = Math.random() < 0.03; // Rare core spawn
            if (isCore) {
                const coreData = CONFIG.GEMS.find(g => g.id === 'stellar-core');
                State.board[r][c] = { ...coreData, r, c, type: CONFIG.TYPES.CORE };
            } else {
                State.board[r][c] = { ...gemType, r, c, type: CONFIG.TYPES.NORMAL };
            }
            renderGem(r, c);
        }
    }
}

function renderGem(r, c) {
    const gem = State.board[r][c];
    const boardEl = document.getElementById('game-board');
    const div = document.createElement('div');
    div.className = `gem gem-${gem.type}`;
    div.dataset.r = r;
    div.dataset.c = c;
    div.dataset.id = gem.id;

    let innerContent = `<svg viewBox="0 0 24 24" fill="currentColor">${gem.svg}</svg>`;
    if (gem.type === CONFIG.TYPES.NOVA) innerContent += `<div class="nova-aura"></div>`;
    if (gem.type === CONFIG.TYPES.PULSAR) innerContent += `<div class="pulsar-shimmer"></div>`;

    div.innerHTML = `<div class="gem-inner" style="color: ${gem.color}">${innerContent}</div>`;
    div.style.gridRow = r + 1;
    div.style.gridColumn = c + 1;
    div.onclick = () => handleGemClick(r, c);
    boardEl.appendChild(div);
}

async function handleGemClick(r, c) {
    if (State.isProcessing) return; // Allow interaction right up to 0s
    if (!State.gameActive && State.timeLeft > -2) return; // Tiny grace period for final moves

    const clickedEl = document.querySelector(`.gem[data-r="${r}"][data-c="${c}"]`);
    if (!clickedEl) return;

    if (!State.selectedGem) {
        State.selectedGem = { r, c };
        clickedEl.classList.add('selected');
    } else {
        const prev = State.selectedGem;
        const prevEl = document.querySelector(`.gem[data-r="${prev.r}"][data-c="${prev.c}"]`);
        const prevGem = State.board[prev.r][prev.c];
        const currentGem = State.board[r][c];

        if (isAdjacent(prev.r, prev.c, r, c)) {
            if (prevEl) prevEl.classList.remove('selected');

            // Allow manual swap for Cores AND Special Power-ups
            const isSpecial = prevGem.type !== CONFIG.TYPES.NORMAL || currentGem.type !== CONFIG.TYPES.NORMAL;
            await swapGems(prev.r, prev.c, r, c, isSpecial);
            State.selectedGem = null;
        } else {
            if (prevEl) prevEl.classList.remove('selected');
            State.selectedGem = { r, c };
            clickedEl.classList.add('selected');
        }
    }
}

function isAdjacent(r1, c1, r2, c2) {
    return (Math.abs(r1 - r2) === 1 && c1 === c2) || (Math.abs(c1 - c2) === 1 && r1 === r2);
}

function isLine(gems) {
    const allSameRow = gems.every(g => g.r === gems[0].r);
    const allSameCol = gems.every(g => g.c === gems[0].c);
    return allSameRow || allSameCol;
}

async function swapGems(r1, c1, r2, c2, force = false) {
    State.isProcessing = true;
    const el1 = document.querySelector(`.gem[data-r="${r1}"][data-c="${c1}"]`);
    const el2 = document.querySelector(`.gem[data-r="${r2}"][data-c="${c2}"]`);

    if (!el1 || !el2) {
        State.isProcessing = false;
        return;
    }

    const dx = (c2 - c1) * 100;
    const dy = (r2 - r1) * 100;

    el1.style.zIndex = '100';
    el2.style.zIndex = '100';
    el1.style.transition = 'transform 0.15s cubic-bezier(0.1, 0, 0.2, 1)';
    el2.style.transition = 'transform 0.15s cubic-bezier(0.1, 0, 0.2, 1)';
    el1.style.transform = `translate(${dx}%, ${dy}%)`;
    el2.style.transform = `translate(${-dx}%, ${-dy}%)`;

    await new Promise(res => setTimeout(res, 160));

    // Logic Swap
    const temp = State.board[r1][c1];
    State.board[r1][c1] = State.board[r2][c2];
    State.board[r2][c2] = temp;
    State.board[r1][c1].r = r1; State.board[r1][c1].c = c1;
    State.board[r2][c2].r = r2; State.board[r2][c2].c = c2;

    const matches = findMatches();
    if (matches.length > 0 || force) {
        updateBoardElements();

        // If it was a manual special swap WITHOUT natural matches, trigger the power manually
        if (matches.length === 0 && force) {
            const g1 = State.board[r1][c1];
            const g2 = State.board[r2][c2];

            if (g1.type === CONFIG.TYPES.CORE || g2.type === CONFIG.TYPES.CORE) {
                await checkCoreDrops();
            } else {
                // Manually trigger power
                await triggerManualPower(r1, c1, r2, c2);
            }
        } else {
            await processMatches(matches);
        }
    } else {
        // Undo swap
        el1.style.transform = 'translate(0, 0)';
        el2.style.transform = 'translate(0, 0)';
        await new Promise(res => setTimeout(res, 150));
        const temp2 = State.board[r1][c1];
        State.board[r1][c1] = State.board[r2][c2];
        State.board[r2][c2] = temp2;
        State.board[r1][c1].r = r1; State.board[r1][c1].c = c1;
        State.board[r2][c2].r = r2; State.board[r2][c2].c = c2;
    }

    el1.style.zIndex = '';
    el2.style.zIndex = '';
    el1.style.transform = '';
    el2.style.transform = '';
    State.isProcessing = false;
}

function updateBoardElements() {
    const boardEl = document.getElementById('game-board');
    if (!boardEl) return;
    boardEl.innerHTML = '';
    for (let r = 0; r < CONFIG.ROWS; r++) {
        for (let c = 0; c < CONFIG.COLS; c++) {
            renderGem(r, c);
        }
    }
}

async function triggerManualPower(r1, c1, r2, c2) {
    const g1 = State.board[r1][c1];
    const g2 = State.board[r2][c2];

    let specialMatch = { gems: [], id: 'manual' };

    // Combo: Nova + Nova / Nova + Pulsar?
    if (g1.type !== CONFIG.TYPES.NORMAL && g2.type !== CONFIG.TYPES.NORMAL && g1.type !== CONFIG.TYPES.CORE && g2.type !== CONFIG.TYPES.CORE) {
        State.addLogEntry("MEGA-DETONATION INITIATED!", "warning");
        for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
                const nr = r2 + dr, nc = r2 + dc;
                if (nr >= 0 && nr < CONFIG.ROWS && nc >= 0 && nc < CONFIG.COLS) specialMatch.gems.push({ r: nr, c: nc });
            }
        }
    } else {
        const special = g1.type !== CONFIG.TYPES.NORMAL && g1.type !== CONFIG.TYPES.CORE ? g1 : g2;
        const target = g1.type !== CONFIG.TYPES.NORMAL && g1.type !== CONFIG.TYPES.CORE ? g2 : g1;

        if (special.type === CONFIG.TYPES.NOVA) {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = special.r + dr, nc = special.c + dc;
                    if (nr >= 0 && nr < CONFIG.ROWS && nc >= 0 && nc < CONFIG.COLS) specialMatch.gems.push({ r: nr, c: nc });
                }
            }
        } else if (special.type === CONFIG.TYPES.PULSAR) {
            for (let r = 0; r < CONFIG.ROWS; r++) {
                for (let c = 0; c < CONFIG.COLS; c++) {
                    if (State.board[r][c].color === target.color) specialMatch.gems.push({ r, c });
                }
            }
        }
    }

    if (specialMatch.gems.length > 0) {
        await processMatches([specialMatch]);
    }
}

function findMatches() {
    let matches = [];
    // Horizontal
    for (let r = 0; r < CONFIG.ROWS; r++) {
        for (let c = 0; c < CONFIG.COLS - 2; c++) {
            const color = State.board[r][c].color;
            if (color && State.board[r][c + 1].color === color && State.board[r][c + 2].color === color) {
                let match = { gems: [{ r, c }, { r, c: c + 1 }, { r, c: c + 2 }], color };
                let k = c + 3;
                while (k < CONFIG.COLS && State.board[r][k].color === color) {
                    match.gems.push({ r, c: k });
                    k++;
                }
                matches.push(match);
                c = k - 1;
            }
        }
    }
    // Vertical
    for (let c = 0; c < CONFIG.COLS; c++) {
        for (let r = 0; r < CONFIG.ROWS - 2; r++) {
            const color = State.board[r][c].color;
            if (color && State.board[r + 1][c].color === color && State.board[r + 2][c].color === color) {
                let match = { gems: [{ r, c }, { r: r + 1, c }, { r: r + 2, c }], color };
                let k = r + 3;
                while (k < CONFIG.ROWS && State.board[k][c].color === color) {
                    match.gems.push({ r: k, c });
                    k++;
                }
                matches.push(match);
                r = k - 1;
            }
        }
    }

    // Combine matches for junctions (T or L)
    let combined = [];
    let usedGems = new Set();

    matches.forEach((m1, i) => {
        if (usedGems.has(i)) return;
        usedGems.add(i); // Mark m1 as used
        let junction = [...m1.gems];
        matches.forEach((m2, j) => {
            if (i === j || usedGems.has(j) || m1.color !== m2.color) return;
            // Check if they share a gem
            const intersect = m1.gems.filter(g1 => m2.gems.some(g2 => g1.r === g2.r && g1.c === g2.c));
            if (intersect.length > 0) {
                junction = junction.concat(m2.gems.filter(g2 => !m1.gems.some(g1 => g1.r === g2.r && g1.c === g2.c)));
                usedGems.add(j);
            }
        });
        combined.push({ gems: junction, color: m1.color });
    });

    return combined;
}

async function processMatches(matches) {
    while (matches.length > 0) {
        let clearedGems = new Set();
        let newSpecials = [];

        matches.forEach(match => {
            const count = match.gems.length;
            const center = match.gems[Math.floor(count / 2)];

            // Special creation logic
            if (count >= 5) {
                newSpecials.push({ r: center.r, c: center.c, color: match.color, type: CONFIG.TYPES.PULSAR });
                State.addLogEntry("PULSAR GEM FORMED!", "success");
            } else if (count === 4 || (match.gems.length > 3 && !isLine(match.gems))) { // 4-match or junction
                newSpecials.push({ r: center.r, c: center.c, color: match.color, type: CONFIG.TYPES.NOVA });
                State.addLogEntry("NOVA GEM FORMED!", "warning");
            }

            match.gems.forEach(g => {
                const gem = State.board[g.r][g.c];
                if (gem.type === CONFIG.TYPES.NOVA) {
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            const nr = g.r + dr, nc = g.c + dc;
                            if (nr >= 0 && nr < CONFIG.ROWS && nc >= 0 && nc < CONFIG.COLS) clearedGems.add(`${nr},${nc}`);
                        }
                    }
                } else if (gem.type === CONFIG.TYPES.PULSAR) {
                    for (let r = 0; r < CONFIG.ROWS; r++) {
                        for (let c = 0; c < CONFIG.COLS; c++) {
                            if (State.board[r][c].color === gem.color) clearedGems.add(`${r},${c}`);
                        }
                    }
                }
                clearedGems.add(`${g.r},${g.c}`);
            });
        });

        const flat = [...clearedGems];
        State.combo += matches.length;
        State.maxCombo = Math.max(State.maxCombo, State.combo);

        const basePoints = flat.length * CONFIG.POINTS_PER_GEM;
        const rankBonus = (State.level - 1) * 100; // Buffed rank bonus
        const totalPoints = Math.floor((basePoints + rankBonus) * State.hyperdriveBonus);

        State.score += totalPoints;
        updateScoreUI();
        State.gainXP(totalPoints / 8); // Slightly faster XP
        showFloatingScore(flat[0], totalPoints);

        flat.forEach(coords => {
            const [r, c] = coords.split(',').map(Number);
            const el = document.querySelector(`.gem[data-r="${r}"][data-c="${c}"]`);
            if (el) el.classList.add('matching');
            // Clear all properties to prevent re-matching empty space
            State.board[r][c].id = 'empty';
            State.board[r][c].color = null;
            State.board[r][c].type = CONFIG.TYPES.NORMAL;
        });

        await new Promise(res => setTimeout(res, 300));

        // Inject new specials
        newSpecials.forEach(s => {
            const gemData = CONFIG.GEMS.find(g => g.color === s.color);
            State.board[s.r][s.c] = { ...gemData, r: s.r, c: s.c, type: s.type };
        });

        await applyGravity();
        await checkCoreDrops();
        matches = findMatches();
    }
}

async function checkCoreDrops() {
    let dropped = false;
    for (let c = 0; c < CONFIG.COLS; c++) {
        const bottomGem = State.board[CONFIG.ROWS - 1][c];
        if (bottomGem.type === CONFIG.TYPES.CORE) {
            const el = document.querySelector(`.gem[data-r="${CONFIG.ROWS - 1}"][data-c="${c}"]`);
            if (el) el.classList.add('matching');

            const bonus = 2500 + (State.level - 1) * 500;
            State.score += bonus;
            updateScoreUI(); // Added missing UI update
            State.gainXP(250);
            State.addLogEntry("STELLAR CORE STABILIZED! +2,500 ENERGY", "success");
            showFloatingScore(`${CONFIG.ROWS - 1},${c}`, bonus);

            State.board[CONFIG.ROWS - 1][c].id = 'empty';
            State.board[CONFIG.ROWS - 1][c].color = null;
            State.board[CONFIG.ROWS - 1][c].type = CONFIG.TYPES.NORMAL;
            dropped = true;
        }
    }
    if (dropped) {
        await new Promise(res => setTimeout(res, 300));
        await applyGravity();
    }
}

async function applyGravity() {
    for (let c = 0; c < CONFIG.COLS; c++) {
        let emptyCount = 0;
        for (let r = CONFIG.ROWS - 1; r >= 0; r--) {
            if (State.board[r][c].id === 'empty') {
                emptyCount++;
            } else if (emptyCount > 0) {
                State.board[r + emptyCount][c] = State.board[r][c];
                State.board[r + emptyCount][c].r = r + emptyCount;
                State.board[r][c] = { id: 'empty', r, c };
            }
        }
        for (let r = 0; r < emptyCount; r++) {
            const gemType = CONFIG.GEMS[Math.floor(Math.random() * (CONFIG.GEMS.length - 1))];
            State.board[r][c] = { ...gemType, r, c, type: CONFIG.TYPES.NORMAL };
        }
    }
    updateBoardElements();
    await new Promise(res => setTimeout(res, 200));
}

function showFloatingScore(coords, points) {
    if (!coords) return;
    const [r, c] = coords.split(',').map(Number);
    const board = document.querySelector('.board-container');
    const float = document.createElement('div');
    float.className = 'floating-score';
    float.textContent = `+${points.toLocaleString()}`;
    float.style.left = `${(c / CONFIG.COLS) * 100}%`;
    float.style.top = `${(r / CONFIG.ROWS) * 100}%`;
    board.appendChild(float);
    setTimeout(() => float.remove(), 1000);
}

function updateScoreUI() {
    const scoreVal = document.getElementById('score-value');
    if (scoreVal) scoreVal.textContent = State.score.toLocaleString();

    const comboFill = document.getElementById('combo-fill');
    if (comboFill) {
        const progress = Math.min((State.combo / 12) * 100, 100); // 12 instead of 18 for faster entry
        comboFill.style.width = `${progress}%`;

        if (progress >= 100 && State.hyperdriveBonus === 1) {
            State.hyperdriveBonus = 3.0;
            State.addLogEntry("HYPERDRIVE ENGAGED: 3.0x ENERGY!", 'warning');
            document.querySelector('.combo-meter')?.classList.add('active');
        }
    }
}

let timerInterval;
let hyperDecay;

async function startGame() {
    State.score = 0;
    State.timeLeft = CONFIG.BLITZ_TIME;
    State.combo = 0;
    State.maxCombo = 1;
    State.hyperdriveBonus = 1;
    State.gameActive = true;

    // Mission Launch Transition
    const overlay = document.getElementById('start-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }

    document.getElementById('game-over-overlay')?.classList.add('hidden');
    document.querySelector('.combo-meter')?.classList.remove('active');

    document.getElementById('game-container')?.classList.add('active-game');

    initBoard();
    updateScoreUI();
    State.addLogEntry("INITIATING LAUNCH SEQUENCE...", "warning");
    State.addLogEntry("STELLAR CORES DETECTED. DROP TO BOTTOM REGION.", "info");
    State.addLogEntry("TACTICAL POWER: SWAP NOVA/PULSAR TO TRIGGER.", "info");
    State.addLogEntry("SYSTEMS ONLINE. MISSION START.", 'success');

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        State.timeLeft--;
        const timerEl = document.getElementById('time-left');
        if (timerEl) {
            timerEl.textContent = `${State.timeLeft}s`;
            if (State.timeLeft <= 10) timerEl.classList.add('critical');
            else timerEl.classList.remove('critical');
        }
        if (State.timeLeft <= 0) endGame();
    }, 1000);

    if (hyperDecay) clearInterval(hyperDecay);
    hyperDecay = setInterval(() => {
        if (State.combo > 0) {
            State.combo -= 0.1; // Slower decay for more sustain
            updateScoreUI();
            const progress = (State.combo / 12) * 100;
            if (progress < 100 && State.hyperdriveBonus > 1) {
                State.hyperdriveBonus = 1;
                State.addLogEntry("HYPERDRIVE DISENGAGED", 'info');
                document.querySelector('.combo-meter')?.classList.remove('active');
            }
        }
    }, 100);
}

function endGame() {
    const currentGoal = CONFIG.GOAL_SCORE + (State.level - 1) * 2500;
    const success = State.score >= currentGoal;

    State.gameActive = false;
    clearInterval(timerInterval);
    clearInterval(hyperDecay);

    if (success) {
        State.saveProgression();
        const statusEl = document.getElementById('mission-status');
        if (statusEl) {
            statusEl.textContent = "MISSION COMPLETE";
            statusEl.className = 'status-success';
        }
        State.addLogEntry("GOAL REACHED", 'success');
    } else {
        const statusEl = document.getElementById('mission-status');
        if (statusEl) {
            statusEl.textContent = "MISSION FAILED";
            statusEl.className = 'status-failed';
        }
        State.addLogEntry("FAILURE: LOW ENERGY", 'error');
    }

    document.getElementById('final-score').textContent = State.score.toLocaleString();
    document.getElementById('xp-gained').textContent = `+${Math.floor(State.score / 10)} XP`;
    document.getElementById('max-combo').textContent = `${Math.floor(State.maxCombo)}x`;
    document.getElementById('game-over-overlay')?.classList.remove('hidden');
}

function initBackground() {
    const canvas = document.getElementById('nebula-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let stars = [];
    const resize = () => { if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; } };
    window.addEventListener('resize', resize);
    resize();
    for (let i = 0; i < 200; i++) stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, size: Math.random() * 2, speed: Math.random() * 0.2 + 0.05 });
    const animate = () => {
        if (!ctx) return;
        ctx.fillStyle = '#050510'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff'; stars.forEach(s => { ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill(); s.y += s.speed; if (s.y > canvas.height) s.y = -s.size; });
        requestAnimationFrame(animate);
    };
    animate();
}

document.addEventListener('DOMContentLoaded', () => {
    initBackground();
    initBoard();
    const startBtn = document.getElementById('start-btn');
    const playAgainBtn = document.getElementById('play-again-btn');
    const restartBtn = document.getElementById('restart-btn');
    if (startBtn) startBtn.onclick = startGame;
    if (playAgainBtn) playAgainBtn.onclick = startGame;
    if (restartBtn) restartBtn.onclick = endGame;
});
