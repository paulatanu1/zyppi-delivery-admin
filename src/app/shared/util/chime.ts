let audio: AudioContext | null = null;

/**
 * A short two-note chime made with Web Audio (no sound file). `urgent`
 * plays it three times higher (SOS). Browsers need one click on the page
 * before sound plays.
 */
export function chime(urgent = false): void {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    const notes = urgent ? [1320, 990, 1320, 990, 1320, 990] : [880, 1320];
    for (const [i, f] of notes.entries()) {
      const start = t + i * 0.14;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(urgent ? 0.3 : 0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    }
  } catch {
    // No Web Audio: stay quiet.
  }
}

export function closeChime(): void {
  void audio?.close();
  audio = null;
}
