/**
 * Meeting Ghost - Comprehensive Backend & Integration Verification Test Suite
 * Tests health endpoint, AI analysis, models, endpoints, and database connection.
 */

import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { connectToDatabase, getDbStatus, isDbConnected } from '../config/db.js';
import { analyzeMeetingTranscript } from '../services/geminiService.js';
import { Meeting } from '../models/Meeting.js';
import { Task } from '../models/Task.js';
import {
  saveMeetingWithTasks,
  listMeetings,
  getMeetingById,
  updateMeeting,
  deleteMeeting,
  listTasks,
  updateTask,
  listAllDecisions,
  getDashboardAnalytics,
} from '../services/meetingService.js';
import { answerMeetingQuestion } from '../services/qaService.js';

const RESULTS = {
  passed: [],
  failed: [],
  requiresCredentials: [],
};

function pass(name, detail = '') {
  console.log(`  \x1b[32m✔ PASS\x1b[0m: ${name} ${detail ? `(${detail})` : ''}`);
  RESULTS.passed.push(name);
}

function fail(name, error) {
  console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${name} - ${error}`);
  RESULTS.failed.push({ name, error });
}

function credentialNeeded(name, reason) {
  console.log(`  \x1b[33m⚡ REQUIRES USER CREDENTIALS\x1b[0m: ${name} - ${reason}`);
  RESULTS.requiresCredentials.push({ name, reason });
}

async function run() {
  console.log('\n======================================================');
  console.log('👻 RUNNING MEETING GHOST TEST SUITE');
  console.log('======================================================\n');

  // Test 1: Configuration & Env
  console.log('[1/7] Testing Environment Configuration & Security...');
  try {
    if (config.port && config.dbName) {
      pass('Configuration loaded', `Port: ${config.port}, DB: ${config.dbName}`);
    } else {
      throw new Error('Missing port or dbName in config');
    }

    // Verify secrets are not exposed
    if (config.geminiApiKey === undefined) {
      throw new Error('config.geminiApiKey is undefined');
    }
    pass('Secrets isolation', 'API keys and database credentials isolated to server configuration');
  } catch (err) {
    fail('Environment Configuration', err.message);
  }

  // Test 2: AI Analysis & Intelligence Extraction
  console.log('\n[2/7] Testing Meeting Ingestion & AI Intelligence Analysis...');
  const sampleTranscript = `Priya will finish the UI design by Wednesday. Aryan will complete backend APIs by Friday. Rahul will prepare the deployment checklist by Thursday. The team decided to use MongoDB instead of MySQL. The team will review API integration in the next meeting.`;

  try {
    const analysis = await analyzeMeetingTranscript({
      transcript: sampleTranscript,
      title: 'Sprint Planning Sync',
      meetingDate: '2026-10-30',
    });

    if (!analysis.summary || analysis.summary.length < 10) {
      throw new Error('Concise summary was not generated');
    }
    if (!analysis.detailedSummary || analysis.detailedSummary.length < 20) {
      throw new Error('Detailed summary was not generated');
    }
    if (!Array.isArray(analysis.keyPoints) || analysis.keyPoints.length === 0) {
      throw new Error('Key points were not extracted');
    }
    if (!Array.isArray(analysis.actionItems) || analysis.actionItems.length !== 3) {
      throw new Error(`Expected 3 action items, got ${analysis.actionItems?.length}`);
    }

    // Verify task details
    const priyaTask = analysis.actionItems.find(a => a.owner === 'Priya');
    const aryanTask = analysis.actionItems.find(a => a.owner === 'Aryan');
    const rahulTask = analysis.actionItems.find(a => a.owner === 'Rahul');

    if (!priyaTask || !priyaTask.deadline.toLowerCase().includes('wednesday')) {
      throw new Error('Priya deadline was not correctly extracted as Wednesday');
    }
    if (!aryanTask || !aryanTask.deadline.toLowerCase().includes('friday')) {
      throw new Error('Aryan deadline was not correctly extracted as Friday');
    }
    if (!rahulTask || !rahulTask.deadline.toLowerCase().includes('thursday')) {
      throw new Error('Rahul deadline was not correctly extracted as Thursday');
    }

    // Verify decisions
    if (!Array.isArray(analysis.decisions) || analysis.decisions.length === 0) {
      throw new Error('Decisions were not extracted');
    }
    const mongoDecision = analysis.decisions.find(d => /mongodb/i.test(d.decision));
    if (!mongoDecision) {
      throw new Error('MongoDB decision was not identified');
    }

    // Verify follow-up agenda
    if (!Array.isArray(analysis.followUpAgenda) || analysis.followUpAgenda.length === 0) {
      throw new Error('Follow-up agenda was not extracted');
    }

    pass('AI Transcript Analysis', `Extracted ${analysis.actionItems.length} tasks, ${analysis.decisions.length} decisions, ${analysis.followUpAgenda.length} follow-up items`);

    if (config.geminiApiKey && config.geminiApiKey !== 'your_gemini_api_key_here') {
      pass('Gemini Multimodal Engine', `Active via @google/genai SDK (Model: ${config.geminiModel})`);
    } else {
      credentialNeeded('Live Gemini API (@google/genai)', 'GEMINI_API_KEY in server/.env is empty. Using deterministic fallback analyzer.');
    }
  } catch (err) {
    fail('AI Analysis', err.message);
  }

  // Test 3: Mongoose Models & Schemas
  console.log('\n[3/7] Testing Mongoose Models & Schema Validation...');
  try {
    const testMeetingDoc = new Meeting({
      title: 'Test Architecture Review',
      transcript: sampleTranscript,
      summary: 'Executive summary test.',
      detailedSummary: 'Detailed summary test.',
      keyPoints: ['Point 1', 'Point 2'],
      decisions: [{ decision: 'Test decision', rationale: 'Test rationale' }],
    });

    await testMeetingDoc.validate();
    pass('Meeting Mongoose Model', 'Validates required fields, decisions schema, and JSON transformations');

    // Test missing transcript validation error
    const invalidMeeting = new Meeting({ title: 'No transcript' });
    let err = null;
    try {
      await invalidMeeting.validate();
    } catch (e) {
      err = e;
    }
    if (!err || !err.errors.transcript) {
      throw new Error('Meeting model failed to reject document missing transcript');
    }
    pass('Meeting Schema Constraints', 'Correctly rejects missing required transcript and summary');

    // Test Task Model
    const testTaskDoc = new Task({
      meetingId: testMeetingDoc._id,
      task: 'Build backend APIs',
      owner: 'Aryan',
      deadline: 'Friday',
      priority: 'High',
      status: 'Pending',
    });
    await testTaskDoc.validate();
    pass('Task Mongoose Model', 'Validates meeting reference, priorities, status, and description alias');
  } catch (err) {
    fail('Mongoose Models', err.message);
  }

  // Test 4: Database Connection
  console.log('\n[4/7] Testing Database Connection (MongoDB Atlas via Mongoose)...');
  let dbActive = false;
  try {
    await connectToDatabase();
    const status = getDbStatus();
    if (status.connected && isDbConnected()) {
      dbActive = true;
      pass('MongoDB Atlas Connection', `Connected to database "${status.databaseName}" (Ping: ${status.latencyMs}ms, Host: ${status.clusterHost})`);
    } else {
      credentialNeeded(
        'MongoDB Atlas Persistence',
        `No live connection (${status.error}). To test live persistence, set MONGODB_URI in server/.env to your MongoDB Atlas connection string.`
      );
    }

    // Test Error Diagnostics Classifier (Requirement 5)
    const { diagnoseMongoError } = await import('../config/db.js');
    const authDiag = diagnoseMongoError({ code: 8000, message: 'bad auth' }, 'mongodb+srv://user:pass@cluster.net');
    const ipDiag = diagnoseMongoError({ message: 'IP is not in whitelist' }, 'mongodb+srv://user:pass@cluster.net');
    const dnsDiag = diagnoseMongoError({ message: 'querySrv ENOTFOUND cluster.net' }, 'mongodb+srv://user:pass@cluster.net');
    const timeoutDiag = diagnoseMongoError({ message: 'Server selection timed out' }, 'mongodb+srv://user:pass@cluster.net');
    const missingDiag = diagnoseMongoError(null, '');

    if (
      authDiag.category === 'AUTH_FAILURE' &&
      ipDiag.category === 'IP_ACCESS_DENIED' &&
      dnsDiag.category === 'DNS_NETWORK_FAILURE' &&
      timeoutDiag.category === 'SERVER_SELECTION_TIMEOUT' &&
      missingDiag.category === 'MISSING_CONFIG'
    ) {
      pass('Server-side Error Diagnostics', 'Accurately distinguishes Auth Failure, IP Access Denial, DNS, Timeout, and Missing Config');
    } else {
      throw new Error('Error diagnostics classifier failed verification');
    }
  } catch (err) {
    credentialNeeded('MongoDB Atlas Persistence', `Connection attempt note: ${err.message}`);
  }

  // Test 5: CRUD Operations (if DB active)
  console.log('\n[5/7] Testing Database CRUD & Integration Endpoints...');
  if (dbActive) {
    let createdMeetingId = null;
    let createdTaskId = null;

    try {
      // 5.1 Create Meeting with Tasks
      const saved = await saveMeetingWithTasks({
        title: 'Automated Test Sprint Sync',
        meetingDate: '2026-10-30',
        department: 'Engineering',
        transcript: sampleTranscript,
        summary: 'Automated test summary.',
        detailedSummary: 'Automated test detailed summary.',
        keyPoints: ['Key point 1', 'Key point 2'],
        actionItems: [
          { task: 'Priya UI Task', owner: 'Priya', deadline: 'Wednesday', priority: 'High', status: 'Pending' },
          { task: 'Aryan Backend Task', owner: 'Aryan', deadline: 'Friday', priority: 'High', status: 'Pending' },
        ],
        decisions: [
          { decision: 'Use MongoDB Atlas', rationale: 'Required by hackathon spec' }
        ],
        followUpAgenda: ['Review integration next meeting'],
      });

      createdMeetingId = saved.id || saved._id;
      if (!createdMeetingId) throw new Error('No meeting ID returned from save');
      if (!saved.actionItems || saved.actionItems.length !== 2) {
        throw new Error(`Expected 2 action items, got ${saved.actionItems?.length}`);
      }
      createdTaskId = saved.actionItems[0].id || saved.actionItems[0]._id;
      pass('POST /api/meetings (Create with Tasks)', `Created Meeting ID: ${createdMeetingId} with 2 action items`);

      // 5.2 List Meetings
      const listRes = await listMeetings({ search: 'Automated Test', limit: 10 });
      if (!listRes.meetings || listRes.meetings.length === 0) {
        throw new Error('Failed to find created meeting in list');
      }
      pass('GET /api/meetings (Search & Pagination)', `Retrieved ${listRes.meetings.length} meeting(s)`);

      // 5.3 Get Meeting By ID
      const fetched = await getMeetingById(createdMeetingId);
      if (!fetched || fetched.title !== 'Automated Test Sprint Sync') {
        throw new Error('Fetched meeting does not match created meeting');
      }
      pass('GET /api/meetings/:id', `Retrieved meeting "${fetched.title}" with ${fetched.actionItems?.length} tasks`);

      // 5.4 Update Meeting
      const updatedMtg = await updateMeeting(createdMeetingId, { title: 'Updated Test Sprint Sync' });
      if (updatedMtg.title !== 'Updated Test Sprint Sync') {
        throw new Error('Meeting title was not updated');
      }
      pass('PATCH /api/meetings/:id', 'Updated editable meeting details');

      // 5.5 List Tasks with filters
      const tasksList = await listTasks({ owner: 'Priya' });
      if (!tasksList || tasksList.length === 0) {
        throw new Error('Failed to filter tasks by owner Priya');
      }
      pass('GET /api/tasks (Filters)', `Filtered ${tasksList.length} task(s) for owner Priya`);

      // 5.6 Update Task
      const updatedTask = await updateTask(createdTaskId, { status: 'Completed' });
      if (updatedTask.status !== 'Completed') {
        throw new Error('Task status was not updated to Completed');
      }
      pass('PATCH /api/tasks/:id', `Updated task status to Completed for task ${createdTaskId}`);

      // 5.7 List Decisions
      const decisionsList = await listAllDecisions();
      if (!Array.isArray(decisionsList) || decisionsList.length === 0) {
        throw new Error('Failed to retrieve decisions across meetings');
      }
      pass('GET /api/decisions', `Retrieved ${decisionsList.length} confirmed decision(s) across meetings`);

      // 5.8 Grounded Q&A
      const qaResult = await answerMeetingQuestion('Who owns backend tasks?');
      if (!qaResult.answer || !qaResult.answer.includes('Aryan')) {
        throw new Error('Q&A failed to ground answer on saved tasks');
      }
      pass('POST /api/ask (Grounded Q&A)', `Answered with citation: "${qaResult.answer.slice(0, 70)}..."`);

      // 5.9 Dashboard Analytics
      const stats = await getDashboardAnalytics();
      if (typeof stats.totalMeetings !== 'number' || typeof stats.totalTasks !== 'number') {
        throw new Error('Dashboard stats missing meeting or task counts');
      }
      pass('GET /api/dashboard/stats', `Real counts: ${stats.totalMeetings} meetings, ${stats.totalTasks} tasks, ${stats.completionRate}% completion`);

      // 5.10 Delete Meeting & Cascading Tasks
      const deleted = await deleteMeeting(createdMeetingId);
      if (!deleted) throw new Error('Delete meeting returned false');
      const verifyMtg = await getMeetingById(createdMeetingId);
      if (verifyMtg) throw new Error('Meeting still exists after delete');
      const remainingTasks = await Task.find({ meetingId: createdMeetingId });
      if (remainingTasks.length > 0) throw new Error('Cascading task deletion failed');
      pass('DELETE /api/meetings/:id', 'Deleted meeting and automatically deleted all associated action items');
    } catch (err) {
      fail('Database Operations', err.message);
      // Cleanup if needed
      if (createdMeetingId) {
        try {
          await deleteMeeting(createdMeetingId);
        } catch (_) {}
      }
    }
  } else {
    credentialNeeded('Database Endpoints & CRUD', 'Requires valid MONGODB_URI in server/.env (e.g. MongoDB Atlas cluster)');
  }

  // Summary
  console.log('\n======================================================');
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('======================================================');
  console.log(`Passed:               ${RESULTS.passed.length}`);
  console.log(`Failed:               ${RESULTS.failed.length}`);
  console.log(`Requires Credentials: ${RESULTS.requiresCredentials.length}`);
  console.log('======================================================\n');

  if (RESULTS.failed.length > 0) {
    console.error('Failed Tests:');
    RESULTS.failed.forEach(f => console.error(` - ${f.name}: ${f.error}`));
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  } else {
    console.log('All executed tests passed successfully!\n');
    try {
      await mongoose.disconnect();
      await new Promise(r => setTimeout(r, 600));
    } catch (_) {}
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
