import express from 'express';
import { answerMeetingQuestion } from '../services/qaService.js';

const router = express.Router();

/**
 * POST /api/ask (and /api/qa)
 * Answer user questions strictly grounded on saved meeting records
 */
router.post('/', async (req, res, next) => {
  try {
    const questionText = req.body.question || req.body.query;

    if (!questionText || typeof questionText !== 'string' || questionText.trim().length === 0) {
      return res.status(400).json({ error: 'Please enter a valid, non-empty question.' });
    }

    const result = await answerMeetingQuestion(questionText.trim());

    res.json({
      success: true,
      question: questionText.trim(),
      answer: result.answer,
      citations: result.citations || [],
    });
  } catch (err) {
    next(err);
  }
});

export default router;

