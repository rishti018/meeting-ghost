import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { connectToDatabase, getDbStatus } from './config/db.js';

// Route imports
import healthRoutes from './routes/health.js';
import meetingsRoutes from './routes/meetings.js';
import tasksRoutes from './routes/tasks.js';
import decisionsRoutes from './routes/decisions.js';
import askRoutes from './routes/ask.js';
import dashboardRoutes from './routes/dashboard.js';
import seedRoutes from './routes/seed.js';
import audioRoutes from './routes/audio.js';
import githubRoutes from './routes/github.js';

const app = express();

// Security and middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow local client origins or server-to-server requests
    if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Mount API routes
app.use('/api/health', healthRoutes);
app.use('/api/meetings', meetingsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/decisions', decisionsRoutes);
app.use('/api/ask', askRoutes);
app.use('/api/qa', askRoutes); // Alias for frontend backward compatibility
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', dashboardRoutes); // Alias for frontend backward compatibility
app.use('/api/seed', seedRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/github', githubRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'Meeting Ghost API',
    tagline: 'No note-taker needed. Every meeting becomes actionable.',
    status: 'online',
    version: '1.0.0',
    endpoints: [
      'GET /api/health',
      'GET /api/meetings',
      'POST /api/meetings',
      'GET /api/meetings/:id',
      'PATCH /api/meetings/:id',
      'DELETE /api/meetings/:id',
      'GET /api/tasks',
      'PATCH /api/tasks/:id',
      'GET /api/decisions',
      'POST /api/ask',
      'GET /api/dashboard/stats',
      'POST /api/seed',
    ]
  });
});

// 404 handler for undefined API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Endpoint ${req.originalUrl} not found.` });
});

// Centralized error handling
app.use((err, req, res, next) => {
  console.error('[ServerError]', err.stack || err.message);
  const status = err.status || (err.name === 'ValidationError' ? 400 : 500);
  res.status(status).json({
    error: err.message || 'Internal server error occurred.',
  });
});

// Start server
async function startServer() {
  try {
    await connectToDatabase();
    const dbStatus = getDbStatus();

    app.listen(config.port, () => {
      console.log(`\n======================================================`);
      console.log(`👻 Meeting Ghost API running at: http://localhost:${config.port}`);
      console.log(`📡 Client origin: ${config.clientUrl}`);
      console.log(`💾 Database: ${dbStatus.mode} (${dbStatus.databaseName})`);
      console.log(`🤖 AI Service: Gemini ${config.geminiModel}`);
      console.log(`======================================================\n`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
