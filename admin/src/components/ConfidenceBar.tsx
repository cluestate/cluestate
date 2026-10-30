import React from 'react';

interface ConfidenceBarProps {
  confidence: number;
  showLabel?: boolean;
}

export const ConfidenceBar: React.FC<ConfidenceBarProps> = ({
  confidence,
  showLabel = true,
}) => {
  const percent = Math.round(confidence * 100);
  let level = 'high';
  if (confidence < 0.5) {
    level = 'low';
  } else if (confidence < 0.8) {
    level = 'medium';
  }

  return (
    <div className="confidence-bar" title={`Confidence score: ${percent}%`}>
      <div className="confidence-track">
        <div
          className={`confidence-fill ${level}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel && (
        <span
          className="confidence-value"
          style={{
            color:
              level === 'high'
                ? 'var(--success)'
                : level === 'medium'
                ? 'var(--warning)'
                : 'var(--danger)',
          }}
        >
          {percent}%
        </span>
      )}
    </div>
  );
};
