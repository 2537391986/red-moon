export class Input {
  keys = new Set<string>();
  pointer = { x: 0, y: 0, down: false };
  move = { x: 0, y: 0 };
  actions = new Set<string>();
  uiBlocking = false;
  scrolled = false;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      this.keys.add(key);
      if ([' ', '1', '2', '3', 'i', 'b', 'h', 'r', 'p', 't', 'enter', 's'].includes(key)) event.preventDefault();
      this.actions.add(key);
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
    // 无手动移动（自动推进）
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

    const action = this.hitActionButton(x, y, this.canvas.width, this.canvas.height);
    if (action) {
      this.actions.add(action);
    } else {
      this.actions.add('tap');
    }
  }

  private onPointerMove(event: PointerEvent): void {
    const { x, y } = this.pointerPosition(event);
    this.pointer = { x, y, down: true };
  }

  private onPointerUp(_event: PointerEvent): void {
    this.pointer.down = false;
  }

  private hitActionButton(x: number, y: number, w: number, _h: number): string | null {
    // 极简按钮：背包(I)、药水(P)、重置(R) — 右侧竖排
    const buttons = [
      { action: 'i', x: w - 30, y: 110, r: 18 },
      { action: 'p', x: w - 30, y: 154, r: 18 },
      { action: 'r', x: w - 30, y: 198, r: 18 },
    ];
    for (const button of buttons) {
      if (Math.hypot(x - button.x, y - button.y) <= button.r) return button.action;
    }
    return null;
  }
}
