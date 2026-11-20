/* LEONIDA HEAT 3D — third-person follow / orbit camera.
   Convention: a yaw of 0 faces +Z, forward = (sin(yaw), 0, cos(yaw)).
   Later modules may pass target.forward for a different convention. */
(function () {
  'use strict';

  window.LH = window.LH || {};

  var CFG = (window.LH.CONFIG && window.LH.CONFIG.CAMERA) || {};
  var V = null;

  function vec() {
    if (!V) V = new THREE.Vector3();
    return new THREE.Vector3();
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function readTriple(value, out) {
    if (!value) return out.set(0, 0, 0);
    if (value.isVector3) return out.copy(value);
    if (Array.isArray(value)) return out.set(value[0] || 0, value[1] || 0, value[2] || 0);
    return out.set(value.x || 0, value.y || 0, value.z || 0);
  }

  function ThirdPersonCamera(camera, world) {
    this.camera = camera;
    this.world = world || null;

    this.yaw = 0;
    this.pitch = 0.18;
    this.distance = CFG.distance || 5.5;
    this.height = CFG.height || 2.4;
    this.shoulder = CFG.shoulder || 0.62;

    this.fov = (camera && camera.fov) || CFG.fov || 62;

    this.shakeAmount = 0;
    this.shakeTime = 0;
    this.time = 0;

    this.initialised = false;
    this.shotMode = false;
    this.mode = 'foot';
    this.autoYaw = 0;

    this._pos = vec();
    this._look = vec();
    this._pivot = vec();
    this._desired = vec();
    this._smoothLook = vec();
    this._forward = vec();
    this._right = vec();
    this._tmp = vec();
    this._shotPos = vec();
    this._shotLook = vec();
    this._vehicleHeading = 0;
  }

  ThirdPersonCamera.prototype._getForward = function (target, out) {
    if (target && target.forward && target.forward.isVector3) {
      out.copy(target.forward);
      out.y = 0;
      if (out.lengthSq() > 0.0001) return out.normalize();
    }
    var yaw = target && typeof target.yaw === 'number' ? target.yaw : this.yaw;
    out.set(Math.sin(yaw), 0, Math.cos(yaw));
    return out;
  };

  ThirdPersonCamera.prototype._getHeading = function (target) {
    if (!target) return 0;
    if (target.vehicle) {
      return typeof target.vehicle.heading === 'number'
        ? target.vehicle.heading
        : (typeof target.vehicle.yaw === 'number' ? target.vehicle.yaw : target.yaw || 0);
    }
    return typeof target.yaw === 'number' ? target.yaw : 0;
  };

  ThirdPersonCamera.prototype._blocked = function (p) {
    if (!this.world) return false;
    if (typeof this.world.cameraBlocked === 'function') {
      return !!this.world.cameraBlocked(p.x, p.y, p.z);
    }
    var buildings = this.world.buildings;
    if (!buildings || !buildings.length) return false;
    var pad = CFG.collisionPad || 0.45;
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      if (!b) continue;
      if (p.x < b.minX - pad || p.x > b.maxX + pad) continue;
      if (p.z < b.minZ - pad || p.z > b.maxZ + pad) continue;
      if (p.y < -0.5 || p.y > (b.h || 10) + pad) continue;
      return true;
    }
    return false;
  };

  ThirdPersonCamera.prototype._collide = function (pivot, desired, out) {
    var steps = 9;
    var safe = 1;
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      this._tmp.lerpVectors(pivot, desired, t);
      if (this._blocked(this._tmp)) {
        safe = Math.max(0.12, (i - 1) / steps - 0.055);
        break;
      }
    }
    return out.lerpVectors(pivot, desired, safe);
  };

  /**
   * Follow the target. mode: 'foot' | 'vehicle' | 'aim' | 'title' | 'orbit'.
   * The mouse is consumed by the camera; gameplay reads this.yaw.
   */
  ThirdPersonCamera.prototype.update = function (dt, target, mode, input) {
    if (!this.camera) return;
    dt = clamp(dt || 0, 0, 0.1);
    this.time += dt;

    if (this.shotMode) {
      this.camera.position.copy(this._shotPos);
      this.camera.lookAt(this._shotLook);
      if (Math.abs(this.camera.fov - this.fov) > 0.05) {
        this.camera.fov += (this.fov - this.camera.fov) * 0.2;
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    var isVehicle = mode === 'vehicle' || (!mode && target && target.vehicle);
    var isAim = mode === 'aim' || (mode !== 'vehicle' && input && input.mouse && input.mouse.right && !isVehicle);
    var isTitle = mode === 'title' || mode === 'orbit';
    if (isVehicle) this.mode = 'vehicle';
    else if (isAim) this.mode = 'aim';
    else if (isTitle) this.mode = 'title';
    else this.mode = 'foot';

    var tPos = target && target.pos ? target.pos : null;
    if (!tPos) {
      tPos = this._tmp.set(0, 0, 0);
    }

    var wantYaw = this.yaw;
    var wantPitch = this.pitch;

    if (!isTitle && input && input.mouse) {
      var sens = CFG.sensitivity || 0.0022;
      this.yaw += (input.mouse.dx || 0) * sens;
      this.pitch += (input.mouse.dy || 0) * sens;
      this.pitch = clamp(this.pitch, CFG.minPitch == null ? -0.55 : CFG.minPitch, CFG.maxPitch == null ? 0.85 : CFG.maxPitch);
      this.yaw = ((this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    }

    if (isTitle) {
      this.yaw += dt * 0.045;
      this.pitch += (0.02 - this.pitch) * Math.min(1, dt * 0.7);
    }

    if (isVehicle && !isAim) {
      var heading = this._getHeading(target);
      var mouseActive = input && input.mouse && (Math.abs(input.mouse.dx) + Math.abs(input.mouse.dy) > 0.5);
      if (!mouseActive) {
        var delta = ((heading - this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        this.yaw += delta * Math.min(1, dt * 1.7);
      }
    }

    wantYaw = this.yaw;
    wantPitch = this.pitch;

    var dist = isAim
      ? (CFG.aimDistance || 3.1)
      : isTitle
        ? 18
        : isVehicle
          ? (CFG.vehicleDistance || 7.4)
          : (CFG.distance || 5.5);

    if (isVehicle && target && target.vehicle && target.vehicle.type === 'armored') dist += 1.3;
    if (isAim) this.pitch = clamp(this.pitch, -0.4, 0.6);

    var pivotY = isVehicle ? 1.45 : (isAim ? 1.62 : 1.55);
    var pivotHeight = isTitle ? 4.0 : pivotY;
    this._pivot.set(tPos.x, tPos.y + pivotHeight, tPos.z);

    if (!isTitle) {
      this._getForward(target, this._forward);
      if (this.mode === 'vehicle') {
        this._getHeading(target);
        this._forward.set(Math.sin(this._getHeading(target)), 0, Math.cos(this._getHeading(target)));
      } else if (this.mode === 'aim') {
        this._forward.set(Math.sin(wantYaw), 0, Math.cos(wantYaw));
      }
    } else {
      this._forward.set(Math.sin(wantYaw), 0, Math.cos(wantYaw));
    }

    this._right.set(this._forward.z, 0, -this._forward.x);
    var shoulder = isAim ? (CFG.aimShoulder || 0.8) : (isTitle ? 0 : (CFG.shoulder || 0.62));
    if (isVehicle) shoulder *= 0.6;

    var cosP = Math.cos(wantPitch);
    var sinP = Math.sin(wantPitch);
    var horizontal = dist * cosP;
    var vertical = dist * sinP + (isTitle ? 3.4 : 0.85);

    this._desired.copy(this._pivot)
      .addScaledVector(this._forward, -horizontal)
      .addScaledVector(this._right, shoulder);
    this._desired.y = this._pivot.y + vertical;

    this._collide(this._pivot, this._desired, this._desired);
    if (this._desired.y < 0.65) this._desired.y = 0.65;

    var follow = isTitle ? 3.2 : (isVehicle ? 7.0 : (CFG.followLag || 9.5));
    if (!this.initialised) {
      this.camera.position.copy(this._desired);
      this._smoothLook.copy(this._pivot);
      this.initialised = true;
    } else {
      var a = 1 - Math.exp(-follow * dt);
      this.camera.position.lerp(this._desired, a);
    }

    if (this.camera.position.y < 0.6) this.camera.position.y = 0.6;

    var lookAhead = isTitle ? 0 : isAim ? 18 : isVehicle ? 7.5 : 4.0;
    this._look.copy(this._pivot)
      .addScaledVector(this._forward, lookAhead);
    this._look.y = this._pivot.y - (isTitle ? 0.6 : 0.18);
    this._look.addScaledVector(this._right, isTitle ? 0 : 0.12);

    var la = this.initialised ? 1 - Math.exp(-(CFG.lookLag || 13) * dt) : 1;
    this._smoothLook.lerp(this._look, la);
    if (this._smoothLook.lengthSq() < 0.0001) this._smoothLook.copy(this._look);

    this.camera.lookAt(this._smoothLook);

    var speed = 0;
    if (target) {
      if (target.vehicle && typeof target.vehicle.speed === 'number') speed = Math.abs(target.vehicle.speed);
      else if (typeof target.speed === 'number') speed = Math.abs(target.speed);
    }
    var baseFov = CFG.fov || 62;
    var targetFov = isAim ? (CFG.aimFov || 46) : baseFov + (isVehicle ? 5 : 0) + clamp(speed / 46, 0, 1) * 9;
    if (isTitle) targetFov = 58;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 4.5);
    if (Math.abs(this.camera.fov - this.fov) > 0.03) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    if (this.shakeAmount > 0.0005) {
      this.shakeTime += dt * 42;
      var amp = this.shakeAmount;
      this.camera.position.x += Math.sin(this.shakeTime * 1.7) * amp;
      this.camera.position.y += Math.cos(this.shakeTime * 2.3) * amp * 0.65;
      this.camera.position.z += Math.sin(this.shakeTime * 1.3 + 1.7) * amp;
      this.shakeAmount *= Math.exp(-7.5 * dt);
      if (this.shakeAmount < 0.0005) this.shakeAmount = 0;
    }

    this._pos.copy(this.camera.position);
  };

  ThirdPersonCamera.prototype.shake = function (amount) {
    this.shakeAmount = Math.min(2.2, this.shakeAmount + (amount || 0));
  };

  ThirdPersonCamera.prototype.setShot = function (pos, look) {
    if (!pos) {
      this.shotMode = false;
      return;
    }
    readTriple(pos, this._shotPos);
    readTriple(look || { x: 0, y: 1, z: 0 }, this._shotLook);
    this.shotMode = true;
    this.initialised = true;
    if (this.camera) {
      this.camera.position.copy(this._shotPos);
      this.camera.lookAt(this._shotLook);
    }
  };

  ThirdPersonCamera.prototype.clearShot = function () {
    this.shotMode = false;
    this.initialised = false;
  };

  ThirdPersonCamera.prototype.snap = function (target) {
    this.initialised = false;
    if (target && typeof target.yaw === 'number') this.yaw = target.yaw;
  };

  ThirdPersonCamera.prototype.orbit = function (deltaYaw, deltaPitch) {
    this.yaw += deltaYaw || 0;
    this.pitch = clamp(this.pitch + (deltaPitch || 0), CFG.minPitch == null ? -0.55 : CFG.minPitch, CFG.maxPitch == null ? 0.85 : CFG.maxPitch);
  };

  LH.ThirdPersonCamera = ThirdPersonCamera;
}());
