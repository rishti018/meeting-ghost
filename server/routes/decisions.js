import express from 'express';
import { listAllDecisions } from '../services/meetingService.js';

const router = express.Router();

/**
 * GET /api/decisions
 * Retrieve all confirmed decisions across meetings with meeting references
 */
router.get('/', async (req, res, next) => {
  try {
    const decisions = await listAllDecisions();
    res.json({
      success: true,
      count: decisions.length,
      data: decisions,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
