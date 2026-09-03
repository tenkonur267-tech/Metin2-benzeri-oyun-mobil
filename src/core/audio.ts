/**
 * Kucuk WebAudio ses motoru. Hazir ses dosyasi kullanmaz; tum efektler
 * osilator ve gurultu ile aninda uretilir.
 */

export type SfxName =
  | "hit"
  | "crit"
  | "cast"
  | "ult"
  | "kill"
  | "death"
  | "level"
  | "tower"
  | "coin"
  | "win"
  | "lose"
  | "recall";

type Ctx = AudioContext;

class Sfx {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastPlay = new Map<string, number>();
  enabled = true;
  volume = 0.35;

  /** Tarayici politikasi geregi ilk kullanici etkilesiminde cagrilir. */
  init(): void {
    if (this.ctx || typeof window === "undefined") return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(this.ctx);
    } catch {
      this.ctx = null;
    }
  }

  resume(): void {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? this.volume : 0;
  }

  private makeNoise(ctx: Ctx): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slideTo?: number,
    delay = 0,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private burst(dur: number, gain: number, freq: number, q = 1, delay = 0): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noise) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** Ayni sesin cok sik calmasini engeller. */
  private throttled(name: string, ms: number): boolean {
    const now = performance.now();
    const last = this.lastPlay.get(name) ?? -1e9;
    if (now - last < ms) return true;
    this.lastPlay.set(name, now);
    return false;
  }

  play(name: SfxName): void {
    if (!this.enabled || !this.ctx) return;
    switch (name) {
      case "hit":
        if (this.throttled("hit", 70)) return;
        this.burst(0.08, 0.22, 1400, 1.4);
        break;
      case "crit":
        if (this.throttled("crit", 120)) return;
        this.burst(0.12, 0.32, 2400, 2);
        this.tone(880, 0.1, "square", 0.08, 440);
        break;
      case "cast":
        if (this.throttled("cast", 80)) return;
        this.tone(320, 0.18, "triangle", 0.16, 720);
        break;
      case "ult":
        this.tone(160, 0.5, "sawtooth", 0.18, 520);
        this.burst(0.4, 0.2, 500, 0.8);
        this.tone(80, 0.6, "sine", 0.22, 40, 0.05);
        break;
      case "kill":
        this.tone(660, 0.12, "square", 0.16);
        this.tone(880, 0.16, "square", 0.16, 660, 0.1);
        this.tone(1180, 0.22, "square", 0.14, 900, 0.2);
        break;
      case "death":
        this.tone(420, 0.35, "sawtooth", 0.16, 90);
        this.burst(0.3, 0.14, 300, 0.7);
        break;
      case "level":
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, "triangle", 0.13, undefined, i * 0.07));
        break;
      case "tower":
        this.tone(90, 0.55, "sine", 0.26, 40);
        this.burst(0.5, 0.24, 220, 0.6);
        break;
      case "coin":
        if (this.throttled("coin", 90)) return;
        this.tone(1320, 0.07, "square", 0.07);
        this.tone(1760, 0.08, "square", 0.06, undefined, 0.05);
        break;
      case "recall":
        this.tone(300, 0.5, "sine", 0.1, 620);
        break;
      case "win":
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.4, "triangle", 0.16, undefined, i * 0.12));
        break;
      case "lose":
        [440, 392, 330, 262].forEach((f, i) => this.tone(f, 0.5, "sawtooth", 0.14, undefined, i * 0.16));
        break;
    }
  }
}

export const sfx = new Sfx();
