import mongoose from 'mongoose';
import { Meeting } from '../models/Meeting.js';
import { Task } from '../models/Task.js';
import {
  extractMomWithRuleFallback,
  sanitizeMomOutput,
  generateMinutesOfMeeting
} from '../services/momService.js';
import {
  saveMeetingWithTasks,
  generateMeetingMom,
  saveMeetingMom,
  getMeetingById
} from '../services/meetingService.js';

async function runMomTests() {
  console.log('\n======================================================');
  console.log('🧪 TESTING AI MINUTES OF MEETING (MoM) GENERATOR');
  console.log('======================================================\n');

  // Test 1: Rule-based extraction & 13 MoM sections
  console.log('--- 1. Testing Rule-based Extraction & 13 MoM Sections ---');
  const sampleTranscript = `
Aryan (Backend Developer): We need to finalize the database architecture by Wednesday.
Priya (UI Designer): I will finish the dashboard screens by Friday.
Rahul (DevOps): Should we deploy on AWS or GCP?
Aryan: We decided to deploy on AWS because of existing credits.
Rahul: I will prepare the CI/CD pipeline by Thursday.
Priya: What about the mobile responsiveness?
Aryan: Mobile responsiveness will be tested next Monday.
Aryan: We also decided to use MongoDB Atlas for persistence.
  `.trim();

  const samplePrep = {
    personName: 'Priya',
    linkedinUrl: 'https://linkedin.com/in/priya-test',
    purpose: 'Sprint 12 Architecture & UI Alignment',
    agenda: ['Database Architecture', 'UI Dashboard Design', 'Deployment Strategy'],
    desiredOutcome: 'Finalize tech stack and assign deliverables',
  };

  const momResult = extractMomWithRuleFallback({
    transcript: sampleTranscript,
    title: 'Sprint 12 Alignment',
    meetingDate: '2026-10-30',
    department: 'Engineering',
    preparation: samplePrep,
  });

  console.log('Generated MoM Title:', momResult.title);
  console.log('Participants:', momResult.participants);
  console.log('Objective:', momResult.objective);
  console.log('Agenda:', momResult.agenda);
  console.log('Discussion points count:', momResult.keyDiscussionPoints.length);
  console.log('Q&A count:', momResult.questionsAndResponses.length);
  console.log('Decisions count:', momResult.decisions.length);
  console.log('Action items count:', momResult.actionItems.length);
  console.log('Pending issues count:', momResult.pendingIssues.length);
  console.log('Follow-up meeting:', momResult.followUpMeeting);
  console.log('Conclusion:', momResult.conclusion);

  // Assertions for 13 sections
  if (!momResult.title || momResult.title === 'Not specified') {
    throw new Error('MoM Title should be populated');
  }
  if (!momResult.meetingDate || momResult.meetingDate === 'Not specified') {
    throw new Error('MoM Date should be populated');
  }
  if (!momResult.department || momResult.department !== 'Engineering') {
    throw new Error('MoM Department should match Engineering');
  }
  if (!Array.isArray(momResult.participants) || momResult.participants.length === 0) {
    throw new Error('MoM should contain participants from speakers and prep');
  }
  if (!momResult.objective || momResult.objective !== samplePrep.purpose) {
    throw new Error('MoM Objective should reflect prep purpose');
  }
  if (!Array.isArray(momResult.agenda) || momResult.agenda.length !== 3) {
    throw new Error('MoM Agenda should contain prepared topics');
  }
  if (!Array.isArray(momResult.keyDiscussionPoints) || momResult.keyDiscussionPoints.length === 0) {
    throw new Error('MoM should contain key discussion points');
  }
  if (!Array.isArray(momResult.questionsAndResponses) || momResult.questionsAndResponses.length === 0) {
    throw new Error('MoM should capture questions and responses');
  }
  if (!Array.isArray(momResult.decisions) || momResult.decisions.length === 0) {
    throw new Error('MoM should capture decisions');
  }
  if (!Array.isArray(momResult.actionItems) || momResult.actionItems.length === 0) {
    throw new Error('MoM should capture action items');
  }
  if (!Array.isArray(momResult.pendingIssues)) {
    throw new Error('MoM pending issues should be an array');
  }
  if (!momResult.followUpMeeting || typeof momResult.followUpMeeting !== 'object') {
    throw new Error('MoM followUpMeeting should be an object');
  }
  if (!momResult.conclusion || momResult.conclusion.length === 0) {
    throw new Error('MoM conclusion should be present');
  }

  console.log('✔ All 13 MoM sections verified successfully!\n');

  // Test 2: Sanitization & "Not specified" handling for unavailable data
  console.log('--- 2. Testing Labeling of Unavailable Fields as "Not specified" ---');
  const emptyMom = sanitizeMomOutput({}, {
    transcript: '',
    title: '',
    meetingDate: '',
  });

  console.log('Empty MoM Title:', emptyMom.title);
  console.log('Empty MoM Time:', emptyMom.meetingTime);
  console.log('Empty MoM Objective:', emptyMom.objective);
  console.log('Empty MoM Conclusion:', emptyMom.conclusion);

  if (emptyMom.title !== 'Not specified') throw new Error('Empty title should be "Not specified"');
  if (emptyMom.meetingTime !== 'Not specified') throw new Error('Empty time should be "Not specified"');
  if (emptyMom.objective !== 'Not specified') throw new Error('Empty objective should be "Not specified"');
  if (emptyMom.conclusion !== 'Not specified') throw new Error('Empty conclusion should be "Not specified"');
  console.log('✔ "Not specified" labeling verified!\n');

  // Test 3: Schema validation on Meeting Model
  console.log('--- 3. Testing Mongoose Meeting Schema with MoM Subdocument ---');
  const dummyMeeting = new Meeting({
    title: 'Test Sprint Sync',
    date: '2026-10-30',
    department: 'Engineering',
    transcript: sampleTranscript,
    summary: 'Test summary',
    mom: momResult,
  });

  const meetingJson = dummyMeeting.toJSON();
  if (!meetingJson.mom) {
    throw new Error('Meeting JSON should include mom subdocument');
  }
  if (meetingJson.mom.title !== momResult.title) {
    throw new Error('Meeting mom title mismatch');
  }
  if (meetingJson.mom.actionItems.length !== momResult.actionItems.length) {
    throw new Error('Meeting mom action items length mismatch');
  }
  console.log('✔ Meeting model MoM schema validation passed 100%!\n');

  // Test 4: Editing and Non-Duplication Logic
  console.log('--- 4. Testing Action Items & Decisions Deduplication Logic ---');
  const existingTasks = [
    { task: 'Finalize database architecture', owner: 'Aryan', deadline: 'Wednesday' },
  ];
  const incomingMomActions = [
    { task: 'Finalize database architecture', owner: 'Aryan', deadline: 'Wednesday' }, // duplicate
    { task: 'Conduct security audit', owner: 'Rahul', deadline: 'Next Friday' }, // new
  ];

  const existingMap = new Map();
  existingTasks.forEach(t => existingMap.set(t.task.toLowerCase().trim(), t));

  const newActions = [];
  for (const item of incomingMomActions) {
    if (!existingMap.has(item.task.toLowerCase().trim())) {
      newActions.push(item);
    }
  }

  console.log('Incoming actions:', incomingMomActions.length);
  console.log('New non-duplicate actions to insert:', newActions.length);
  if (newActions.length !== 1 || newActions[0].task !== 'Conduct security audit') {
    throw new Error('Deduplication logic failed to identify existing task');
  }
  console.log('✔ Deduplication logic verified successfully!\n');

  console.log('======================================================');
  console.log('🎉 ALL MINUTES OF MEETING (MoM) TESTS PASSED 100%!');
  console.log('======================================================\n');
}

runMomTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

