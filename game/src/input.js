// Leonida Heat - keyboard and mouse input.
// The canvas is a fixed 1280x720 backing store scaled by CSS, so mouse
// coordinates are converted back into that space before being unprojected
// through the camera into world coordinates.

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.keysReleased = new Set();
    this.anyGesture = false;
    this.mouse = {
      x: 640, y: 360, worldX: 0, worldY: 0,
      down: false, clicked: false,
      rightDown: false, rightClicked: false,
      wheel: 0,
    };
    this.setup();
  }

  setup() {
    window.addEventListener('keydown', (e) => {
      const block = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Escape'];
      if (block.includes(e.code)) e.preventDefault();
      if (!this.keysDown.has(e.code)) this.keysPressed.add(e.code);
      this.keysDown.add(e.code);
      this.anyGesture = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
      this.keysReleased.add(e.code);
    });

    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.mouse.down = false;
      this.mouse.rightDown = false;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      this.setMousePosition(e);
      this.anyGesture = true;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      this.setMousePosition(e);
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.clicked = true;
      } else if (e.button === 2) {
        this.mouse.rightDown = true;
        this.mouse.rightClicked = true;
      }
      this.anyGesture = true;
      e.preventDefault();
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rightDown = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('wheel', (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
  }

  setMousePosition(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    this.mouse.x = (e.clientX - rect.left) * scaleX;
    this.mouse.y = (e.clientY - rect.top) * scaleY;
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
  }
}
