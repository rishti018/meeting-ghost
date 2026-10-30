import mongoose from 'mongoose';
import { connectToDatabase } from '../config/db.js';
import { Meeting } from '../models/Meeting.js';
import { saveMeetingWithTasks, getMeetingById, deleteMeeting } from '../services/meetingService.js';
import { analyzeCopilotProgress, generateCopilotFallback } from '../services/copilotService.js';

async function run() {
  console.log('\n======================================================');
  console.log('🤖 TESTING MEETING GHOST: OPTIONAL PREP & LIVE CO-PILOT');
  console.log('======================================================\n');

  await connectToDatabase();

  // Test 1: Ingestion with ONLY mandatory fields (title, date, department)
  console.log('--- Test 1: Save meeting with ONLY mandatory fields (all optional skipped) ---');
  const mandatoryOnlyMeeting = await saveMeetingWithTasks({
    title: 'Executive Sync Without Preparation Details',
    meetingDate: '2026-10-30',
    department: 'Executive / Leadership',
    rawTranscript: 'Leadership agreed that quarterly OKRs will be finalized by next Friday.',
    summary: 'Executive alignment on quarterly goals.',
    detailedSummary: 'Leadership team reviewed quarterly objectives and assigned Friday deadline.',
    // Notice: personName, linkedinUrl, purpose, agenda, desiredOutcome are completely omitted
  });

  console.log('✔ Meeting created with ID:', mandatoryOnlyMeeting.id || mandatoryOnlyMeeting._id);

  const fetched = await getMeetingById(mandatoryOnlyMeeting.id || mandatoryOnlyMeeting._id);
  if (!fetched) throw new Error('Could not fetch saved meeting');

  console.log('Saved preparation object for mandatory-only meeting:', fetched.preparation);
  if (fetched.preparation?.personName !== '' || fetched.preparation?.purpose !== '') {
    throw new Error('Default preparation fields should be empty strings');
  }
  if (!Array.isArray(fetched.preparation?.agenda) || fetched.preparation.agenda.length !== 0) {
    throw new Error('Default agenda should be an empty array');
  }
  console.log('✔ Test 1 PASS: Mandatory-only workflow succeeds with zero errors.');

  // Test 2: Co-Pilot with empty agenda (standby / inactive)
  console.log('\n--- Test 2: Co-Pilot behavior when agenda is empty (skipped preparation) ---');
  const inactiveResult = await analyzeCopilotProgress({
    agenda: [],
    transcript: 'Some random spoken dialogue without prepared agenda.',
  });

  if (inactiveResult.active !== false) {
    throw new Error('Co-Pilot should be inactive when agenda is empty');
  }
  console.log('✔ Test 2 PASS: Co-Pilot gracefully reports inactive when preparation is skipped.');

  // Test 3: Co-Pilot Agenda Progress & AI Suggestions Detection
  console.log('\n--- Test 3: Co-Pilot Agenda Progress & Next Questions ---');
  const testAgenda = [
    'Confirm MongoDB Atlas adoption vs MySQL for transcript storage',
    'Establish API endpoints and owner deadlines',
    'Review end-to-end integration and testing checklist'
  ];

  const spokenDialogue = `
    Priya: I will finish the UI design by Wednesday.
    Aryan: I will complete the backend APIs and MongoDB endpoints by Friday.
    Rahul: Sounds good. We officially agreed to use MongoDB Atlas instead of MySQL.
    Priya: Great, what about our testing checklist? We haven't looked at the test plan yet.
  `;

  const copilotResult = await analyzeCopilotProgress({
    agenda: testAgenda,
    purpose: 'Align backend and frontend deliverables',
    desiredOutcome: 'Signed-off database architecture and deliverable deadlines',
    personName: 'Priya & Aryan',
    transcript: spokenDialogue,
  });

  console.log('Co-Pilot Result Source:', copilotResult.source);
  console.log('Agenda Progress:');
  copilotResult.agendaProgress.forEach((p, idx) => {
    console.log(`  ${idx + 1}. [${p.status}] ${p.topic}`);
    console.log(`     Note: ${p.notes}`);
  });
  console.log('Topics Left Count:', copilotResult.topicsLeftCount);
  console.log('Suggested Next Questions:', copilotResult.suggestions.nextQuestions);
  console.log('Talking Points:', copilotResult.suggestions.talkingPoints);

  if (!copilotResult.agendaProgress || copilotResult.agendaProgress.length !== 3) {
    throw new Error('Agenda progress count mismatch');
  }

  const dbTopic = copilotResult.agendaProgress.find(p => p.topic.includes('MongoDB'));
  if (!dbTopic || dbTopic.status !== 'Discussed') {
    throw new Error(`MongoDB topic should be marked 'Discussed', got: ${dbTopic?.status}`);
  }

  if (!Array.isArray(copilotResult.suggestions.nextQuestions) || copilotResult.suggestions.nextQuestions.length === 0) {
    throw new Error('Expected at least 1 suggested next question');
  }

  if (!Array.isArray(copilotResult.suggestions.talkingPoints) || copilotResult.suggestions.talkingPoints.length === 0) {
    throw new Error('Expected at least 1 talking point');
  }

  console.log('✔ Test 3 PASS: Co-Pilot successfully tracks topic statuses and generates contextual suggestions.');

  // Cleanup test meeting
  await deleteMeeting(mandatoryOnlyMeeting.id || mandatoryOnlyMeeting._id);
  console.log('✔ Cleanup complete.');

  await mongoose.disconnect();
  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!\n');
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

