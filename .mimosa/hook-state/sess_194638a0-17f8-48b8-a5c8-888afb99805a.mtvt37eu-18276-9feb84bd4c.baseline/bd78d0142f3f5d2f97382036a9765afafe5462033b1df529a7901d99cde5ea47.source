"use client";

import styles from "./HintLadderControls.module.css";

interface HintLadderControlsProps {
  hintLevel: number;
  maxLevel?: number;
  isStreaming: boolean;
  onNextHint: () => void;
}

export default function HintLadderControls({
  hintLevel,
  maxLevel = 3,
  isStreaming,
  onNextHint,
}: HintLadderControlsProps) {
  const segments = Array.from({ length: maxLevel }, (_, i) => i + 1);

  return (
    <div className={styles.wrapper}>
      <div className={styles.progress} aria-label={`Hint level ${hintLevel} of ${maxLevel}`}>
        {segments.map((level) => (
          <div
            key={level}
            className={`${styles.segment} ${level <= hintLevel ? styles.filled : ""}`}
          />
        ))}
      </div>
      <span className={styles.levelLabel}>
        level {Math.min(hintLevel, maxLevel)}
        {hintLevel > maxLevel ? "+" : ""}
      </span>
      <button
        type="button"
        className={styles.nextBtn}
        onClick={onNextHint}
        disabled={isStreaming || hintLevel >= maxLevel + 1}
        title={hintLevel >= maxLevel ? "Full explanation unlocked" : "Request next hint"}
      >
        Next hint →
      </button>
    </div>
  );
}

