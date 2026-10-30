export function formatDate(dateString) {
  if (!dateString) return 'Not specified';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (e) {
    return dateString;
  }
}

/**
 * Format a Date object or ISO string into localized date & time
 * Uses the user's local timezone consistently.
 * e.g. "Oct 30, 2026, 03:15:00 PM"
 */
export function formatDateTime(dateInput) {
  if (!dateInput) return '';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch (_) {
    return String(dateInput);
  }
}

/**
 * Format a Date object into HTML5 datetime-local string (YYYY-MM-DDTHH:mm)
 * preserving user's local timezone for `<input type="datetime-local" />`
 */
export function toDateTimeLocalString(dateInput) {
  if (!dateInput) return '';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch (_) {
    return '';
  }
}

/**
 * Compute live countdown strictly in DD:HH:MM:SS format
 * Example: "01:02:45:30" (1 day, 2 hours, 45 mins, 30 secs)
 * Always displays two digits for each unit with leading zeros.
 * If target has passed, isOverdue is true and formatted is the elapsed overdue time.
 */
export function getCountdown(targetDateInput, now = new Date()) {
  if (!targetDateInput) return null;
  const target = new Date(targetDateInput);
  if (isNaN(target.getTime())) return null;

  const diffMs = target.getTime() - now.getTime();
  const isOverdue = diffMs < 0;
  const absDiffSec = Math.floor(Math.abs(diffMs) / 1000);

  const days = Math.floor(absDiffSec / 86400);
  const hours = Math.floor((absDiffSec % 86400) / 3600);
  const minutes = Math.floor((absDiffSec % 3600) / 60);
  const seconds = absDiffSec % 60;

  const formatted = [
    String(days).padStart(2, '0'),
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':');

  return {
    formatted,
    isOverdue,
    totalMsRemaining: diffMs,
    days,
    hours,
    minutes,
    seconds,
  };
}

export function formatTimeAgo(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  } catch (e) {
    return '';
  }
}

/**
 * Check if a task is overdue based on dueDateTime, status, and deadline string
 */
export function checkIsOverdue(taskOrDeadline, status) {
  if (typeof taskOrDeadline === 'object' && taskOrDeadline !== null) {
    if (taskOrDeadline.status === 'Completed') return false;
    if (taskOrDeadline.dueDateTime) {
      return new Date(taskOrDeadline.dueDateTime).getTime() < Date.now();
    }
    return checkIsOverdue(taskOrDeadline.deadline, taskOrDeadline.status);
  }

  const deadline = taskOrDeadline;
  if (!deadline || status === 'Completed' || deadline.toLowerCase() === 'not specified') {
    return false;
  }

  const parsed = new Date(deadline);
  if (!isNaN(parsed.getTime())) {
    return parsed.getTime() < Date.now();
  }

  if (/yesterday|past|overdue/i.test(deadline)) {
    return true;
  }

  return false;
}

export function getPriorityStyles(priority) {
  switch ((priority || '').toLowerCase()) {
    case 'high':
      return {
        bg: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]',
        dot: 'bg-[#B91C1C]',
        label: 'High',
      };
    case 'medium':
      return {
        bg: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
        dot: 'bg-[#B45309]',
        label: 'Medium',
      };
    case 'low':
      return {
        bg: 'bg-[#F0F3F8] text-[#172033] border-[#DCE2EB]',
        dot: 'bg-[#8F9CAE]',
        label: 'Low',
      };
    default:
      return {
        bg: 'bg-[#F0F3F8] text-[#172033] border-[#DCE2EB]',
        dot: 'bg-[#8F9CAE]',
        label: priority || 'Normal',
      };
  }
}

export function getStatusStyles(status) {
  switch ((status || '').toLowerCase()) {
    case 'completed':
      return {
        bg: 'bg-[#ECFDF5] text-[#15803D] border-[#A7F3D0]',
        dot: 'bg-[#15803D]',
        label: 'Completed',
      };
    case 'in progress':
      return {
        bg: 'bg-[#EEF2FF] text-[#3730A3] border-[#C7D2FE]',
        dot: 'bg-[#5145CD]',
        label: 'In Progress',
      };
    case 'pending':
    default:
      return {
        bg: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
        dot: 'bg-[#B45309]',
        label: 'Pending',
      };
  }
}

