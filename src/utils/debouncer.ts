/**
 * Trailing debounce with a maximum-wait ceiling.
 *
 * `schedule()` (re)arms a trailing timer that fires `fn` after `waitMs` of quiet
 * since the most recent call. To stop a continuous stream of calls from
 * deferring `fn` forever, the first `schedule()` in a burst also arms a ceiling
 * timer that fires `fn` no later than `maxWaitMs` later. Whichever fires first
 * runs `fn` and clears both timers, ending the burst.
 */
export class Debouncer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly fn: () => void,
    private readonly waitMs: number,
    private readonly maxWaitMs: number,
  ) {}

  /** Arm (or re-arm) the trailing timer; start the ceiling timer on first call. */
  schedule(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.fire(); }, this.waitMs);
    if (this.maxTimer === null) {
      this.maxTimer = setTimeout(() => { this.fire(); }, this.maxWaitMs);
    }
  }

  /** Whether a call is currently pending. */
  get pending(): boolean {
    return this.timer !== null || this.maxTimer !== null;
  }

  /** Run `fn` immediately if a call is pending; otherwise do nothing. */
  flush(): void {
    if (this.pending) this.fire();
  }

  /** Cancel any pending call without invoking `fn`. */
  cancel(): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    if (this.maxTimer !== null) { clearTimeout(this.maxTimer); this.maxTimer = null; }
  }

  private fire(): void {
    this.cancel();
    this.fn();
  }
}
