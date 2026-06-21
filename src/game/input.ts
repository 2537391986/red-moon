export class Input {
  keys = new Set<string>();
  pointer = { x: 0, y: 0, down: false };
  move = { x: 0, y: 0 };
  actions = new Set<string>();
  jumpPressed = false;
  uiBlocking = false;
  scrolled = false;
  private canvas: HTMLCanvasElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      this.keys.add(key);
      if ([' ', '1', '2', '3', 'i', 'b', 'h', 'e', 'r', 'v', 'p', 't', 'enter', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
      this.actions.add(key);
      // 横版跳跃输入（仅首次按下，不重复触发）
      if (!event.repeat && (key === ' ' || key === 'w' || key === 'arrowup')) {
        this.jumpPressed = true;
      }
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
    this.jumpPressed = false;
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
    if (action) {
      this.actions.add(action);
      // 触屏攻击按钮同时触发跳跃（横版模式）
      if (action === ' ') this.jumpPressed = true;
    } else {
      this.actions.add('tap');
    }
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
          { action: ' ', x: w - 50, y: h - 50, r: 34 },
          { action: 'i', x: 30, y: 112, r: 16 },
          { action: 'e', x: 70, y: 112, r: 16 },
          { action: 'p', x: 110, y: 112, r: 16 },
          { action: 'r', x: 150, y: 112, r: 16 },
          { action: 'v', x: 190, y: 112, r: 16 }
        ]
      : [
          { action: '1', x: w - 170, y: h - 120, r: 32 },
          { action: '2', x: w - 104, y: h - 162, r: 28 },
          { action: '3', x: w - 64, y: h - 96, r: 28 },
          { action: ' ', x: w - 108, y: h - 76, r: 38 },
          { action: 'i', x: w - 58, y: 56, r: 24 },
          { action: 'e', x: w - 116, y: 56, r: 24 },
          { action: 'enter', x: w - 174, y: 56, r: 24 },
          { action: 'p', x: w - 232, y: 56, r: 24 },
          { action: 'r', x: w - 290, y: 56, r: 24 },
          { action: 'v', x: w - 348, y: 56, r: 24 }
        ];
    for (const button of buttons) {
      if (Math.hypot(x - button.x, y - button.y) <= button.r) return button.action;
    }
    // Portrait skill buttons — drawn by drawSkills at bottom center
    if (portrait) {
      const skillY = h - 58;
      for (let i = 0; i < 3; i++) {
        const sx = w / 2 - 40 + i * 40;
        if (Math.hypot(x - sx, y - skillY) <= 20) return `${i + 1}`;
      }
    }
    return null;
  }
}
