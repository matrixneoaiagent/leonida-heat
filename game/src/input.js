// Leonida Heat - input.
// Keyboard state is tracked on window so the game keeps working after the
// pointer leaves the canvas. Mouse positions are mapped from the letterboxed
// CSS box back into the fixed 1280x720 backing store, then through the camera.

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.keysReleased = new Set();
    this.anyGesture = false;
    this.pointerCaptured = false;
    this.usingPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;
    this.mouse = {
      x: 640,
      y: 360,
      worldX: 1600,
      worldY: 1600,
      down: false,
      clicked: false,
      rightDown: false,
      rightClicked: false,
      wheel: 0,
      moved: false,
    };
    this.handlers = [];
    this.bind();
  }

  on(target, type, fn, options) {
    target.addEventListener(type, fn, options);
    this.handlers.push([target, type, fn, options]);
  }

  bind() {
    const block = new Set([
      'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Escape', 'KeyP',
    ]);

    this.on(window, 'keydown', (event) => {
      if (event.repeat) {
        // Held keys are already tracked; do not re-fire one-shot presses.
        if (block.has(event.code)) event.preventDefault();
        return;
      }
      if (block.has(event.code)) event.preventDefault();
      if (!this.keysDown.has(event.code)) this.keysPressed.add(event.code);
      this.keysDown.add(event.code);
      this.anyGesture = true;
    });

    this.on(window, 'keyup', (event) => {
      this.keysDown.delete(event.code);
      this.keysReleased.add(event.code);
      if (block.has(event.code)) event.preventDefault();
    });

    this.on(window, 'blur', () => this.releaseAll());
    this.on(document, 'visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });

    const move = (event) => {
      this.setMousePosition(event);
      this.anyGesture = true;
      this.mouse.moved = true;
    };

    if (this.usingPointerEvents) {
      this.on(this.canvas, 'pointermove', move);
      this.on(this.canvas, 'pointerdown', (event) => {
        this.setMousePosition(event);
        this.anyGesture = true;
        try {
          this.canvas.setPointerCapture(event.pointerId);
          this.pointerCaptured = true;
        } catch {
          this.pointerCaptured = false;
        }
        this.press(event.button);
        this.canvas.focus({ preventScroll: true });
        event.preventDefault();
      });
      this.on(this.canvas, 'pointerup', (event) => {
        this.release(event.button);
        if (this.pointerCaptured) {
          try {
            this.canvas.releasePointerCapture(event.pointerId);
          } catch {
            // Pointer capture can already be gone after a browser gesture.
          }
          this.pointerCaptured = false;
        }
      });
      this.on(this.canvas, 'pointercancel', () => {
        this.pointerCaptured = false;
        this.mouse.down = false;
        this.mouse.rightDown = false;
      });
      this.on(window, 'pointerup', (event) => this.release(event.button));
    } else {
      this.on(this.canvas, 'mousemove', move);
      this.on(this.canvas, 'mousedown', (event) => {
        this.setMousePosition(event);
        this.press(event.button);
        event.preventDefault();
      });
      this.on(window, 'mouseup', (event) => this.release(event.button));
    }

    this.on(this.canvas, 'contextmenu', (event) => event.preventDefault());
    this.on(this.canvas, 'wheel', (event) => {
      this.mouse.wheel += Math.sign(event.deltaY);
      this.anyGesture = true;
      event.preventDefault();
    }, { passive: false });
    this.on(this.canvas, 'click', () => this.canvas.focus({ preventScroll: true }));
  }

  press(button) {
    if (button === 0) {
      this.mouse.down = true;
      this.mouse.clicked = true;
    } else if (button === 2) {
      this.mouse.rightDown = true;
      this.mouse.rightClicked = true;
    }
  }

  release(button) {
    if (button === 0) this.mouse.down = false;
    if (button === 2) this.mouse.rightDown = false;
  }

  releaseAll() {
    this.keysDown.clear();
    this.mouse.down = false;
    this.mouse.rightDown = false;
    this.pointerCaptured = false;
  }

  setMousePosition(event) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    this.mouse.x = Math.max(0, Math.min(this.canvas.width, (event.clientX - rect.left) * scaleX));
    this.mouse.y = Math.max(0, Math.min(this.canvas.height, (event.clientY - rect.top) * scaleY));
  }

  updateWorldMouse(camera) {
    this.mouse.worldX = (this.mouse.x - this.canvas.width / 2) / camera.zoom + camera.x;
    this.mouse.worldY = (this.mouse.y - this.canvas.height / 2) / camera.zoom + camera.y;
  }

  isDown(code) {
    return this.keysDown.has(code);
  }

  wasPressed(code) {
    return this.keysPressed.has(code);
  }

  clearPressed() {
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.mouse.clicked = false;
    this.mouse.rightClicked = false;
    this.mouse.wheel = 0;
  }

  get forward() { return this.isDown('KeyW') || this.isDown('ArrowUp'); }
  get backward() { return this.isDown('KeyS') || this.isDown('ArrowDown'); }
  get left() { return this.isDown('KeyA') || this.isDown('ArrowLeft'); }
  get right() { return this.isDown('KeyD') || this.isDown('ArrowRight'); }
  get sprint() { return this.isDown('ShiftLeft') || this.isDown('ShiftRight'); }
  get handbrake() { return this.isDown('Space'); }
  get roll() { return this.wasPressed('Space'); }
  get enterVehicle() { return this.wasPressed('KeyE') || this.wasPressed('KeyF'); }
  get interact() { return this.wasPressed('KeyE'); }
  get reload() { return this.wasPressed('KeyR'); }
  get pause() { return this.wasPressed('Escape') || this.wasPressed('KeyP'); }
  get confirm() { return this.wasPressed('Enter') || this.wasPressed('Space'); }
  get mute() { return this.wasPressed('KeyM'); }
  get radio() { return this.wasPressed('KeyQ'); }
  get horn() { return this.wasPressed('KeyH'); }
  get cameraZoom() { return this.wasPressed('KeyZ'); }

  get weaponSlot() {
    for (let i = 1; i <= 5; i += 1) {
      if (this.wasPressed(`Digit${i}`)) return i - 1;
    }
    return -1;
  }

  get cycleWeapon() {
    return Math.sign(this.mouse.wheel);
  }

  endFrame() {
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.mouse.clicked = false;
    this.mouse.rightClicked = false;
    this.mouse.wheel = 0;
    this.mouse.moved = false;
  }

  dispose() {
    for (const [target, type, fn, options] of this.handlers) {
      target.removeEventListener(type, fn, options);
    }
    this.handlers = [];
  }
}
