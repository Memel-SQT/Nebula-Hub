/**
 * Download speed and time left (brief §7.2): bytes per second over a sliding window of recent
 * samples, so a short stall or burst does not make the estimate jump around.
 */
export class SpeedMeter {
  private samples: Array<{ at: number; bytes: number }> = [];

  constructor(private readonly windowMs = 4000) {}

  /** Records the total received so far at `at` (milliseconds). */
  sample(bytes: number, at: number): void {
    this.samples.push({ at, bytes });
    const limit = at - this.windowMs;
    // Keep one sample older than the window as the reference point.
    while (this.samples.length > 2 && this.samples[1].at <= limit) {
      this.samples.shift();
    }
  }

  reset(): void {
    this.samples = [];
  }

  /** Null until there is at least half a second of data. */
  bytesPerSecond(): number | null {
    if (this.samples.length < 2) return null;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const elapsed = last.at - first.at;
    if (elapsed < 500) return null;
    return Math.max(0, ((last.bytes - first.bytes) * 1000) / elapsed);
  }

  etaSeconds(total: number): number | null {
    const speed = this.bytesPerSecond();
    const last = this.samples[this.samples.length - 1];
    if (!speed || !last || total <= 0) return null;
    return Math.max(0, Math.ceil((total - last.bytes) / speed));
  }
}

/** Fraction done, clamped to 0…1. */
export function progressRatio(received: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.min(1, Math.max(0, received / total));
}
