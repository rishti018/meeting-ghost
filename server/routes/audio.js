import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { transcribeAudioBuffer } from '../services/audioService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max limit
  },
  fileFilter: (req, file, cb) => {
    const rawMime = (file.mimetype || '').toLowerCase();
    const isAudio =
      rawMime.startsWith('audio/') ||
      rawMime.includes('webm') ||
      rawMime.includes('ogg') ||
      rawMime.includes('wav') ||
      rawMime.includes('mp3') ||
      rawMime.includes('mpeg') ||
      rawMime.includes('m4a') ||
      rawMime.includes('mp4') ||
      file.originalname.match(/\.(mp3|wav|m4a|webm|ogg)$/i);

    if (isAudio) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Please upload an audio file (.mp3, .wav, .m4a, .webm, .ogg).'));
    }
  },
});

/**
 * GET /api/audio/sample
 * Serve verified sample audio file for testing
 */
router.get('/sample', (req, res) => {
  const samplePath = path.resolve(__dirname, '../tests/meeting_sample.wav');
  if (fs.existsSync(samplePath)) {
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', 'inline; filename="meeting_sample.wav"');
    fs.createReadStream(samplePath).pipe(res);
  } else {
    res.status(404).json({ error: 'Sample audio file not found' });
  }
});

/**
 * POST /api/audio/transcribe
 * Upload an audio file and get verified transcript
 */
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please select an audio file to transcribe.' });
    }

    const result = await transcribeAudioBuffer({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('[AudioRoute] Transcription error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to transcribe audio file.',
    });
  }
});

export default router;
