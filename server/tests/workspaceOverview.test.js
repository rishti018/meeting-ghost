import mongoose from 'mongoose';
import { connectToDatabase, isDbConnected } from '../config/db.js';
import { getDashboardAnalytics } from '../services/meetingService.js';
import { Meeting } from '../models/Meeting.js';
import { Task } from '../models/Task.js';

async function run() {
  console.log('\n======================================================');
  console.log('📊 VERIFYING WORKSPACE OVERVIEW API & DB INTEGRATION');
  console.log('======================================================\n');

  // 1. Connect to Database
  console.log('--- 1. Testing Live Database Connectivity ---');
  await connectToDatabase();
  const dbConnected = isDbConnected();
  console.log('Database Connected Status:', dbConnected);
  if (!dbConnected) {
    throw new Error('Database is not connected to MongoDB Atlas');
  }
  console.log('✔ MongoDB Atlas connection verified successfully!\n');

  // 2. Fetch live metrics via getDashboardAnalytics
  console.log('--- 2. Fetching Workspace Overview Metrics ---');
  const startMs = Date.now();
  const stats = await getDashboardAnalytics();
  const durationMs = Date.now() - startMs;
  console.log(`Retrieved workspace overview in ${durationMs}ms`);

  // Verify structure
  if (typeof stats.totalMeetings !== 'number') throw new Error('Missing totalMeetings');
  if (typeof stats.totalTasks !== 'number') throw new Error('Missing totalTasks');
  if (typeof stats.pendingTasks !== 'number') throw new Error('Missing pendingTasks');
  if (typeof stats.inProgressTasks !== 'number') throw new Error('Missing inProgressTasks');
  if (typeof stats.completedTasks !== 'number') throw new Error('Missing completedTasks');
  if (typeof stats.completionRate !== 'number') throw new Error('Missing completionRate');
  if (typeof stats.totalDecisions !== 'number') throw new Error('Missing totalDecisions');
  if (!Array.isArray(stats.topOwners)) throw new Error('topOwners is not an array');
  if (!Array.isArray(stats.recentMeetings)) throw new Error('recentMeetings is not an array');
  if (!stats.priorityBreakdown) throw new Error('priorityBreakdown is missing');
  if (!stats.statusBreakdown) throw new Error('statusBreakdown is missing');

  console.log('Live Analytics Data Summary:');
  console.log({
    totalMeetings: stats.totalMeetings,
    totalTasks: stats.totalTasks,
    openTasks: stats.openTasks,
    pendingTasks: stats.pendingTasks,
    inProgressTasks: stats.inProgressTasks,
    completedTasks: stats.completedTasks,
    completionRate: `${stats.completionRate}%`,
    totalDecisions: stats.totalDecisions,
    recentMeetingsCount: stats.recentMeetings.length,
    topOwnersCount: stats.topOwners.length,
  });
  console.log('✔ Structure and data types validated successfully!\n');

  // 3. Verify counts directly against actual MongoDB collections
  console.log('--- 3. Reconciling Against MongoDB Atlas Records ---');
  const [actualMeetingCount, actualTotalTasks, actualPendingTasks] = await Promise.all([
    Meeting.countDocuments({}),
    Task.countDocuments({}),
    Task.countDocuments({ status: 'Pending' }),
  ]);

  console.log('Reconciliation Check:');
  console.log(`- Meetings: DB has ${actualMeetingCount}, Overview reports ${stats.totalMeetings}`);
  console.log(`- Total Tasks: DB has ${actualTotalTasks}, Overview reports ${stats.totalTasks}`);
  console.log(`- Pending Tasks: DB has ${actualPendingTasks}, Overview reports ${stats.pendingTasks}`);

  if (stats.totalMeetings !== actualMeetingCount) {
    throw new Error(`Meeting count mismatch: DB has ${actualMeetingCount}, stats has ${stats.totalMeetings}`);
  }
  if (stats.totalTasks !== actualTotalTasks) {
    throw new Error(`Total tasks count mismatch: DB has ${actualTotalTasks}, stats has ${stats.totalTasks}`);
  }
  if (stats.pendingTasks !== actualPendingTasks) {
    throw new Error(`Pending tasks count mismatch: DB has ${actualPendingTasks}, stats has ${stats.pendingTasks}`);
  }
  console.log('✔ Direct database reconciliation passed with 100% precision!\n');

  // 4. Test Edge Cases: Missing optional fields and empty lists
  console.log('--- 4. Testing Edge Cases & Defensive Transformations ---');
  for (const rm of stats.recentMeetings) {
    if (!rm.id) throw new Error('Recent meeting missing id');
    if (!rm.title) throw new Error('Recent meeting missing title');
    if (!rm.date) throw new Error('Recent meeting missing date');
    if (typeof rm.actionCount !== 'number') throw new Error('Recent meeting actionCount is not a number');
    if (typeof rm.decisionCount !== 'number') throw new Error('Recent meeting decisionCount is not a number');
  }
  console.log('✔ All recent meetings sanitized with valid required attributes!\n');

  console.log('🎉 ALL WORKSPACE OVERVIEW TESTS PASSED 100%!\n');
}

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Test Failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });

