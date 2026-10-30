import express from 'express';
import { Meeting } from '../models/Meeting.js';
import { Task } from '../models/Task.js';
import { saveMeetingWithTasks } from '../services/meetingService.js';
import { DEMO_MEETINGS, HACKATHON_DEMO_TRANSCRIPT } from '../data/demoData.js';
import { isDbConnected } from '../config/db.js';

const router = express.Router();

/**
 * GET /api/seed/sample-transcript
 * Returns the exact hackathon test transcript
 */
router.get('/sample-transcript', (req, res) => {
  res.json({
    transcript: HACKATHON_DEMO_TRANSCRIPT,
    title: 'Sprint Kickoff & Database Architecture Review',
    department: 'Engineering',
  });
});

/**
 * POST /api/seed
 * Injects official hackathon sample meeting and tasks into MongoDB
 */
router.post('/', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        error: 'Database not connected. Please configure a valid MONGODB_URI in server/.env',
      });
    }

    let countAdded = 0;
    for (const demo of DEMO_MEETINGS) {
      const existing = await Meeting.findOne({ title: demo.title });
      if (!existing) {
        await saveMeetingWithTasks({
          title: demo.title,
          meetingDate: demo.date,
          department: demo.department,
          rawTranscript: demo.rawTranscript,
          summary: demo.summary,
          detailedSummary: demo.detailedSummary,
          keyPoints: demo.keyPoints,
          actionItems: demo.actionItems.map(a => ({
            task: a.task,
            owner: a.owner,
            deadline: a.deadline,
            priority: a.priority,
            status: a.status,
          })),
          decisions: demo.decisions.map(d => ({
            decision: d.decision,
            rationale: d.rationale,
          })),
          followUpAgenda: demo.followUpAgenda,
          isDemo: true,
        });
        countAdded++;
      }
    }

    const [totalMeetings, totalTasks] = await Promise.all([
      Meeting.countDocuments({}),
      Task.countDocuments({}),
    ]);

    res.json({
      success: true,
      message: `Seeded ${countAdded} sample demo meeting(s).`,
      totalMeetings,
      totalTasks,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/seed/reset
 * Clears demo meetings and tasks
 */
router.post('/reset', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        error: 'Database not connected. Please configure a valid MONGODB_URI in server/.env',
      });
    }

    await Meeting.deleteMany({});
    await Task.deleteMany({});

    res.json({
      success: true,
      message: 'Workspace data cleared successfully.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
