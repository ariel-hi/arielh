/**
 * Star Cluster Blitz
 * A premium space-themed match-3 game with persistent progression.
 */

const CONFIG = {
    ROWS: 8,
    COLS: 8,
    BLITZ_TIME: 45, // Shorter rounds
    XP_PER_MATCH: 10,
    XP_MULTIPLIER_COMBO: 1.5,
    GOAL_SCORE: 5000, // Mission goal
    GEMS: [
        { id: 'ruby', color: '#ff4d4d', svg: '<path d="M12 2L2 12l10 10 10-10z"/>' },
        { id: 'sapphire', color: '#4d94ff', svg: '<rect x="3" y="3" width="18" height="18" rx="4"/>' },
        { id: 'emerald', color: '#4dff88', svg: '<circle cx="12" cy="12" r="10"/>' },
        { id: 'topaz', color: '#ffdb4d', svg: '<path d="M12 2l3 7h7l-5.5 4.5 2 7.5-6.5-4.5-6.5 4.5 2-7.5L2 9h7z"/>' },
        { id: 'amethyst', color: '#d14dff', svg: '<path d="M12 2l10 18H2z"/>' },
        { id: 'pulsar', color: '#ffffff', svg: '<circle cx="12" cy="12" r="6"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4" stroke="currentColor" stroke-width="2"/>' }
    ]
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
        this.level = saved.level;
        this.xp = saved.xp;
        this.highscore = saved.highscore;
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
        document.getElementById('explorer-rank').textContent = `RANK ${this.level}`;
        document.getElementById('best-score').textContent = this.highscore.toLocaleString();
        const xpNeeded = this.level * 1000;
        document.getElementById('xp-progress').style.width = `${(this.xp / xpNeeded) * 100}%`;

        // Update goal based on level
        const currentGoal = CONFIG.GOAL_SCORE + (this.level - 1) * 2500;
        document.getElementById('goal-value').textContent = currentGoal.toLocaleString();
    }

    gainXP(amount) {
        this.xp += amount;
        const xpNeeded = this.level * 1000;
        if (this.xp >= xpNeeded) {
            this.xp -= xpNeeded;
            this.level++;
            this.addLogEntry(`PROMOTED TO RANK ${this.level}!`, 'success');
        }
        this.updateProgressionUI();
    }

    addLogEntry(text, type = 'info') {
        const log = document.getElementById('log-entries');
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerHTML = `<span class="log-time">[${new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })}]</span> <span class="log-msg">${text}</span>`;
        log.prepend(entry);
        if (log.children.length > 8) log.lastElementChild.remove();
        if (log.querySelector('.empty')) log.querySelector('.empty').remove();
    }
}

const State = new GameState();

// --- Core Game Logic ---

function initBoard() {
    const boardEl = document.getElementById('game-board');
    boardEl.innerHTML = '';
    State.board = [];

    for (let r = 0; r < CONFIG.ROWS; r++) {
        State.board[r] = [];
        for (let c = 0; c < CONFIG.COLS; c++) {
            let gemType;
            do {
                gemType = CONFIG.GEMS[Math.floor(Math.random() * (CONFIG.GEMS.length - 1))];
            } while (
                (c >= 2 && State.board[r][c - 1].id === gemType.id && State.board[r][c - 2].id === gemType.id) ||
                (r >= 2 && State.board[r - 1][c].id === gemType.id && State.board[r - 2][c].id === gemType.id)
            );

            State.board[r][c] = { ...gemType, r, c };
            renderGem(r, c);
        }
    }
}

function renderGem(r, c) {
    const gem = State.board[r][c];
    const boardEl = document.getElementById('game-board');
    const div = document.createElement('div');
    div.className = 'gem';
    div.dataset.r = r;
    div.dataset.c = c;
    div.innerHTML = `
        <div class="gem-inner" style="background: ${gem.color}20; color: ${gem.color}">
            <svg viewBox="0 0 24 24" fill="currentColor">${gem.svg}</svg>
        </div>
    `;
    div.style.gridRow = r + 1;
    div.style.gridColumn = c + 1;
    div.onclick = () => handleGemClick(r, c);
    boardEl.appendChild(div);
}

async function handleGemClick(r, c) {
    if (State.isProcessing || !State.gameActive) return;

    const clickedEl = document.querySelector(`.gem[data-r="${r}"][data-c="${c}"]`);

    if (!State.selectedGem) {
        State.selectedGem = { r, c };
        clickedEl.classList.add('selected');
    } else {
        const prev = State.selectedGem;
        const prevEl = document.querySelector(`.gem[data-r="${prev.r}"][data-c="${prev.c}"]`);

        if (isAdjacent(prev.r, prev.c, r, c)) {
            prevEl.classList.remove('selected');
            await swapGems(prev.r, prev.c, r, c);
            State.selectedGem = null;
        } else {
            prevEl.classList.remove('selected');
            State.selectedGem = { r, c };
            clickedEl.classList.add('selected');
        }
    }
}

function isAdjacent(r1, c1, r2, c2) {
    return (Math.abs(r1 - r2) === 1 && c1 === c2) || (Math.abs(c1 - c2) === 1 && r1 === r2);
}

async function swapGems(r1, c1, r2, c2) {
    State.isProcessing = true;
    const el1 = document.querySelector(`.gem[data-r="${r1}"][data-c="${c1}"]`);
    const el2 = document.querySelector(`.gem[data-r="${r2}"][data-c="${c2}"]`);

    const dx = (c2 - c1) * 100;
    const dy = (r2 - r1) * 100;

    // Visual swap
    el1.style.zIndex = '100';
    el2.style.zIndex = '100';
    el1.style.transition = 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
    el2.style.transition = 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
    el1.style.transform = `translate(${dx}%, ${dy}%)`;
    el2.style.transform = `translate(${-dx}%, ${-dy}%)`;

    await new Promise(res => setTimeout(res, 150));

    // Logic Swap
    const temp = State.board[r1][c1];
    State.board[r1][c1] = State.board[r2][c2];
    State.board[r2][c2] = temp;
    State.board[r1][c1].r = r1; State.board[r1][c1].c = c1;
    State.board[r2][c2].r = r2; State.board[r2][c2].c = c2;

    const matches = findMatches();
    if (matches.length > 0) {
        // Fast UI refresh before processing matches
        updateBoardElements();
        await processMatches(matches);
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
    State.isProcessing = false;
}

function updateBoardElements() {
    // Instead of full innerHTML wipe, we just update the specific gems' positions and properties
    const gems = document.querySelectorAll('.gem');
    gems.forEach(el => {
        const r = parseInt(el.dataset.r);
        const c = parseInt(el.dataset.c);
        const gem = State.board[r][c];

        // Reset transform
        el.style.transform = 'translate(0, 0)';
        el.style.transition = 'none';

        // If content changed (only happens after gravity)
        if (el.dataset.id !== gem.id) {
            // Re-render internal
            el.innerHTML = `
                <div class="gem-inner" style="background: ${gem.color}20; color: ${gem.color}">
                    <svg viewBox="0 0 24 24" fill="currentColor">${gem.svg}</svg>
                </div>
            `;
            el.dataset.id = gem.id;
        }
    });
}

function findMatches() {
    let matches = [];
    // Horizontal
    for (let r = 0; r < CONFIG.ROWS; r++) {
        for (let c = 0; c < CONFIG.COLS - 2; c++) {
            const id = State.board[r][c].id;
            if (id !== 'empty' && State.board[r][c + 1].id === id && State.board[r][c + 2].id === id) {
                let match = [{ r, c }, { r, c: c + 1 }, { r, c: c + 2 }];
                let k = c + 3;
                while (k < CONFIG.COLS && State.board[r][k].id === id) {
                    match.push({ r, c: k });
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
            const id = State.board[r][c].id;
            if (id !== 'empty' && State.board[r + 1][c].id === id && State.board[r + 2][c].id === id) {
                let match = [{ r, c }, { r: r + 1, c }, { r: r + 2, c }];
                let k = r + 3;
                while (k < CONFIG.ROWS && State.board[k][c].id === id) {
                    match.push({ r: k, c });
                    k++;
                }
                matches.push(match);
                r = k - 1;
            }
        }
    }
    return matches;
}

async function processMatches(matches) {
    while (matches.length > 0) {
        const flat = [...new Set(matches.flat().map(m => `${m.r},${m.c}`))];
        State.combo += matches.length;
        State.maxCombo = Math.max(State.maxCombo, State.combo);

        const basePoints = flat.length * 100;
        const rankBonus = (State.level - 1) * 50; // Advantage of ranking up: More points per match
        const totalPoints = Math.floor((basePoints + rankBonus) * State.hyperdriveBonus);

        updateScore(totalPoints);
        State.gainXP(Math.floor(totalPoints / 10));

        // Visual match
        flat.forEach(coords => {
            const [r, c] = coords.split(',').map(Number);
            const el = document.querySelector(`.gem[data-r="${r}"][data-c="${c}"]`);
            if (el) el.classList.add('matching');
            State.board[r][c].id = 'empty';
        });

        await new Promise(res => setTimeout(res, 250));
        await applyGravity();

        matches = findMatches();
    }

    // Reset combo slowly if no more matches in this move
    // Removed immediate reset to make building hyperdrive feel better
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
            State.board[r][c] = { ...gemType, r, c };
        }
    }
    refreshBoard(); // Temporary full refresh during gravity for stability
    await new Promise(res => setTimeout(res, 250));
}

function refreshBoard() {
    const boardEl = document.getElementById('game-board');
    boardEl.innerHTML = '';
    for (let r = 0; r < CONFIG.ROWS; r++) {
        for (let c = 0; c < CONFIG.COLS; c++) {
            renderGem(r, c);
        }
    }
}

function updateScore(points) {
    State.score += points;
    document.getElementById('score-value').textContent = State.score.toLocaleString();

    // Hyperdrive buildup
    State.combo += 1;
    const progress = Math.min((State.combo / 20) * 100, 100);
    document.getElementById('combo-fill').style.width = `${progress}%`;

    if (progress >= 100 && State.hyperdriveBonus === 1) {
        State.hyperdriveBonus = 2; // Advantage of ranking/skill: Higher multiplier
        State.addLogEntry("HYPERDRIVE ENGAGED: 2x SCORE!", 'warning');
        document.querySelector('.combo-meter').classList.add('active');
    }
}

// --- Game Loop ---

let timerInterval;
let hyperdriveDecay;

function startGame() {
    State.score = 0;
    State.timeLeft = CONFIG.BLITZ_TIME;
    State.combo = 0;
    State.hyperdriveBonus = 1;
    State.gameActive = true;
    State.addLogEntry("MISSION START: COLLECT STELLAR ENERGY", 'info');

    document.getElementById('start-overlay').classList.add('hidden');
    document.getElementById('game-over-overlay').classList.add('hidden');
    document.getElementById('score-value').textContent = '0';
    document.querySelector('.combo-meter').classList.remove('active');

    initBoard();

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        State.timeLeft--;
        document.getElementById('time-left').textContent = `${State.timeLeft}s`;

        if (State.timeLeft <= 10) {
            document.getElementById('time-left').classList.add('critical');
        }

        if (State.timeLeft <= 0) {
            endGame();
        }
    }, 1000);

    // Slower Hyperdrive decay
    if (hyperdriveDecay) clearInterval(hyperdriveDecay);
    hyperdriveDecay = setInterval(() => {
        if (State.combo > 0) {
            State.combo -= 0.5;
            const progress = Math.min((State.combo / 20) * 100, 100);
            document.getElementById('combo-fill').style.width = `${progress}%`;

            if (progress < 100 && State.hyperdriveBonus === 2) {
                State.hyperdriveBonus = 1;
                State.addLogEntry("HYPERDRIVE DISENGAGED", 'info');
                document.querySelector('.combo-meter').classList.remove('active');
            }
        }
    }, 100);
}

function endGame() {
    const currentGoal = CONFIG.GOAL_SCORE + (State.level - 1) * 2500;
    const success = State.score >= currentGoal;

    State.gameActive = false;
    clearInterval(timerInterval);
    clearInterval(hyperdriveDecay);

    if (success) {
        State.saveProgression();
        document.getElementById('mission-status').textContent = "MISSION COMPLETE";
        document.getElementById('mission-status').className = 'status-success';
        State.addLogEntry("GOAL REACHED: RETURNING TO BASE", 'success');
    } else {
        document.getElementById('mission-status').textContent = "MISSION FAILED";
        document.getElementById('mission-status').className = 'status-failed';
        State.addLogEntry("FAILURE: INSUFFICIENT ENERGY", 'error');
    }

    document.getElementById('final-score').textContent = State.score.toLocaleString();
    document.getElementById('xp-gained').textContent = `+${Math.floor(State.score / 10)} XP`;
    document.getElementById('max-combo').textContent = `${Math.floor(State.maxCombo)}x`;

    document.getElementById('game-over-overlay').classList.remove('hidden');
}

// --- Background ---
function initBackground() {
    const canvas = document.getElementById('nebula-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let stars = [];

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    for (let i = 0; i < 200; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 2,
            speed: Math.random() * 0.2 + 0.05
        });
    }

    function animate() {
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        stars.forEach(star => {
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            ctx.fill();
            star.y += star.speed;
            if (star.y > canvas.height) star.y = -star.size;
        });
        requestAnimationFrame(animate);
    }
    animate();
}

// --- Init ---
window.onload = () => {
    initBackground();
    document.getElementById('start-btn').onclick = startGame;
    document.getElementById('play-again-btn').onclick = startGame;
    document.getElementById('restart-btn').onclick = endGame;
};
