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

// GitHub App configuration validation
function resolvePrivateKeyPath(p) {
  if (!p) return null;
  const cleaned = sanitize(p);
  const candidates = [
    path.resolve(process.cwd(), cleaned),
    path.resolve(process.cwd(), 'server', cleaned),
    path.resolve(__dirname, '..', cleaned),
    path.resolve(__dirname, '../../', cleaned),
    path.resolve(cleaned),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const stat = fs.statSync(c);
        if (stat.isFile() && stat.size > 0) return c;
      } catch (_) {}
    }
  }
  return null;
}

const rawAppId = sanitize(process.env.GITHUB_APP_ID);
const rawInstallationId = sanitize(process.env.GITHUB_INSTALLATION_ID);
const rawKeyPath = sanitize(process.env.GITHUB_PRIVATE_KEY_PATH);
const resolvedKeyPath = resolvePrivateKeyPath(rawKeyPath);

export const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: sanitize(process.env.NODE_ENV) || 'development',
  clientUrl: sanitize(process.env.CLIENT_URL) || 'http://localhost:5173',
  mongoUri: rawUri,
  dbName: rawDbName,
  geminiApiKey: sanitize(process.env.GEMINI_API_KEY),
  geminiModel: sanitize(process.env.GEMINI_MODEL) || 'gemini-3.8-flash',
  envFilesLoaded: loadedFiles,
  githubApp: {
    appId: rawAppId,
    installationId: rawInstallationId,
    privateKeyPath: resolvedKeyPath,
    isConfigured: Boolean(rawAppId && rawInstallationId && resolvedKeyPath),
    missingConfig: [
      !rawAppId && 'GITHUB_APP_ID',
      !rawInstallationId && 'GITHUB_INSTALLATION_ID',
      (!rawKeyPath || !resolvedKeyPath) && 'GITHUB_PRIVATE_KEY_PATH',
    ].filter(Boolean),
  },
};
