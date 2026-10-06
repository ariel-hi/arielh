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
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
    document.addEventListener('focusin', e => {
      if (e.target.closest?.('.overlay, nav, input, textarea, select, button, [contenteditable="true"]')) this.reset();
    });

    // D-Pad touch
    const dpad = document.getElementById('dpad');
    if (!dpad) return;

    // Show d-pad container setup — it's now dynamic
    dpad.classList.remove('hidden');
    dpad.style.opacity = '0'; // Hidden until touch

    let touchOrigin = null;
    let isMouseDown = false;

    const resetDpadSignals = () => {
      this.keys.up = false;
      this.keys.down = false;
      this.keys.left = false;
      this.keys.right = false;
      dpad.classList.remove('active');
      dpad.style.opacity = '0';
      const nub = dpad.querySelector('.dpad-center');
      if (nub) nub.style.transform = 'translate(0, 0)';
      touchOrigin = null;
      isMouseDown = false;
    };
    this._resetPointer = resetDpadSignals;

    const handleTouchStart = (e) => {
      // Leave menus and form controls available for scrolling and interaction.
      if (e.target.closest('.overlay, .neon-btn, .name-entry, nav, a, button, select, input, #bar, .mobile-swap')) {
        this.reset();
        return;
      }
      
      if (e.cancelable) e.preventDefault();
      
      const touch = e.touches[0];
      touchOrigin = { x: touch.clientX, y: touch.clientY };
      
      // Position dpad at touch start
      dpad.style.left = `${touchOrigin.x}px`;
      dpad.style.top = `${touchOrigin.y}px`;
      dpad.style.opacity = '1';
      
      processTouch(touch);
    };

    const handleTouchMove = (e) => {
      if (!touchOrigin) return;
      if (e.cancelable) e.preventDefault();
      processTouch(e.touches[0]);
    };

    const handleTouchEnd = (e) => {
      if (e.touches.length === 0) {
        resetDpadSignals();
      }
    };

    const processTouch = (touch) => {
      if (!touchOrigin) return;
      
      const dx = touch.clientX - touchOrigin.x;
      const dy = touch.clientY - touchOrigin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const limit = 60; // Max visual displacement
      
      // Visual feedback: move the nub
      const nub = dpad.querySelector('.dpad-center');
      if (nub) {
        const moveX = (dx / (dist || 1)) * Math.min(dist, limit);
        const moveY = (dy / (dist || 1)) * Math.min(dist, limit);
        nub.style.transform = `translate(${moveX}px, ${moveY}px)`;
      }

      // Define a deadzone
      const deadzone = 15;
      if (dist < deadzone) {
        this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
        dpad.classList.remove('active');
        return;
      }

      dpad.classList.add('active');

      // Calculate direction with overlap (diagonal)
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      
      this.keys.up = (angle >= -157.5 && angle <= -22.5);
      this.keys.down = (angle >= 22.5 && angle <= 157.5);
      this.keys.left = (Math.abs(angle) >= 112.5);
      this.keys.right = (Math.abs(angle) <= 67.5);
    };

    // Listen on the document for "drag anywhere" feel
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: false });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    // Mouse fallback for desktop testing
    document.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('.overlay, .neon-btn, .name-entry, nav, a, button, select, input, #bar, .mobile-swap')) {
        this.reset();
        return;
      }
      isMouseDown = true;
      handleTouchStart({ 
        preventDefault: () => {}, 
        clientX: e.clientX, 
        clientY: e.clientY,
        touches: [{ clientX: e.clientX, clientY: e.clientY }],
        type: 'mousedown',
        target: e.target
      });
    });
    window.addEventListener('mousemove', e => {
      if (!isMouseDown) return;
      if ((e.buttons & 1) === 0) {
        resetDpadSignals();
        return;
      }
      handleTouchMove({ 
        preventDefault: () => {}, 
        clientX: e.clientX, 
        clientY: e.clientY,
        touches: [{ clientX: e.clientX, clientY: e.clientY }],
        type: 'mousemove'
      });
    });
    window.addEventListener('mouseup', e => {
      if (!isMouseDown || e.button !== 0) return;
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
      const inControl = e.target.closest?.('nav, input, textarea, select, button, [contenteditable="true"]');
      const inMenu = Boolean(document.querySelector('.overlay:not(.hidden)'));
      if (down && (inMenu || inControl || e.ctrlKey || e.metaKey || e.altKey)) return;
      if (!inMenu && !inControl) e.preventDefault();
      this.keys[dir] = down;
    }
  }

  reset() {
    this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
    this._resetPointer?.();
  }
}
