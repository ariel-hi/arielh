// ============================================
// Procedural Audio Engine — Web Audio API
// BPM synced to clock speed
// ============================================

export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.bpm = 120;
        this.enabled = true;
        this._beatTimer = 0;
        this._beatIndex = 0;
    }

    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3;
            this.masterGain.connect(this.ctx.destination);
        } catch (e) {
            this.enabled = false;
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    setBPM(clockSpeed) {
        this.bpm = 120 * clockSpeed;
    }

    // Call each frame with dt
    tick(dt) {
        if (!this.enabled || !this.ctx) return;
        const beatInterval = 60 / this.bpm;
        this._beatTimer += dt;
        if (this._beatTimer >= beatInterval) {
            this._beatTimer -= beatInterval;
            this._playBeat();
            this._beatIndex++;
        }
    }

    _playBeat() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const isKick = this._beatIndex % 4 === 0;
        const isHat = this._beatIndex % 2 === 0;

        if (isKick) {
            this._kick(t);
        } else if (isHat) {
            this._hat(t);
        } else {
            this._tick(t);
        }
    }

    _kick(t) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.08);
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(gain).connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.1);
    }

    _hat(t) {
        const bufferSize = this.ctx.sampleRate * 0.03;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 8000;
        src.connect(filter).connect(gain).connect(this.masterGain);
        src.start(t);
    }

    _tick(t) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.04, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
        osc.connect(gain).connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.02);
    }

    playSwitch() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(1200, t + 0.06);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(gain).connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.08);
    }

    playFail() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        for (let i = 0; i < 3; i++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = 100 - i * 20;
            gain.gain.setValueAtTime(0.25, t + i * 0.06);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.12);
            osc.connect(gain).connect(this.masterGain);
            osc.start(t + i * 0.06);
            osc.stop(t + i * 0.06 + 0.12);
        }
    }

    playGameOver() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const freqs = [440, 350, 260, 180, 100];
        freqs.forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = f;
            gain.gain.setValueAtTime(0.2, t + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.3);
            osc.connect(gain).connect(this.masterGain);
            osc.start(t + i * 0.15);
            osc.stop(t + i * 0.15 + 0.3);
        });
    }
}
