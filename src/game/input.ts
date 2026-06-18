export class Input {
  keys = new Set<string>();
  pointer = { x: 0, y: 0, down: false };
  move = { x: 0, y: 0 };
  actions = new Set<string>();
  uiBlocking = false;
  scrolled = false;
  private canvas: HTMLCanvasElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (event) => {
      this.keys.add(event.key.toLowerCase());
      if ([' ', '1', '2', '3', 'i', 'b', 'h', 'e', 'r', 'v', 'p', 't', 'enter', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(event.key.toLowerCase())) event.preventDefault();
      this.actions.add(event.key.toLowerCase());
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.key.toLowerCase()));
    canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    canvas.addEventListener('pointercancel', (event) => this.onPointerUp(event));
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  consume(action: string): boolean {
    if (!this.actions.has(action)) return false;
    this.actions.delete(action);
    return true;
  }

  consumeAny(actions: string[]): boolean {
    return actions.some((action) => this.consume(action));
  }

  update(): void {
    if (this.stickId !== null) return;
    let x = 0;
    let y = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;
    if (x || y) {
      const len = Math.hypot(x, y);
      this.move.x = x / len;
      this.move.y = y / len;
    } else {
      this.move = { x: 0, y: 0 };
    }
  }

  endFrame(): void {
    this.actions.clear();
  }

  private pointerPosition(event: PointerEvent): { x: number; y: number; rect: DOMRect } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (event.clientY - rect.top) * (this.canvas.height / rect.height),
      rect
    };
  }

  private onPointerDown(event: PointerEvent): void {
    this.scrolled = false;
    this.canvas.setPointerCapture(event.pointerId);
    const { x, y } = this.pointerPosition(event);
    this.pointer = { x, y, down: true };

    if (!this.uiBlocking && x < this.canvas.width * 0.42 && y > this.canvas.height * 0.48) {
      this.stickId = event.pointerId;
      this.stickOrigin = { x, y };
      this.move = { x: 0, y: 0 };
      return;
    }

    const action = this.hitActionButton(x, y, this.canvas.width, this.canvas.height);
    if (action) this.actions.add(action);
    else this.actions.add('tap');
  }

  private onPointerMove(event: PointerEvent): void {
    const { x, y } = this.pointerPosition(event);
    this.pointer = { x, y, down: true };
    if (this.stickId !== event.pointerId) return;
    const dx = x - this.stickOrigin.x;
    const dy = y - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    const max = 58;
    if (len > 8) {
      this.move.x = dx / Math.max(len, max);
      this.move.y = dy / Math.max(len, max);
      const power = Math.min(1, len / max);
      this.move.x *= power;
      this.move.y *= power;
    } else {
      this.move = { x: 0, y: 0 };
    }
  }

  private onPointerUp(event: PointerEvent): void {
    if (this.stickId === event.pointerId) {
      this.stickId = null;
      this.move = { x: 0, y: 0 };
    }
    this.pointer.down = false;
  }

  private hitActionButton(x: number, y: number, w: number, h: number): string | null {
    const portrait = h > w * 1.12;
    const buttons = portrait
      ? [
          { action: '1', x: w - 44, y: h - 268, r: 22 },
          { action: '2', x: w - 44, y: h - 216, r: 22 },
          { action: '3', x: w - 44, y: h - 164, r: 22 },
          { action: ' ', x: w - 56, y: h - 56, r: 40 },
          { action: 'i', x: w - 40, y: 128, r: 22 },
          { action: 'e', x: w - 92, y: 128, r: 22 },
          { action: 'enter', x: w - 144, y: 128, r: 22 },
          { action: 'p', x: w - 196, y: 128, r: 22 }
        ]
      : [
          { action: '1', x: w - 170, y: h - 120, r: 32 },
          { action: '2', x: w - 104, y: h - 162, r: 28 },
          { action: '3', x: w - 64, y: h - 96, r: 28 },
          { action: ' ', x: w - 108, y: h - 76, r: 38 },
          { action: 'i', x: w - 58, y: 56, r: 24 },
          { action: 'e', x: w - 116, y: 56, r: 24 },
          { action: 'enter', x: w - 174, y: 56, r: 24 },
          { action: 'p', x: w - 232, y: 56, r: 24 }
        ];
    for (const button of buttons) {
      if (Math.hypot(x - button.x, y - button.y) <= button.r) return button.action;
    }
    return null;
  }
}
