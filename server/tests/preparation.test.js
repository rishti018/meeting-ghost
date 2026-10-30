import mongoose from 'mongoose';
import { connectToDatabase } from '../config/db.js';
import { Meeting } from '../models/Meeting.js';
import { saveMeetingWithTasks, getMeetingById, deleteMeeting } from '../services/meetingService.js';

async function run() {
  console.log('\n--- Testing Meeting Preparation Persistence ---');
  await connectToDatabase();

  const samplePrep = {
    personName: 'Dr. Sarah Chen',
    linkedinUrl: 'https://www.linkedin.com/in/sarahchen',
    purpose: 'Review Q4 AI Architecture Roadmap',
    agenda: [
      'Model evaluation benchmarks',
      'Latency optimizations',
      'Cost tracking'
    ],
    desiredOutcome: 'Sign-off on latency targets and timeline'
  };

  const transcript = 'Dr. Sarah Chen agreed that latency optimizations will be delivered by next Tuesday.';

  // 1. Create meeting with preparation
  const created = await saveMeetingWithTasks({
    title: 'Test Prep Architecture Sync',
    meetingDate: '2026-11-01',
    department: 'Engineering',
    rawTranscript: transcript,
    summary: 'Discussion on architecture roadmap.',
    detailedSummary: 'Sarah and team aligned on key latency targets.',
    preparation: samplePrep,
  });

  console.log('Saved meeting ID:', created.id || created._id);

  // 2. Fetch meeting and verify preparation
  const fetched = await getMeetingById(created.id || created._id);
  console.log('Fetched preparation:', JSON.stringify(fetched.preparation, null, 2));

  if (!fetched.preparation) {
    throw new Error('Preparation object missing from fetched meeting');
  }

  if (fetched.preparation.personName !== samplePrep.personName) {
    throw new Error(`personName mismatch: expected "${samplePrep.personName}", got "${fetched.preparation.personName}"`);
  }
  if (fetched.preparation.linkedinUrl !== samplePrep.linkedinUrl) {
    throw new Error(`linkedinUrl mismatch: expected "${samplePrep.linkedinUrl}", got "${fetched.preparation.linkedinUrl}"`);
  }
  if (fetched.preparation.purpose !== samplePrep.purpose) {
    throw new Error(`purpose mismatch: expected "${samplePrep.purpose}", got "${fetched.preparation.purpose}"`);
  }
  if (fetched.preparation.desiredOutcome !== samplePrep.desiredOutcome) {
    throw new Error(`desiredOutcome mismatch: expected "${samplePrep.desiredOutcome}", got "${fetched.preparation.desiredOutcome}"`);
  }
  if (!Array.isArray(fetched.preparation.agenda) || fetched.preparation.agenda.length !== 3) {
    throw new Error(`agenda length mismatch: expected 3 topics, got ${fetched.preparation.agenda?.length}`);
  }

  console.log('✔ Preparation validation passed 100%!');

  // Cleanup
  await deleteMeeting(created.id || created._id);
  console.log('✔ Cleanup complete');
  await mongoose.disconnect();
  console.log('--- Done ---\n');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});

