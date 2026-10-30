import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Candidate .env locations (server/.env, project root .env, and cwd/.env)
const serverEnvPath = path.resolve(__dirname, '../.env');
const rootEnvPath = path.resolve(__dirname, '../../.env');
const cwdEnvPath = path.resolve(process.cwd(), '.env');

// Helper to sanitize env values: trim whitespace and strip outer quotes
function sanitize(val) {
  if (typeof val !== 'string') return '';
  return val.trim().replace(/^["']|["']$/g, '');
}

// Detect placeholder or default values
function isPlaceholderUri(uri) {
  if (!uri) return true;
  const s = uri.trim();
  return (
    s === '' ||
    s.includes('<username>') ||
    s.includes('<password>') ||
    s.includes('your_') ||
    s === 'mongodb://localhost:27017/meeting_ghost'
  );
}

// Load candidate files if they exist
const candidatePaths = [serverEnvPath, rootEnvPath, cwdEnvPath];
const loadedFiles = [];

for (const candidate of candidatePaths) {
  if (fs.existsSync(candidate) && !loadedFiles.includes(candidate)) {
    dotenv.config({ path: candidate });
    loadedFiles.push(candidate);
  }
}

// If server/.env had a placeholder or empty URI, but root .env has a real Atlas URI, use root
if (isPlaceholderUri(process.env.MONGODB_URI) && fs.existsSync(rootEnvPath)) {
  try {
    const rootRaw = fs.readFileSync(rootEnvPath, 'utf8');
    const parsed = dotenv.parse(rootRaw);
    if (parsed.MONGODB_URI && !isPlaceholderUri(parsed.MONGODB_URI)) {
      process.env.MONGODB_URI = parsed.MONGODB_URI;
    }
    if (parsed.GEMINI_API_KEY && (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes('your_'))) {
      process.env.GEMINI_API_KEY = parsed.GEMINI_API_KEY;
    }
  } catch (_) {}
}

const rawUri = sanitize(process.env.MONGODB_URI);
const rawDbName = sanitize(process.env.MONGODB_DB_NAME) || 'meeting_ghost';

export const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: sanitize(process.env.NODE_ENV) || 'development',
  clientUrl: sanitize(process.env.CLIENT_URL) || 'http://localhost:5173',
  mongoUri: rawUri,
  dbName: rawDbName,
  geminiApiKey: sanitize(process.env.GEMINI_API_KEY),
  geminiModel: sanitize(process.env.GEMINI_MODEL) || 'gemini-3.8-flash',
  envFilesLoaded: loadedFiles,
};
