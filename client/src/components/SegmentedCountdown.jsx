import React from 'react';

/**
 * SegmentedCountdown Component
 * 
 * Displays countdown in 4 separate rectangular segments (DD : HH : MM : SS)
 * with labels directly below the numbers and subtle separators.
 * Supports urgency styles:
 * - normal: soft light blue-grey (#E9EDF5, border #D5DDEA, text #263A5A)
 * - approaching (< 24h): subtle amber (#FFFBEB, border #FDE68A, text #92400E)
 * - overdue: subtle red (#FEF2F2, border #FECACA, text #991B1B)
 * - completed: muted green (#F0FDF4, border #BBF7D0, text #166534)
 */

const THEMES = {
  normal: {
    segment: 'bg-[#E9EDF5] border-[#D5DDEA]',
    digit: 'text-[#263A5A]',
    label: 'text-[#526078]',
    separator: 'text-[#8E9CAE]',
  },
  approaching: {
    segment: 'bg-[#FFFBEB] border-[#FDE68A]',
    digit: 'text-[#92400E]',
    label: 'text-[#B45309]',
    separator: 'text-[#D97706]',
  },
  overdue: {
    segment: 'bg-[#FEF2F2] border-[#FECACA]',
    digit: 'text-[#991B1B]',
    label: 'text-[#B91C1C]',
    separator: 'text-[#EF4444]',
  },
  completed: {
    segment: 'bg-[#F0FDF4] border-[#BBF7D0]',
    digit: 'text-[#166534]',
    label: 'text-[#15803D]',
    separator: 'text-[#86EFAC]',
  },
};

function pad(val) {
  const num = typeof val === 'number' ? val : parseInt(val, 10);
  if (isNaN(num)) return '00';
  return String(num).padStart(2, '0');
}

export function SegmentedCountdown({
  days = 0,
  hours = 0,
  minutes = 0,
  seconds = 0,
  variant = 'normal',
  className = '',
}) {
  const theme = THEMES[variant] || THEMES.normal;

  const segments = [
    { value: pad(days), unit: 'DD' },
    { value: pad(hours), unit: 'HH' },
    { value: pad(minutes), unit: 'MM' },
    { value: pad(seconds), unit: 'SS' },
  ];

  return (
    <div
      className={`inline-flex items-center gap-1 select-none ${className}`}
      aria-label={`${pad(days)} days ${pad(hours)} hours ${pad(minutes)} minutes ${pad(seconds)} seconds`}
    >
      {segments.map((seg, idx) => (
        <React.Fragment key={seg.unit}>
          {idx > 0 && (
            <span
              className={`font-mono text-xs font-bold leading-none -mt-2.5 ${theme.separator}`}
              aria-hidden="true"
            >
              :
            </span>
          )}
          <div
            className={`flex flex-col items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded-[4px] border ${theme.segment} shadow-[0_1px_2px_rgba(38,58,90,0.04)]`}
          >
            <span className={`font-mono text-xs font-bold leading-tight ${theme.digit}`}>
              {seg.value}
            </span>
            <span className={`text-[8px] font-semibold uppercase tracking-wider leading-none mt-0.5 ${theme.label}`}>
              {seg.unit}
            </span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

export default SegmentedCountdown;

