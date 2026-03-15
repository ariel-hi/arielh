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

    const resetDpadSignals = () => {
      this.keys.up = false;
      this.keys.down = false;
      this.keys.left = false;
      this.keys.right = false;
      dpad.querySelectorAll('.dpad-btn').forEach(b => b.classList.remove('active'));
    };

    const handleDpadTouch = (e) => {
      e.preventDefault();
      const rect = dpad.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // Reset all before calculating
      resetDpadSignals();

      if (e.type === 'touchend' || e.type === 'touchcancel') {
        if (e.touches.length > 0) {
          // If there are still touches, re-process with the first one
          processTouch(e.touches[0]);
        }
        return;
      }

      processTouch(e.touches[0]);
    };

    const processTouch = (touch) => {
      const rect = dpad.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const dx = touch.clientX - centerX;
      const dy = touch.clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Define a deadzone in the center
      const deadzone = rect.width * 0.12;
      if (dist < deadzone) return;

      // Calculate direction based on angle
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      
      // Up: -135 to -45
      // Down: 45 to 135
      // Left: 135 to 180 or -180 to -135
      // Right: -45 to 45
      
      if (angle >= -135 && angle <= -45) {
        this.keys.up = true;
        dpad.querySelector('.dpad-up').classList.add('active');
      } else if (angle >= 45 && angle <= 135) {
        this.keys.down = true;
        dpad.querySelector('.dpad-down').classList.add('active');
      } else if (Math.abs(angle) > 135) {
        this.keys.left = true;
        dpad.querySelector('.dpad-left').classList.add('active');
      } else if (Math.abs(angle) < 45) {
        this.keys.right = true;
        dpad.querySelector('.dpad-right').classList.add('active');
      }
    };

    dpad.addEventListener('touchstart', handleDpadTouch, { passive: false });
    dpad.addEventListener('touchmove', handleDpadTouch, { passive: false });
    dpad.addEventListener('touchend', handleDpadTouch, { passive: false });
    dpad.addEventListener('touchcancel', handleDpadTouch, { passive: false });

    // Mouse fallback for desktop testing
    let isMouseDown = false;
    dpad.addEventListener('mousedown', e => {
      isMouseDown = true;
      handleDpadTouch({ 
        preventDefault: () => {}, 
        clientX: e.clientX, 
        clientY: e.clientY,
        touches: [{ clientX: e.clientX, clientY: e.clientY }],
        type: 'mousedown'
      });
    });
    window.addEventListener('mousemove', e => {
      if (!isMouseDown) return;
      handleDpadTouch({ 
        preventDefault: () => {}, 
        clientX: e.clientX, 
        clientY: e.clientY,
        touches: [{ clientX: e.clientX, clientY: e.clientY }],
        type: 'mousemove'
      });
    });
    window.addEventListener('mouseup', () => {
      if (!isMouseDown) return;
      isMouseDown = false;
      resetDpadSignals();
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
