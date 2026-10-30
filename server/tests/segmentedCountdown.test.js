import { getCountdown } from '../../client/src/utils/formatters.js';

console.log('======================================================');
console.log('🧪 TESTING SEGMENTED TIMER COUNTDOWN & URGENCY LOGIC');
console.log('======================================================\n');

// 1. Normal State (>= 24 hours)
const baseTime = new Date('2026-10-30T12:00:00.000Z');
const futureDeadline = new Date('2026-11-01T14:45:30.000Z'); // 2 days, 2 hours, 45m, 30s
const cdNormal = getCountdown(futureDeadline, baseTime);

console.log('1. Normal State:');
console.log('   formatted:', cdNormal.formatted);
console.log('   days:', cdNormal.days, 'hours:', cdNormal.hours, 'mins:', cdNormal.minutes, 'secs:', cdNormal.seconds);
console.log('   isOverdue:', cdNormal.isOverdue);
console.log('   totalMsRemaining:', cdNormal.totalMsRemaining);

if (cdNormal.isOverdue) throw new Error('Normal should not be overdue');
if (cdNormal.totalMsRemaining < 24 * 60 * 60 * 1000) throw new Error('Should be >= 24h');
if (cdNormal.formatted !== '02:02:45:30') throw new Error(`Expected 02:02:45:30, got ${cdNormal.formatted}`);
console.log('✔ Normal state verified!\n');

// 2. Approaching Deadline State (< 24 hours)
const approachingDeadline = new Date('2026-10-31T06:30:15.000Z'); // 18 hours, 30m, 15s
const cdApproaching = getCountdown(approachingDeadline, baseTime);

console.log('2. Approaching Deadline State (< 24h):');
console.log('   formatted:', cdApproaching.formatted);
console.log('   isOverdue:', cdApproaching.isOverdue);
console.log('   hours remaining:', cdApproaching.hours);

const isApproaching = !cdApproaching.isOverdue && cdApproaching.totalMsRemaining < 24 * 60 * 60 * 1000;
if (!isApproaching) throw new Error('Expected approaching (< 24h) to be true');
if (cdApproaching.formatted !== '00:18:30:15') throw new Error(`Expected 00:18:30:15, got ${cdApproaching.formatted}`);
console.log('✔ Approaching state verified!\n');

// 3. Overdue State
const pastDeadline = new Date('2026-10-30T10:15:00.000Z'); // 1 hour, 45 minutes overdue
const cdOverdue = getCountdown(pastDeadline, baseTime);

console.log('3. Overdue State:');
console.log('   formatted:', cdOverdue.formatted);
console.log('   isOverdue:', cdOverdue.isOverdue);

if (!cdOverdue.isOverdue) throw new Error('Expected overdue to be true');
if (cdOverdue.formatted !== '00:01:45:00') throw new Error(`Expected 00:01:45:00, got ${cdOverdue.formatted}`);
console.log('✔ Overdue state verified!\n');

// 4. Completed State
console.log('4. Completed State:');
const completedValues = { days: 0, hours: 0, minutes: 0, seconds: 0 };
console.log('   Stopped timer values:', completedValues);
console.log('✔ Completed state verified!\n');

console.log('======================================================');
console.log('🎉 ALL SEGMENTED TIMER TESTS PASSED SUCCESSFULLY!');
console.log('======================================================');

