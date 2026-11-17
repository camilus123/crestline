// Frame pacing: on which screen refreshes a frame is drawn. Pure logic (no browser objects), so it can be run
// against a model of a slow device in tests/pace.test.ts.
//
// A browser lets the page hand over frames faster than the GPU finishes them; the surplus queues up, and when the
// queue is full the browser stops the page for several refreshes at once (seen on a phone: most frames 8-17 ms,
// every fifth 75-150 ms). So frames are drawn on every Nth refresh only, and N follows what the refresh callbacks
// themselves show, judged in half seconds:
//  - a bad half second (more than a tenth of the refreshes late, or one gap of four refreshes) twice in a row:
//    N + 1 (one alone can be a hiccup), down to 20 frames a second at most;
//  - a clean half second (under 3 % late): N - 1, at once if that rhythm has not failed lately; a rhythm that
//    failed straight after being tried goes back up after one bad half second and is left alone for 2 s, then 4, 8, 16, 32;
//  - after every change, and at the start of a race, nothing is judged for a moment (a phone that has been
//    drawing less clocks itself down and needs a few frames to speed up again; loading is not load).
//  - a race starts at the rhythm the last race on the same settings ended with (v3.8.2 on the phone: every case
//    spent 2-3.5 s finding it again, with the stalls that takes).
// History: v3.8.0 waited for a GPU fence (on the phone it reported 30-50 ms late whatever the load: 17-29 fps on
// every preset). v3.8.1 had this rule without the pauses and the memory: the stalls went (40-50 per run to 0-3),
// but it climbed during loading, came down one step per 1.5 s at best and fell off the fastest rhythm again and
// again (Low 119 fps without pacing, 71 with).

export class Pacer {
  /** frames are drawn on every n-th screen refresh */
  n = 1;
  /** the screen's refresh interval as the callbacks show it (ms; 0 until known) */
  period = 0;
  /** what was done and why (time in ms, new rhythm, reason), for the benchmark report */
  log: { t: number; n: number; why: string }[] = [];
  private last = 0;            // time of the previous refresh callback (ms)
  private hist: number[] = []; // intervals between refresh callbacks (ms), drawn or skipped
  private sinceDraw = 0;       // screen refreshes since the last frame was drawn
  private grace = 0;           // nothing is judged before this time (ms)
  private dropAt = -1e9;       // when the last attempt at a faster rhythm started (ms)
  private badN = 0;            // the fastest rhythm that failed lately...
  private badUntil = 0;        // ...which is not tried again before this time (ms)
  private back = 2000;         // how long a failed rhythm is left alone (ms; doubles with each failure in a row)
  private badRun = 0;          // bad half seconds in a row
  private w = { t: 0, ref: 0, late: 0, stall: false }; // the current half second

  private note(now: number, why: string): void {
    this.log.push({ t: now, n: this.n, why });
    if (this.log.length > 300) this.log.shift();
  }
  private clearWindow(): void { const w = this.w; w.t = 0; w.ref = 0; w.late = 0; w.stall = false; }
  /** start again at every refresh (a new race: what the last one needed says nothing about this one) */
  reset(now: number, log = true): void {
    this.n = 1; this.sinceDraw = 0; this.badN = 0; this.back = 2000; this.dropAt = -1e9; this.badRun = 0;
    this.clearWindow();
    this.grace = now + 1000;
    if (log) this.note(now, 'start');
  }
  /** the rhythm in use if it has stood for a while (0 while one is being tried or nothing has been judged yet) */
  settled(now: number): number { return now >= this.grace && now - this.dropAt > 2500 ? this.n : 0; }
  /**
   * Start a race at the rhythm the last race on the same settings ended with (call after reset), so that it does
   * not have to be found again through two or three seconds of stalls. A faster one is first tried after 7 s.
   */
  hint(now: number, n: number): void {
    if (n <= 1 || !this.period) return;
    this.n = Math.min(n, Math.max(2, Math.floor(50 / this.period)));
    this.badN = this.n - 1;
    this.back = 4000;
    this.badUntil = now + 7000;
    this.note(now, 'remembered');
  }
  /**
   * Called at every refresh callback with its time (ms). `active` false: pacing is off (or the moment is not to
   * be judged); the refresh interval is still measured. Returns true if this refresh is to be skipped.
   */
  tick(now: number, active: boolean): boolean {
    const d = this.last ? now - this.last : 0;
    this.last = now;
    if (d > 0 && d < 250) {
      this.hist.push(d);
      if (this.hist.length > 120) this.hist.shift();
      if (this.hist.length >= 30 && this.hist.length % 15 === 0) {
        const s = this.hist.slice().sort((a, b) => a - b);
        const est = Math.max(2, s[Math.floor(s.length * 0.1)]);
        // While every refresh is drawn, callbacks that are all late look exactly like a slower screen, so the
        // estimate may only fall then. While refreshes are being skipped the callbacks are light and on time,
        // and the estimate is trusted both ways (screens do change their rate).
        if (!this.period || est < this.period || this.n > 1) this.period = est;
      }
    }
    if (!active || !this.period) {
      if (this.n !== 1) this.reset(now, false);
      this.sinceDraw = 0;
      return false;
    }
    const T = this.period;
    if (d >= 250) this.grace = Math.max(this.grace, now + 500); // a long halt (loading, the tab was away)
    const k = d > 0 && d < 250 ? Math.max(1, Math.round(d / T)) : 1; // refreshes since the last callback
    const w = this.w;
    if (now < this.grace) this.clearWindow();
    else {
      w.t += d; w.ref += k; w.late += k - 1;
      if (k >= 4) w.stall = true;
      if (w.t >= 500) {
        const late = w.late / Math.max(1, w.ref);
        const maxN = Math.max(2, Math.floor(50 / T)); // never below 20 frames a second
        const bad = w.stall || late > 0.1;
        const tried = now - this.dropAt < 2500;
        this.badRun = bad ? this.badRun + 1 : 0;
        // one bad half second can be a hiccup (two in a row are load), unless a faster rhythm was just tried
        if (bad && (this.badRun >= 2 || tried) && this.n < maxN) {
          this.badRun = 0;
          if (tried) { // the rhythm just tried has failed
            this.back = this.badN === this.n ? Math.min(32000, this.back * 2) : 2000;
            this.badN = this.n;
            this.badUntil = now + this.back;
          }
          this.n++;
          this.grace = now + 300;
          this.note(now, w.stall ? 'stall' : 'late ' + Math.round(late * 100) + '%');
        } else if (this.n > 1 && !bad && late < 0.03 && (this.n - 1 > this.badN || now > this.badUntil)) {
          this.n--;
          this.dropAt = now;
          this.grace = now + 300;
          this.note(now, 'try');
        }
        this.clearWindow();
      }
    }
    this.sinceDraw += k;
    if (this.sinceDraw < this.n) return true;
    this.sinceDraw = 0;
    return false;
  }
}
