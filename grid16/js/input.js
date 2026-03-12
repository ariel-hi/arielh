// ============================================
// Input Manager — Keyboard + Touch D-Pad
// ============================================

export class InputManager {
  constructor() {
    this.keys = { up: false, down: false, left: false, right: false };
    this._touchIds = {}; // trackingId -> direction
    this._init();
  }

  _init() {
    // Keyboard
    window.addEventListener('keydown', e => this._onKey(e, true));
    window.addEventListener('keyup', e => this._onKey(e, false));

    // D-Pad touch
    const dpad = document.getElementById('dpad');
    if (!dpad) return;

    // Show d-pad on touch devices
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      dpad.classList.remove('hidden');
    }

    const btns = dpad.querySelectorAll('.dpad-btn');
    btns.forEach(btn => {
      const dir = btn.dataset.dir;

      btn.addEventListener('touchstart', e => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
          this._touchIds[touch.identifier] = dir;
        }
        this.keys[dir] = true;
        btn.classList.add('active');
      }, { passive: false });

      btn.addEventListener('touchend', e => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
          delete this._touchIds[touch.identifier];
        }
        // Only release if no other touch is pressing this direction
        const stillPressed = Object.values(this._touchIds).includes(dir);
        if (!stillPressed) {
          this.keys[dir] = false;
          btn.classList.remove('active');
        }
      }, { passive: false });

      btn.addEventListener('touchcancel', e => {
        for (const touch of e.changedTouches) {
          delete this._touchIds[touch.identifier];
        }
        this.keys[dir] = false;
        btn.classList.remove('active');
      }, { passive: false });

      // Mouse fallback for desktop testing
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        this.keys[dir] = true;
        btn.classList.add('active');
      });
      btn.addEventListener('mouseup', e => {
        this.keys[dir] = false;
        btn.classList.remove('active');
      });
      btn.addEventListener('mouseleave', e => {
        this.keys[dir] = false;
        btn.classList.remove('active');
      });
    });

    // Prevent default touch on canvas to avoid scroll
    document.getElementById('game-canvas')?.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    document.getElementById('game-canvas')?.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  }

  _onKey(e, down) {
    const map = {
      'ArrowUp': 'up', 'ArrowDown': 'down',
      'ArrowLeft': 'left', 'ArrowRight': 'right',
      'w': 'up', 's': 'down', 'a': 'left', 'd': 'right',
      'W': 'up', 'S': 'down', 'A': 'left', 'D': 'right',
    };
    const dir = map[e.key];
    if (dir) {
      e.preventDefault();
      this.keys[dir] = down;
    }
  }

  reset() {
    this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
  }
}
