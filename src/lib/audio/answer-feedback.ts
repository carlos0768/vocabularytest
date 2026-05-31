type AnswerFeedback = 'correct' | 'wrong';

type WindowWithWebkitAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const AudioContextConstructor =
    window.AudioContext ?? (window as WindowWithWebkitAudioContext).webkitAudioContext;
  if (!AudioContextConstructor) return null;

  if (!sharedContext || sharedContext.state === 'closed') {
    sharedContext = new AudioContextConstructor();
  }

  return sharedContext;
}

function scheduleTone(
  context: AudioContext,
  startTime: number,
  duration: number,
  frequency: number,
  type: OscillatorType,
  volume: number,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const endTime = startTime + duration;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(endTime + 0.025);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}

async function playFeedback(feedback: AnswerFeedback): Promise<void> {
  const context = getAudioContext();
  if (!context) return;

  if (context.state === 'suspended') {
    await context.resume();
  }

  const now = context.currentTime + 0.01;
  if (feedback === 'correct') {
    scheduleTone(context, now, 0.09, 660, 'triangle', 0.075);
    scheduleTone(context, now + 0.085, 0.13, 880, 'triangle', 0.07);
    return;
  }

  scheduleTone(context, now, 0.11, 220, 'sine', 0.07);
  scheduleTone(context, now + 0.095, 0.16, 165, 'sine', 0.065);
}

export function playAnswerFeedbackSound(isCorrect: boolean): void {
  void playFeedback(isCorrect ? 'correct' : 'wrong').catch(() => {
    // Browsers can reject audio playback when the context is not user-activated.
  });
}
