/** Single-line TTY progress renderer — zero deps, stderr only.
 * Silent unless stderr is a terminal (agents piping output see nothing)
 * and the caller didn't ask for quiet. */
export class Progress {
  private done = 0;
  private last = 0;
  constructor(
    private label: string,
    private total: number,
    private enabled: boolean,
  ) {}

  tick(n = 1): void {
    this.done += n;
    if (!this.enabled) return;
    const now = Date.now();
    if (now - this.last < 80 && this.done < this.total) return;
    this.last = now;
    const pct = this.total
      ? Math.min(100, Math.floor((this.done / this.total) * 100))
      : 100;
    const w = 20;
    const bar = "█".repeat(Math.round((pct / 100) * w)).padEnd(w, "░");
    process.stderr.write(
      `\r\x1b[K${this.label} · ${bar} ${pct}% · ${this.done.toLocaleString("en-US")}/${this.total.toLocaleString("en-US")}`,
    );
  }

  /** Erase the progress line; callers print their own summary after. */
  finish(): void {
    if (this.enabled) process.stderr.write("\r\x1b[K");
  }
}

export const progressOn = (quiet: boolean): boolean =>
  !quiet && !!process.stderr.isTTY;
