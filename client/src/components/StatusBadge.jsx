import React from 'react';
import { getPriorityStyles, getStatusStyles } from '../utils/formatters';

export function StatusBadge({ status, className = '' }) {
  const styles = getStatusStyles(status);

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[11px] font-medium border ${styles.bg} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${styles.dot}`} />
      {styles.label}
    </span>
  );
}

export function PriorityBadge({ priority, className = '' }) {
  const styles = getPriorityStyles(priority);

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[11px] font-medium border ${styles.bg} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${styles.dot}`} />
      {styles.label}
    </span>
  );
}
