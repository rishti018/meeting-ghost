import express from 'express';
import { checkDatabaseHealth } from '../config/db.js';
import { isGeminiConfigured } from '../services/geminiService.js';
import { config } from '../config/env.js';

const router = express.Router();

/**
 * GET /api/health
 * Safe health endpoint testing MongoDB connectivity using ping
 * Never exposes credentials, passwords, or API keys.
 */
router.get('/', async (req, res) => {
  const dbHealth = await checkDatabaseHealth();
  const isHealthy = dbHealth.connected && dbHealth.ping;

  res.json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime() * 100) / 100,
    database: dbHealth,
    ai: {
      provider: 'Google Gemini (@google/genai)',
      model: config.geminiModel,
      isConfigured: isGeminiConfigured(),
    },
    version: '1.0.0',
    environment: config.nodeEnv,
  });
});

export default router;
