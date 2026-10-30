import mongoose from 'mongoose';
import { Meeting } from '../models/Meeting.js';
import { Task } from '../models/Task.js';
import { connectToDatabase, isDbConnected } from '../config/db.js';
import {
  generateMinutesOfMeeting,
  sanitizeMomOutput
} from '../services/momService.js';
import {
  saveMeetingWithTasks,
  generateMeetingMom,
  saveMeetingMom,
  getMeetingById,
  deleteMeeting
} from '../services/meetingService.js';

async function testMomIntegration() {
  console.log('\n======================================================');
  console.log('🚀 END-TO-END ACCEPTANCE TEST: MINUTES OF MEETING (MoM)');
  console.log('======================================================\n');

  // Step 1: Connect to Database (or check if connected)
  console.log('--- Step 1: Checking Database Connectivity ---');
  let dbAvailable = false;
  try {
    await connectToDatabase();
    dbAvailable = isDbConnected();
    console.log('MongoDB connected:', dbAvailable);
  } catch (err) {
    console.log('[Notice] MongoDB connection returned:', err.message);
  }

  const sampleTranscript = `
Aryan (Backend Developer): I will build the Minutes of Meeting API endpoints by Wednesday.
Priya (Frontend Designer): I will implement the document viewer and editor by Thursday.
Rahul (DevOps Lead): What format should the exported document use?
Aryan: We decided to use standard PDF with clean print layout as requested.
Rahul: I will set up automated tests by Friday.
Priya: Should we support mobile viewing?
Aryan: Yes, the document layout must be fully responsive on mobile.
Aryan: Let's follow up on Friday afternoon to review the final export.
  `.trim();

  const samplePrep = {
    personName: 'Priya',
    linkedinUrl: 'https://linkedin.com/in/priya-test',
    purpose: 'Deliver AI Minutes of Meeting Feature',
    agenda: ['MoM Architecture', 'Frontend Document Viewer', 'PDF Export'],
    desiredOutcome: 'Feature complete with 13 MoM sections and export',
  };

  if (!dbAvailable) {
    console.log('[Notice] MongoDB Atlas is currently offline or IP restricted. Running in-memory integration verification.');

    // 1. Generate MoM
    const generatedMom = await generateMinutesOfMeeting({
      transcript: sampleTranscript,
      title: 'MoM Architecture Sync',
      meetingDate: '2026-10-30',
      department: 'Product Engineering',
      preparation: samplePrep,
    });

    console.log('✔ MoM generated successfully with title:', generatedMom.title);
    console.log('  Participants:', generatedMom.participants);
    console.log('  Decisions:', generatedMom.decisions);
    console.log('  Action Items:', generatedMom.actionItems);

    // Verify 13 sections
    const requiredSections = [
      'title', 'meetingDate', 'meetingTime', 'department', 'participants',
      'objective', 'agenda', 'keyDiscussionPoints', 'questionsAndResponses',
      'decisions', 'actionItems', 'pendingIssues', 'followUpMeeting', 'conclusion'
    ];
    for (const sec of requiredSections) {
      if (generatedMom[sec] === undefined) {
        throw new Error(`Missing required MoM section: ${sec}`);
      }
    }
    console.log('✔ All 13 MoM sections verified!');

    // 2. Simulate Save & Edit
    const editedDraft = {
      ...generatedMom,
      conclusion: 'Updated conclusion by user during final review.',
      isEdited: true,
      actionItems: [
        ...generatedMom.actionItems,
        { task: 'New Deliverable Added in MoM', owner: 'Rahul', deadline: 'Next Monday', priority: 'High', status: 'Pending' }
      ],
      decisions: [
        ...generatedMom.decisions,
        { decision: 'Adopt jsPDF for client-side generation', rationale: 'Fast vector rendering without server round-trip' }
      ]
    };

    const sanitizedSaved = sanitizeMomOutput(editedDraft, {
      title: 'MoM Architecture Sync',
      meetingDate: '2026-10-30',
      department: 'Product Engineering',
    });

    if (sanitizedSaved.conclusion !== 'Updated conclusion by user during final review.') {
      throw new Error('Edited conclusion did not persist');
    }
    if (sanitizedSaved.actionItems.length !== generatedMom.actionItems.length + 1) {
      throw new Error('New action item was not preserved in edited MoM');
    }
    if (sanitizedSaved.decisions.length !== generatedMom.decisions.length + 1) {
      throw new Error('New decision was not preserved in edited MoM');
    }

    console.log('✔ MoM editing and saving logic verified in-memory!');
    console.log('\n======================================================');
    console.log('🎉 IN-MEMORY INTEGRATION VERIFICATION PASSED 100%!');
    console.log('======================================================\n');
    return;
  }

  // Live Database Test Path
  console.log('--- Step 2: Creating Test Meeting in MongoDB ---');
  const meeting = await saveMeetingWithTasks({
    title: 'MoM Integration Test Meeting',
    meetingDate: '2026-10-30',
    department: 'Product Engineering',
    rawTranscript: sampleTranscript,
    summary: 'Meeting to review MoM generator implementation.',
    preparation: samplePrep,
  });

  const meetingId = meeting.id;
  console.log(`✔ Meeting saved with ID: ${meetingId}`);

  // Step 3: Generate MoM
  console.log('--- Step 3: Generating MoM for Saved Meeting ---');
  const genResult = await generateMeetingMom(meetingId);
  const momData = genResult.mom;
  console.log('✔ MoM generated for meeting:', momData.title);

  // Step 4: Save MoM to Database
  console.log('--- Step 4: Saving MoM to Database ---');
  const savedMeeting = await saveMeetingMom(meetingId, momData, { isEdited: false });
  if (!savedMeeting.mom || savedMeeting.mom.title !== momData.title) {
    throw new Error('Failed to save MoM to meeting record');
  }
  console.log('✔ MoM successfully persisted to MongoDB!');

  // Step 5: Edit and update MoM
  console.log('--- Step 5: Editing and Updating MoM (Testing Task Connection & Deduplication) ---');
  const editedMom = {
    ...momData,
    conclusion: 'Approved by executive team with additions.',
    actionItems: [
      ...momData.actionItems,
      { task: 'New Deliverable Added In MoM', owner: 'Rahul', deadline: 'Next Monday', priority: 'High', status: 'Pending' }
    ],
    decisions: [
      ...momData.decisions,
      { decision: 'Adopt jsPDF client-side generation', rationale: 'Fast vector rendering without server round-trip' }
    ]
  };

  const updatedAfterEdit = await saveMeetingMom(meetingId, editedMom, { isEdited: true });
  console.log('✔ Updated MoM saved. isEdited:', updatedAfterEdit.mom.isEdited);
  console.log('  Action Items count in meeting:', updatedAfterEdit.actionItems.length);
  console.log('  Decisions count in meeting:', updatedAfterEdit.decisions.length);

  if (!updatedAfterEdit.mom.isEdited) {
    throw new Error('Expected mom.isEdited to be true after editing');
  }

  // Step 6: Reopen Saved Meeting (Verify persistence after reload)
  console.log('--- Step 6: Reopening Saved Meeting by ID ---');
  const reopened = await getMeetingById(meetingId);
  if (!reopened || !reopened.mom) {
    throw new Error('Reopened meeting missing MoM subdocument');
  }
  if (reopened.mom.conclusion !== 'Approved by executive team with additions.') {
    throw new Error('Reopened meeting did not preserve edited conclusion');
  }
  console.log('✔ Reopened meeting successfully verified! MoM preserved:', reopened.mom.title);

  // Clean up test meeting
  console.log('--- Step 7: Cleaning Up Test Meeting ---');
  await deleteMeeting(meetingId);
  console.log('✔ Cleaned up test meeting.');

  console.log('\n======================================================');
  console.log('🎉 ALL END-TO-END ACCEPTANCE TESTS PASSED 100%!');
  console.log('======================================================\n');
}

testMomIntegration().catch((err) => {
  console.error('❌ Integration test failed:', err);
  process.exit(1);
});

