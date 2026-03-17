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
      dpad.classList.remove('active');
      const nub = dpad.querySelector('.dpad-center');
      if (nub) nub.style.transform = 'translate(0, 0)';
    };

    const handleDpadTouch = (e) => {
      if (e.cancelable) e.preventDefault();
      
      if (e.type === 'touchend' || e.type === 'touchcancel') {
        if (e.touches.length === 0) {
          resetDpadSignals();
          return;
        }
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
      const maxDist = rect.width / 2;
      
      // Visual feedback: move the nub
      const nub = dpad.querySelector('.dpad-center');
      if (nub) {
        const moveX = (dx / dist) * Math.min(dist, maxDist * 0.6);
        const moveY = (dy / dist) * Math.min(dist, maxDist * 0.6);
        nub.style.transform = `translate(${moveX}px, ${moveY}px)`;
      }

      // Define a deadzone
      const deadzone = rect.width * 0.15;
      if (dist < deadzone) {
        this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
        dpad.classList.remove('active');
        return;
      }

      dpad.classList.add('active');

      // Calculate direction with overlap (diagonal)
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      
      // Reset keys before setting based on angle
      this.keys.up = false;
      this.keys.down = false;
      this.keys.left = false;
      this.keys.right = false;

      // Use a wider arc for each direction to allow diagonals
      // Up: -157.5 to -22.5
      // Down: 22.5 to 157.5
      // Left: 112.5 to 180 and -180 to -112.5
      // Right: -67.5 to 67.5

      if (angle >= -157.5 && angle <= -22.5) this.keys.up = true;
      if (angle >= 22.5 && angle <= 157.5) this.keys.down = true;
      if (Math.abs(angle) >= 112.5) this.keys.left = true;
      if (Math.abs(angle) <= 67.5) this.keys.right = true;
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
    const canvas = document.getElementById('game-canvas');
    if (canvas) {
      canvas.addEventListener('touchstart', e => {
        if (e.cancelable) e.preventDefault();
      }, { passive: false });
      canvas.addEventListener('touchmove', e => {
        if (e.cancelable) e.preventDefault();
      }, { passive: false });
    }
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
