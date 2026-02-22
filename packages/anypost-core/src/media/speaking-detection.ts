export const SPEAKING_THRESHOLD = 0.05;

export const isSpeaking = (audioLevel: number): boolean =>
  audioLevel >= SPEAKING_THRESHOLD;
