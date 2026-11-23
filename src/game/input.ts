/** Keyboard + mouse state with pointer lock. Edge-triggered "pressed" flags are cleared each frame by endFrame(). */
export class Input {
  private down = new Set<string>();
  private pressedSet = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  mouseDown = false;
  mousePressed = false;
  locked = false;
  /** Time since the player last moved the mouse (camera auto-follow uses this). */
  idleMouse = 99;
  enabled = false;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.target instanceof HTMLInputElement) return;
      if (!this.down.has(e.code)) this.pressedSet.add(e.code);
      this.down.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    el.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) el.requestPointerLock?.();
      if (e.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1) this.idleMouse = 0;
    });
  }

  isDown(code: string) {
    return this.down.has(code);
  }
  pressed(code: string) {
    return this.pressedSet.has(code);
  }
  /** -1..1 axes from WASD / arrows. */
  axis(): { x: number; y: number } {
    const x = (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
    const y = (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0) - (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0);
    return { x, y };
  }

  endFrame(dt: number) {
    this.pressedSet.clear();
    this.mousePressed = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.idleMouse += dt;
  }
}
