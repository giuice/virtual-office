import { cn } from '@/lib/utils';

// Waveform drawing shared by the composer (live recording and preview, T16)
// and the feed player (T18).

/** Bars of a waveform, oldest/first on the left; decorative (a timer or progress bar carries the information). */
export function WaveformBars({
  levels,
  barCount,
  className,
  testId,
}: {
  levels: readonly number[];
  barCount: number;
  className?: string;
  testId?: string;
}) {
  const padded = levels.length >= barCount ? levels.slice(-barCount) : [...Array(barCount - levels.length).fill(0), ...levels];
  const maxLevel = levels.reduce((max, level) => Math.max(max, level), 0);
  return (
    <div
      aria-hidden="true"
      className={cn('flex h-6 min-w-0 flex-1 items-center gap-px overflow-hidden', className)}
      data-testid={testId}
      data-level-count={levels.length}
      data-max-level={maxLevel.toFixed(3)}
    >
      {padded.map((level, index) => (
        <span
          key={index}
          className="w-0.5 shrink-0 rounded-full bg-current"
          style={{ height: `${Math.max(8, Math.round(level * 100))}%` }}
        />
      ))}
    </div>
  );
}

/**
 * A stored waveform as exactly `count` bars: the peak of each group when it
 * has more samples, the nearest sample when it has fewer, so the bars always
 * span the whole note (bar i covers the same share of the time as of the width).
 */
export function fitWaveform(waveform: readonly number[], count: number): number[] {
  if (waveform.length === 0) return Array.from({ length: count }, () => 0);
  if (waveform.length <= count) {
    return Array.from({ length: count }, (_, bar) => waveform[Math.floor((bar * waveform.length) / count)]);
  }
  return Array.from({ length: count }, (_, bar) => {
    const start = Math.floor((bar * waveform.length) / count);
    const end = Math.floor(((bar + 1) * waveform.length) / count);
    return Math.max(...waveform.slice(start, Math.max(end, start + 1)));
  });
}
