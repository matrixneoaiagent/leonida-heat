/* LEONIDA HEAT 3D — keyboard, pointer lock and drag-look input.
   Deliberately allocation-free in the steady state: maps are cleared in place. */
(function () {
  'use strict';

  window.LH = window.LH || {};

  var PREVENT = {
    Space: 1, Tab: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1,
    KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, KeyE: 1, KeyQ: 1, KeyR: 1,
    KeyX: 1, KeyC: 1, KeyV: 1, KeyM: 1, KeyH: 1, KeyF: 1,
    Digit1: 1, Digit2: 1, Digit3: 1, Digit4: 1, Digit5: 1,
    Numpad1: 1, Numpad2: 1, Numpad3: 1, Numpad4: 1, Numpad5: 1
  };

  function Input(canvas) {
    var self = this;
    this.canvas = canvas || document.getElementById('gameCanvas');
    this.keys = Object.create(null);
    this.pressedMap = Object.create(null);
    this.mouse = {
      dx: 0, dy: 0,
      down: false, right: false, middle: false,
      clicked: false, rightClicked: false,
      x: 0, y: 0, wheel: 0
    };
    this.wheelDelta = 0;
    this.locked = false;
    this.dragging = false;
    this.enabled = true;
    this.anyKey = false;
    this.lockSupported = !!(this.canvas && this.canvas.requestPointerLock);
    this._dragX = 0;
    this._dragY = 0;
    this._lastMoveX = 0;
    this._lastMoveY = 0;
    this._bound = [];

    this._onKeyDown = function (e) {
      if (!self.enabled) return;
      if (PREVENT[e.code]) e.preventDefault();
      if (e.repeat) return;
      if (!self.keys[e.code]) self.pressedMap[e.code] = true;
      self.keys[e.code] = true;
      self.anyKey = true;
    };

    this._onKeyUp = function (e) {
      if (PREVENT[e.code]) e.preventDefault();
      self.keys[e.code] = false;
    };

    this._onBlur = function () {
      self.clear();
    };

    this._onMouseDown = function (e) {
      if (!self.enabled) return;
      if (e.button === 0) {
        self.mouse.down = true;
        self.mouse.clicked = true;
      } else if (e.button === 2) {
        self.mouse.right = true;
        self.mouse.rightClicked = true;
      } else if (e.button === 1) {
        self.mouse.middle = true;
      }
      self.mouse.x = e.clientX;
      self.mouse.y = e.clientY;
      if (!self.locked) {
        self.dragging = true;
        self._dragX = e.clientX;
        self._dragY = e.clientY;
      }
      if (self.canvas && self.canvas.focus) self.canvas.focus({ preventScroll: true });
    };

    this._onMouseUp = function (e) {
      if (e.button === 0) {
        self.mouse.down = false;
        if (!self.mouse.right) self.dragging = false;
      } else if (e.button === 2) {
        self.mouse.right = false;
        if (!self.mouse.down) self.dragging = false;
      } else if (e.button === 1) {
        self.mouse.middle = false;
      }
    };

    this._onMouseMove = function (e) {
      if (!self.enabled) return;
      self.mouse.x = e.clientX;
      self.mouse.y = e.clientY;

      if (self.locked) {
        self.mouse.dx += e.movementX || 0;
        self.mouse.dy += e.movementY || 0;
        return;
      }

      if (self.dragging) {
        var mx = e.clientX - self._dragX;
        var my = e.clientY - self._dragY;
        self._dragX = e.clientX;
        self._dragY = e.clientY;
        self.mouse.dx += mx;
        self.mouse.dy += my;
      }
    };

    this._onWheel = function (e) {
      if (!self.enabled) return;
      e.preventDefault();
      var d = e.deltaY;
      if (e.deltaMode === 1) d *= 16;
      else if (e.deltaMode === 2) d *= 100;
      self.wheelDelta += d;
      self.mouse.wheel += d;
    };

    this._onContext = function (e) {
      e.preventDefault();
    };

    this._onLockChange = function () {
      var was = self.locked;
      self.locked = document.pointerLockElement === self.canvas;
      if (self.locked) {
        self.dragging = false;
      } else if (was) {
        self.mouse.dx = 0;
        self.mouse.dy = 0;
      }
      if (self.onLockChange) self.onLockChange(self.locked);
    };

    this._onPointerLockError = function () {
      self.locked = false;
    };

    this._listen(window, 'keydown', this._onKeyDown, false);
    this._listen(window, 'keyup', this._onKeyUp, false);
    this._listen(window, 'blur', this._onBlur, false);
    this._listen(window, 'mouseup', this._onMouseUp, false);
    this._listen(document, 'mousemove', this._onMouseMove, false);
    this._listen(document, 'pointerlockchange', this._onLockChange, false);
    this._listen(document, 'pointerlockerror', this._onPointerLockError, false);

    if (this.canvas) {
      this._listen(this.canvas, 'mousedown', this._onMouseDown, false);
      this._listen(this.canvas, 'wheel', this._onWheel, { passive: false });
      this._listen(this.canvas, 'contextmenu', this._onContext, false);
      if (this.canvas.tabIndex < 0) this.canvas.tabIndex = 0;
    }
  }

  Input.prototype._listen = function (target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._bound.push([target, type, fn, opts]);
  };

  /** True only on the frame after a fresh key press. */
  Input.prototype.pressed = function (code) {
    return this.pressedMap[code] === true;
  };

  /** Read and clear a one-shot key edge so two systems cannot both react. */
  Input.prototype.consume = function (code) {
    if (this.pressedMap[code] !== true) return false;
    delete this.pressedMap[code];
    return true;
  };

  /** Movement axis in screen space: x right, y forward. Normalised diagonals. */
  Input.prototype.axis = function () {
    var x = 0;
    var y = 0;
    if (this.keys.KeyD || this.keys.ArrowRight) x += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) x -= 1;
    if (this.keys.KeyW || this.keys.ArrowUp) y += 1;
    if (this.keys.KeyS || this.keys.ArrowDown) y -= 1;
    if (x !== 0 && y !== 0) {
      var inv = Math.sqrt(0.5);
      x *= inv;
      y *= inv;
    }
    return { x: x, y: y };
  };

  Input.prototype.forward = function () {
    return !!this.keys.KeyW || !!this.keys.ArrowUp;
  };

  Input.prototype.back = function () {
    return !!this.keys.KeyS || !!this.keys.ArrowDown;
  };

  Input.prototype.left = function () {
    return !!this.keys.KeyA || !!this.keys.ArrowLeft;
  };

  Input.prototype.right = function () {
    return !!this.keys.KeyD || !!this.keys.ArrowRight;
  };

  Input.prototype.sprint = function () {
    return !!(this.keys.ShiftLeft || this.keys.ShiftRight);
  };

  Input.prototype.aiming = function () {
    return !!this.mouse.right;
  };

  Input.prototype.down = function () {
    return !!this.mouse.down;
  };

  /** Pointer lock with graceful failure; returns true when a request was issued. */
  Input.prototype.requestLock = function () {
    if (!this.canvas || !this.canvas.requestPointerLock) {
      this.lockSupported = false;
      return false;
    }
    if (document.pointerLockElement === this.canvas) {
      this.locked = true;
      return true;
    }
    try {
      var result = this.canvas.requestPointerLock();
      if (result && typeof result.catch === 'function') {
        result.catch(function () { /* drag-look fallback stays active */ });
      }
      return true;
    } catch (err) {
      this.lockSupported = false;
      this.locked = false;
      return false;
    }
  };

  Input.prototype.exitLock = function () {
    if (document.pointerLockElement === this.canvas && document.exitPointerLock) {
      document.exitPointerLock();
    }
    this.locked = false;
  };

  Input.prototype.clear = function () {
    for (var k in this.keys) this.keys[k] = false;
    for (var p in this.pressedMap) delete this.pressedMap[p];
    this.mouse.down = false;
    this.mouse.right = false;
    this.mouse.middle = false;
    this.mouse.clicked = false;
    this.mouse.rightClicked = false;
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
    this.wheelDelta = 0;
    this.dragging = false;
    this.anyKey = false;
  };

  Input.prototype.takeWheel = function () {
    var d = this.wheelDelta;
    this.wheelDelta = 0;
    return d;
  };

  /** Call once at the end of every frame, after gameplay consumed the edges. */
  Input.prototype.endFrame = function () {
    for (var p in this.pressedMap) delete this.pressedMap[p];
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.clicked = false;
    this.mouse.rightClicked = false;
    this.mouse.wheel = 0;
    this.wheelDelta = 0;
    this.anyKey = false;
  };

  Input.prototype.destroy = function () {
    for (var i = 0; i < this._bound.length; i++) {
      var b = this._bound[i];
      b[0].removeEventListener(b[1], b[2], b[3]);
    }
    this._bound.length = 0;
    this.clear();
  };

  LH.Input = Input;
}());
