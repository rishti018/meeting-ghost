import express from 'express';
import { getDashboardAnalytics } from '../services/meetingService.js';
import { isDbConnected, getLastDiagnostic } from '../config/db.js';

const router = express.Router();

/**
 * GET /api/analytics
 * Real-time computed dashboard metrics from stored database records
 */
router.get('/', async (req, res, next) => {
  try {
    const stats = await getDashboardAnalytics();
    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    const isDbErr = !isDbConnected() ||
      err.status === 503 ||
      err.name?.startsWith('Mongo') ||
      err.name?.startsWith('Mongoose') ||
      err.message?.includes('Database not connected') ||
      err.message?.includes('MongoDB') ||
      err.message?.includes('buffering timed out') ||
      err.message?.includes('connection') ||
      err.message?.includes('whitelist') ||
      err.message?.includes('IP Access List') ||
      err.message?.includes('topology') ||
      err.message?.includes('alert number 80');

    if (isDbErr) {
      const diag = getLastDiagnostic();
      return res.status(503).json({
        error: diag?.message || err.message || 'Database temporarily unavailable. Please verify your MongoDB Atlas connection.',
        category: diag?.category || 'DATABASE_UNAVAILABLE',
        connected: false,
      });
    }
    next(err);
  }
});

export default router;
