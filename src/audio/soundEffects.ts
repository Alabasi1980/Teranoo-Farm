class FarmSoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType,
    gainPeak: number,
    delaySec = 0,
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const jitter = 0.96 + Math.random() * 0.08;

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd * jitter), now + durationSec);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  public playPlant(): void {
    this.playTone(190, 120, 0.11, 'triangle', 0.14, 0);
    this.playTone(280, 340, 0.09, 'sine', 0.08, 0.04);
  }

  public playWater(): void {
    this.playTone(360, 560, 0.14, 'sine', 0.11, 0);
    this.playTone(480, 720, 0.15, 'sine', 0.09, 0.06);
    this.playTone(620, 880, 0.12, 'triangle', 0.06, 0.12);
  }

  public playHarvest(): void {
    this.playTone(523.25, 523.25, 0.12, 'triangle', 0.14, 0);
    this.playTone(659.25, 659.25, 0.13, 'triangle', 0.14, 0.07);
    this.playTone(783.99, 1046.5, 0.22, 'sine', 0.15, 0.14);
  }

  public playCoin(): void {
    this.playTone(987.77, 1318.5, 0.1, 'sine', 0.12, 0);
    this.playTone(1318.5, 1567.98, 0.16, 'sine', 0.1, 0.06);
  }

  public playError(): void {
    this.playTone(210, 150, 0.14, 'sawtooth', 0.06, 0);
  }
}

export const soundEngine = new FarmSoundEngine();
