import React from 'react';

/**
 * CircularProgressRing Component
 *
 * Visual circular progress ring with centered percentage or '—'.
 *
 * Color scales:
 * - 0–39%: muted blue
 * - 40–79%: amber
 * - 80–99%: green
 * - 100%: completed green
 * - Unavailable / unlinked: muted neutral with '—'
 */
export function CircularProgressRing({
  percentage = null,
  label = null,
  size = 40,
  strokeWidth = 3.5,
  detail = '',
  source = '',
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const hasValue = typeof percentage === 'number' && !isNaN(percentage);
  const clamped = hasValue ? Math.min(100, Math.max(0, percentage)) : 0;
  const strokeDashoffset = hasValue ? circumference - (clamped / 100) * circumference : circumference;

  let strokeColor = '#CBD5E1';
  let textColor = '#64748B';
  let trackColor = '#E2E8F0';
  let badgeBorder = '#E2E8F0';

  if (!hasValue) {
    // Unavailable / unlinked
    strokeColor = '#CBD5E1';
    textColor = '#94A3B8';
    trackColor = '#F1F5F9';
    badgeBorder = '#E2E8F0';
  } else if (clamped === 100) {
    // 100%: Completed green
    strokeColor = '#10B981';
    textColor = '#047857';
    trackColor = '#D1FAE5';
    badgeBorder = '#A7F3D0';
  } else if (clamped >= 80) {
    // 80–99%: Green
    strokeColor = '#22C55E';
    textColor = '#15803D';
    trackColor = '#DCFCE7';
    badgeBorder = '#BBF7D0';
  } else if (clamped >= 40) {
    // 40–79%: Amber
    strokeColor = '#F59E0B';
    textColor = '#B45309';
    trackColor = '#FEF3C7';
    badgeBorder = '#FDE68A';
  } else {
    // 0–39%: Muted blue
    strokeColor = '#60A5FA';
    textColor = '#2563EB';
    trackColor = '#DBEAFE';
    badgeBorder = '#BFDBFE';
  }

  const displayText = hasValue ? `${clamped}%` : (label || '—');

  return (
    <div
      className="inline-flex flex-col items-center justify-center group relative cursor-help"
      title={detail ? `${detail} (${displayText})` : displayText}
    >
      <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress Stroke */}
          {hasValue && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-500 ease-out"
            />
          )}
        </svg>

        {/* Centered Percentage / Dash */}
        <span
          className="absolute text-[10px] font-bold tracking-tight select-none font-mono"
          style={{ color: textColor }}
        >
          {displayText}
        </span>
      </div>
    </div>
  );
}

export default CircularProgressRing;

