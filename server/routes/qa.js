import express from 'express';
import { answerMeetingQuestion } from '../services/qaService.js';

const router = express.Router();

/**
 * POST /api/qa
 * Grounded Q&A against saved meeting intelligence
 */
router.post('/', async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ error: 'Please enter a valid question.' });
    }

    const result = await answerMeetingQuestion(question.trim());

    res.json({
      success: true,
      question: question.trim(),
      answer: result.answer,
      citations: result.citations || [],
    });
  } catch (err) {
    console.error('[QARoute] Error processing question:', err.message);
    res.status(500).json({ error: err.message || 'Failed to answer question.' });
  }
});

export default router;
