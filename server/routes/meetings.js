import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { analyzeMeetingTranscript } from '../services/geminiService.js';
import { transcribeAudioBuffer } from '../services/audioService.js';
import { analyzeCopilotProgress } from '../services/copilotService.js';
import {
  saveMeetingWithTasks,
  listMeetings,
  getMeetingById,
  updateMeeting,
  deleteMeeting,
  reprocessMeetingById,
  generateMeetingMom,
  saveMeetingMom,
} from '../services/meetingService.js';
import { generateMinutesOfMeeting } from '../services/momService.js';
import {
  analyzeSpeakerSentiment,
  analyzeAndSaveMeetingSentiment,
  getMeetingSentiment,
} from '../services/sentimentService.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

/**
 * POST /api/meetings/copilot
 * Live AI Meeting Co-Pilot endpoint: evaluates agenda progress, topics left,
 * and contextual next questions & talking points based on dialogue captured so far.
 */
router.post('/copilot', async (req, res, next) => {
  try {
    const {
      agenda = [],
      purpose = '',
      desiredOutcome = '',
      personName = '',
      transcript = '',
      currentTopicStatuses = {},
    } = req.body || {};

    let parsedAgenda = agenda;
    if (typeof parsedAgenda === 'string') {
      try {
        parsedAgenda = JSON.parse(parsedAgenda);
      } catch (_) {
        parsedAgenda = parsedAgenda.split('\n').map(t => t.trim()).filter(Boolean);
      }
    }

    const copilotData = await analyzeCopilotProgress({
      agenda: Array.isArray(parsedAgenda) ? parsedAgenda : [],
      purpose: (purpose || '').trim(),
      desiredOutcome: (desiredOutcome || '').trim(),
      personName: (personName || '').trim(),
      transcript: (transcript || '').trim(),
      currentTopicStatuses: typeof currentTopicStatuses === 'object' && currentTopicStatuses ? currentTopicStatuses : {},
    });

    res.json({
      success: true,
      data: copilotData,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/meetings/analyze
 * Analyzes transcript with AI and returns structured report preview
 * Also supports direct audio file upload (transcribes first, then analyzes).
 */
router.post('/analyze', upload.any(), async (req, res, next) => {
  try {
    const { transcript, rawTranscript, title, meetingDate, preparation } = req.body || {};
    let inputTranscript = transcript || rawTranscript;

    let prepData = preparation;
    if (typeof prepData === 'string') {
      try {
        prepData = JSON.parse(prepData);
      } catch (_) {}
    }
    if (!prepData || typeof prepData !== 'object') {
      if (req.body?.personName || req.body?.purpose || req.body?.desiredOutcome || req.body?.agenda) {
        prepData = {
          personName: req.body.personName,
          linkedinUrl: req.body.linkedinUrl,
          purpose: req.body.purpose,
          agenda: Array.isArray(req.body.agenda)
            ? req.body.agenda
            : (typeof req.body.agenda === 'string' ? req.body.agenda.split(',').map(s => s.trim()).filter(Boolean) : []),
          desiredOutcome: req.body.desiredOutcome,
        };
      }
    }

    const audioFile = req.file || (req.files && req.files[0]);
    if (audioFile && (!inputTranscript || inputTranscript.trim().length === 0)) {
      const audioResult = await transcribeAudioBuffer({
        buffer: audioFile.buffer,
        mimeType: audioFile.mimetype,
        originalName: audioFile.originalname,
      });
      inputTranscript = audioResult.transcript;
    }

    if (!inputTranscript || typeof inputTranscript !== 'string' || inputTranscript.trim().length === 0) {
      return res.status(400).json({ error: 'Please provide a non-empty meeting transcript or audio file.' });
    }

    if (inputTranscript.trim().length < 15) {
      return res.status(400).json({ error: 'Transcript is too short. Please provide substantive meeting dialogue or notes.' });
    }

    const analysis = await analyzeMeetingTranscript({
      transcript: inputTranscript.trim(),
      title: title ? title.trim() : '',
      meetingDate: meetingDate || new Date().toISOString().split('T')[0],
      preparation: prepData,
    });

    res.json({
      success: true,
      data: {
        ...analysis,
        transcript: inputTranscript.trim(),
        preparation: prepData || {},
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/meetings
 * Ingests a meeting: validates input, calls Gemini for intelligence (if not pre-analyzed),
 * validates AI output, and persists to MongoDB.
 * Also supports direct audio file upload (transcribes first, then extracts & persists).
 */
router.post('/', upload.any(), async (req, res, next) => {
  try {
    const {
      meetingId,
      id,
      transcript,
      rawTranscript,
      title,
      meetingDate,
      date,
      department,
      summary,
      detailedSummary,
      keyPoints,
      actionItems,
      decisions,
      followUpAgenda,
      preparation,
      sentiment,
      isDemo,
    } = req.body || {};

    let prepData = preparation;
    if (typeof prepData === 'string') {
      try {
        prepData = JSON.parse(prepData);
      } catch (_) {}
    }
    if (!prepData || typeof prepData !== 'object') {
      if (req.body?.personName || req.body?.purpose || req.body?.desiredOutcome || req.body?.agenda) {
        prepData = {
          personName: req.body.personName,
          linkedinUrl: req.body.linkedinUrl,
          purpose: req.body.purpose,
          agenda: Array.isArray(req.body.agenda)
            ? req.body.agenda
            : (typeof req.body.agenda === 'string' ? req.body.agenda.split(',').map(s => s.trim()).filter(Boolean) : []),
          desiredOutcome: req.body.desiredOutcome,
        };
      }
    }

    let inputTranscript = transcript || rawTranscript;

    const audioFile = req.file || (req.files && req.files[0]);
    if (audioFile && (!inputTranscript || inputTranscript.trim().length === 0)) {
      const audioResult = await transcribeAudioBuffer({
        buffer: audioFile.buffer,
        mimeType: audioFile.mimetype,
        originalName: audioFile.originalname,
      });
      inputTranscript = audioResult.transcript;
    }

    if (!inputTranscript || typeof inputTranscript !== 'string' || inputTranscript.trim().length === 0) {
      return res.status(400).json({ error: 'Transcript is required and must not be empty.' });
    }

    let intelData = {
      summary,
      detailedSummary,
      keyPoints,
      actionItems,
      decisions,
      followUpAgenda,
      sentiment,
    };

    // If intelligence was not pre-analyzed on client, call Gemini to generate intelligence
    if (!summary || !detailedSummary) {
      const analysis = await analyzeMeetingTranscript({
        transcript: inputTranscript.trim(),
        title: title ? title.trim() : '',
        meetingDate: meetingDate || date || new Date().toISOString().split('T')[0],
        preparation: prepData,
      });
      intelData = analysis;
    }

    const meetingTitle = (title && title.trim().length > 0)
      ? title.trim()
      : (intelData.title || (audioFile ? audioFile.originalname.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') : 'Untitled Meeting'));

    const savedMeeting = await saveMeetingWithTasks({
      meetingId: meetingId || id,
      title: meetingTitle,
      meetingDate: meetingDate || date || new Date().toISOString().split('T')[0],
      department: department || 'General',
      rawTranscript: inputTranscript.trim(),
      summary: intelData.summary,
      detailedSummary: intelData.detailedSummary,
      keyPoints: intelData.keyPoints || [],
      actionItems: intelData.actionItems || [],
      decisions: intelData.decisions || [],
      followUpAgenda: intelData.followUpAgenda || [],
      preparation: prepData || {},
      sentiment: intelData.sentiment || sentiment || null,
      isDemo: Boolean(isDemo),
    });

    res.status(201).json({
      success: true,
      data: savedMeeting,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/meetings/:id/reprocess
 * Reprocess an existing meeting: re-runs intelligence analysis and updates tasks
 */
router.post('/:id/reprocess', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid meeting ID format.' });
    }

    const updated = await reprocessMeetingById(id);
    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    if (err.message === 'Meeting not found') {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * POST /api/meetings/mom/generate-direct
 * Generates Minutes of Meeting directly from input transcript & context
 */
router.post('/mom/generate-direct', async (req, res, next) => {
  try {
    const { transcript, title, meetingDate, department, preparation } = req.body || {};
    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ error: 'Transcript is required.' });
    }

    const momData = await generateMinutesOfMeeting({
      transcript: transcript.trim(),
      title: (title || '').trim(),
      meetingDate: meetingDate || '',
      department: department || 'General',
      preparation: preparation || {},
    });

    res.json({
      success: true,
      data: momData,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/meetings/sentiment/analyze-direct
 * Analyzes speaker sentiment & emotional dynamics directly from provided transcript & context
 */
router.post('/sentiment/analyze-direct', async (req, res, next) => {
  try {
    const { transcript, title, meetingDate, preparation } = req.body || {};
    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ error: 'Transcript is required.' });
    }

    const sentimentData = await analyzeSpeakerSentiment({
      transcript: transcript.trim(),
      title: (title || '').trim(),
      meetingDate: meetingDate || '',
      preparation: preparation || {},
    });

    res.json({
      success: true,
      data: sentimentData,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/meetings/:id/sentiment
 * Retrieves saved sentiment analysis for a meeting (optionally auto-analyzes if not yet analyzed)
 */
router.get('/:id/sentiment', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { autoAnalyze } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid meeting ID format.' });
    }

    const sentiment = await getMeetingSentiment(id, {
      autoAnalyzeIfMissing: autoAnalyze === 'true' || autoAnalyze === '1',
    });

    if (!sentiment) {
      return res.status(404).json({
        success: false,
        error: 'Sentiment analysis not found for this meeting. Run POST /api/meetings/:id/sentiment/analyze to generate it.',
      });
    }

    res.json({
      success: true,
      data: sentiment,
    });
  } catch (err) {
    if (err.message === 'Meeting not found') {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * POST /api/meetings/:id/sentiment/analyze
 * Generates/re-generates speaker sentiment analysis and persists to MongoDB
 */
router.post('/:id/sentiment/analyze', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid meeting ID format.' });
    }

    const sentiment = await analyzeAndSaveMeetingSentiment(id);

    res.json({
      success: true,
      data: sentiment,
    });
  } catch (err) {
    if (err.message === 'Meeting not found') {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * POST /api/meetings/:id/mom/generate
 * Generates Minutes of Meeting (MoM) using Gemini AI or fallback
 */
router.post('/:id/mom/generate', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid meeting ID format.' });
    }

    const result = await generateMeetingMom(id);
    res.json({
      success: true,
      data: result.mom,
    });
  } catch (err) {
    if (err.message === 'Meeting not found') {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * POST /api/meetings/:id/mom
 * Saves or updates Minutes of Meeting for a meeting record
 */
router.post('/:id/mom', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mom, isEdited } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid meeting ID format.' });
    }

    if (!mom || typeof mom !== 'object') {
      return res.status(400).json({ error: 'Valid MoM data object is required.' });
    }

    const updated = await saveMeetingMom(id, mom, { isEdited: Boolean(isEdited) });
    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    if (err.message === 'Meeting not found') {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/meetings
 * List meetings, newest first, with search and pagination
 */
router.get('/', async (req, res, next) => {
  try {
    const { search, page, limit } = req.query;
    const result = await listMeetings({
      search: search || '',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });

    res.json({
      success: true,
      count: result.meetings.length,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
      data: result.meetings,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/meetings/:id
 * Retrieve a meeting and its associated tasks
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid meeting ID format.' });
    }

    const meeting = await getMeetingById(id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found.' });
    }

    res.json({
      success: true,
      data: meeting,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/meetings/:id
 * Update editable meeting details
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid meeting ID format.' });
    }

    const updated = await updateMeeting(id, req.body);
    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    if (err.message === 'Meeting not found') {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * DELETE /api/meetings/:id
 * Delete a meeting and its associated action items
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid meeting ID format.' });
    }

    const deleted = await deleteMeeting(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Meeting not found.' });
    }

    res.json({
      success: true,
      message: 'Meeting and associated action items successfully deleted.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
