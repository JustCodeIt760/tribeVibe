/**
 * PM response debounce pattern (from the spec, §6).
 *
 * When a message arrives:
 *   - If PM should respond now (hard yes), call onFire immediately
 *   - If PM definitely should not respond, do nothing
 *   - If unsure, start a 5-second timer; reset on each new message;
 *     when timer fires, call the evaluate callback to decide
 */
export class DebouncedPM {
  private timer: NodeJS.Timeout | null = null;
  private readonly delayMs: number;
  private evaluate: () => void;

  constructor(evaluate: () => void, delayMs = 5000) {
    this.evaluate = evaluate;
    this.delayMs = delayMs;
  }

  /** Called on every incoming message that could trigger a PM response. */
  tickle(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.evaluate();
    }, this.delayMs);
  }

  /** Cancel any pending evaluation. */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
