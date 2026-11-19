// Leonida Heat v3 - input.
// A small action layer over the keyboard and pointer. Physical key state is
// tracked on window so the game keeps responding when the pointer leaves the
// canvas; mouse coordinates are mapped out of the letterboxed CSS box and
// back into the fixed 1280x720 backing store.

const BLOCKED = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Escape',
  'KeyP', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
]);

// Logical actions and their default bindings. The game reads actions, not
// key codes, so rebinding only ever happens here.
export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  handbrake: ['Space'],
  enter: ['KeyE', 'KeyF'],
  interact: ['KeyE'],
  reload: ['KeyR'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'Space'],
  mute: ['KeyM'],
  radio: ['KeyQ'],
  horn: ['KeyH'],
  grenade: ['KeyG'],
  map: ['KeyT'],
  camera: ['KeyZ'],
  help: ['Slash'],
};

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.keysReleased = new Set();
    this.anyGesture = false;
    this.pointerCaptured = false;
    this.usingPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;
    this.lastKeyAt = 0;
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
      inside: false,
    };
    this.handlers = [];
    this.bind();
  }

  on(target, type, fn, options) {
    target.addEventListener(type, fn, options);
    this.handlers.push([target, type, fn, options]);
  }

  bind() {
    this.on(window, 'keydown', (event) => {
      if (event.repeat) {
        if (BLOCKED.has(event.code)) event.preventDefault();
        return;
      }
      if (BLOCKED.has(event.code)) event.preventDefault();
      if (!this.keysDown.has(event.code)) this.keysPressed.add(event.code);
      this.keysDown.add(event.code);
      this.anyGesture = true;
      this.lastKeyAt = performance.now();
    });

    this.on(window, 'keyup', (event) => {
      this.keysDown.delete(event.code);
      this.keysReleased.add(event.code);
      if (BLOCKED.has(event.code)) event.preventDefault();
    });

    this.on(window, 'blur', () => this.releaseAll());
    this.on(document, 'visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });

    const move = (event) => {
      this.setMousePosition(event);
      this.mouse.inside = true;
      this.anyGesture = true;
      this.mouse.moved = true;
    };

    if (this.usingPointerEvents) {
      this.on(this.canvas, 'pointermove', move);
      this.on(this.canvas, 'pointerenter', () => { this.mouse.inside = true; });
      this.on(this.canvas, 'pointerleave', () => { this.mouse.inside = false; });
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
            // Capture can already be gone after a browser gesture.
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

  action(name) {
    const codes = BINDINGS[name] || [];
    return codes.some((code) => this.keysDown.has(code));
  }

  actionPressed(name) {
    const codes = BINDINGS[name] || [];
    return codes.some((code) => this.keysPressed.has(code));
  }

  get forward() { return this.action('forward'); }
  get backward() { return this.action('backward'); }
  get left() { return this.action('left'); }
  get right() { return this.action('right'); }
  get sprint() { return this.action('sprint'); }
  get handbrake() { return this.action('handbrake'); }
  get roll() { return this.actionPressed('handbrake'); }
  get enterVehicle() { return this.actionPressed('enter'); }
  get interact() { return this.actionPressed('interact'); }
  get reload() { return this.actionPressed('reload'); }
  get pause() { return this.actionPressed('pause'); }
  get confirm() { return this.actionPressed('confirm'); }
  get mute() { return this.actionPressed('mute'); }
  get radio() { return this.actionPressed('radio'); }
  get horn() { return this.actionPressed('horn'); }
  get grenade() { return this.actionPressed('grenade'); }
  get mapToggle() { return this.actionPressed('map'); }
  get cameraZoom() { return this.actionPressed('camera'); }
  get help() { return this.actionPressed('help'); }

  get weaponSlot() {
    for (let i = 1; i <= 5; i += 1) {
      if (this.wasPressed(`Digit${i}`)) return i - 1;
    }
    return -1;
  }

  get cycleWeapon() {
    return Math.sign(this.mouse.wheel);
  }

  clearPressed() {
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.mouse.clicked = false;
    this.mouse.rightClicked = false;
    this.mouse.wheel = 0;
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
