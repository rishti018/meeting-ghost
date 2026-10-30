import mongoose from 'mongoose';
import { config } from './env.js';

let isConnected = false;
let lastPingResult = null;
let lastDiagnostic = null;
let connectionPromise = null;

/**
 * Safely extract host without username, password, or query secrets
 */
export function getSafeHost(uri) {
  if (!uri) return 'not_configured';
  try {
    const afterAt = uri.split('@')[1];
    if (afterAt) {
      return afterAt.split('/')[0].split('?')[0];
    }
    const match = uri.match(/\/\/([^/?#]+)/);
    return match ? match[1] : 'configured_host';
  } catch (_) {
    return 'configured_host';
  }
}

/**
 * Categorize MongoDB connection errors into clear, actionable diagnostics
 * without exposing credentials or internal secrets.
 */
export function diagnoseMongoError(err, uri) {
  if (!uri || uri.trim() === '') {
    return {
      category: 'MISSING_CONFIG',
      message: 'MONGODB_URI is not set. Please provide your MongoDB Atlas connection string in server/.env',
      detail: 'Missing environment variable MONGODB_URI.',
    };
  }

  if (uri.includes('<username>') || uri.includes('<password>')) {
    return {
      category: 'MISSING_CONFIG',
      message: 'MONGODB_URI still contains placeholder tokens (<username> or <password>). Replace them with your database user credentials.',
      detail: 'Unreplaced template placeholders in connection string.',
    };
  }

  const errStr = (err ? (err.message || String(err)) : '').toLowerCase();
  const errCode = err?.code;

  let allServerErrors = '';
  if (err?.reason?.servers) {
    for (const server of err.reason.servers.values()) {
      if (server.error?.message) {
        allServerErrors += ' ' + server.error.message;
      }
    }
  }
  const combined = (errStr + ' ' + allServerErrors).toLowerCase();

  // 1. Authentication failure
  if (
    errCode === 8000 ||
    errCode === 18 ||
    combined.includes('bad auth') ||
    combined.includes('authentication failed') ||
    combined.includes('auth error')
  ) {
    return {
      category: 'AUTH_FAILURE',
      message: 'MongoDB authentication failed. Please verify your database username and password in MONGODB_URI.',
      detail: 'Invalid credentials provided in connection string.',
    };
  }

  // 2. IP access denial / Whitelist restriction / TLS alert 80
  if (
    combined.includes('whitelist') ||
    combined.includes('ip') ||
    combined.includes('not authorized') ||
    combined.includes('alert number 80') ||
    combined.includes('alert internal error') ||
    (combined.includes('serverselectionerror') && combined.includes('closed'))
  ) {
    return {
      category: 'IP_ACCESS_DENIED',
      message: 'MongoDB Atlas access denied (IP Access List restriction / SSL Alert 80). Verify that your current client IP is added to the IP Access List under Network Access in MongoDB Atlas (or add 0.0.0.0/0).',
      detail: 'Network access restricted by Atlas IP Access List or TLS handshake rejection.',
    };
  }

  // 3. DNS or hostname resolution failure
  if (
    combined.includes('enotfound') ||
    combined.includes('querysrv') ||
    combined.includes('querytxt') ||
    combined.includes('getaddrinfo')
  ) {
    return {
      category: 'DNS_NETWORK_FAILURE',
      message: 'DNS lookup failed for MongoDB Atlas cluster. Please check your network connection and verify cluster hostname.',
      detail: 'Cluster hostname could not be resolved.',
    };
  }

  // 4. Local connection refused
  if (combined.includes('econnrefused') && (combined.includes('127.0.0.1') || combined.includes('::1') || combined.includes('localhost'))) {
    return {
      category: 'LOCAL_CONNECTION_REFUSED',
      message: 'Connection refused on localhost:27017. If you are using MongoDB Atlas, configure MONGODB_URI with your mongodb+srv:// cluster URI.',
      detail: 'No local MongoDB service running on port 27017.',
    };
  }

  // 5. Server selection timeout
  if (combined.includes('serverselection') || combined.includes('timed out') || combined.includes('etimedout')) {
    return {
      category: 'SERVER_SELECTION_TIMEOUT',
      message: 'MongoDB server selection timed out. The cluster was unreachable within timeout limits. Check network connectivity and Atlas cluster status.',
      detail: 'Server selection timeout reached.',
    };
  }

  return {
    category: 'CONNECTION_FAILURE',
    message: err?.message || 'Failed to connect to MongoDB.',
    detail: err?.message || 'Unknown connection error.',
  };
}

/**
 * Connect to MongoDB using Mongoose, await connection, and verify with ping
 */
export async function connectToDatabase() {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    const uri = config.mongoUri;
    const safeHost = getSafeHost(uri);

    console.log(`[Database] Connecting to MongoDB via Mongoose (Host: ${safeHost}, DB: ${config.dbName})...`);

    if (!uri || uri.trim() === '' || uri.includes('<username>') || uri.includes('<password>')) {
      const diag = diagnoseMongoError(null, uri);
      lastDiagnostic = diag;
      isConnected = false;
      console.warn(`[Database] Diagnostic: ${diag.message}`);
      return null;
    }

    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        mongoose.set('strictQuery', false);

        if (mongoose.connection.readyState !== 1) {
          await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 15000,
            socketTimeoutMS: 45000,
            dbName: config.dbName,
            tls: true,
            family: 4,
          });
        }

        // Test connectivity using ping
        const startTime = Date.now();
        let pingOk = true;
        let latencyMs = 50;

        if (mongoose.connection?.db) {
          const adminDb = mongoose.connection.db.admin();
          const pingRes = await adminDb.ping();
          pingOk = pingRes.ok === 1;
          latencyMs = Date.now() - startTime;
        }

        isConnected = true;
        lastPingResult = { ok: pingOk, latencyMs };
        lastDiagnostic = null;

        console.log(`[Database] Successfully connected to MongoDB Atlas! (DB: "${config.dbName}", Ping: ${latencyMs}ms)`);

        mongoose.connection.on('error', (err) => {
          const diag = diagnoseMongoError(err, uri);
          console.error(`[Database] MongoDB connection error [${diag.category}]: ${diag.message}`);
          isConnected = false;
          lastDiagnostic = diag;
        });

        mongoose.connection.on('disconnected', () => {
          console.warn('[Database] MongoDB disconnected');
          isConnected = false;
        });

        return mongoose.connection;
      } catch (err) {
        lastErr = err;
        try {
          await mongoose.disconnect();
        } catch (_) {}
        if (attempt <= 2 && !err.message.includes('bad auth') && !err.message.includes('whitelist') && !err.message.includes('code 8000')) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
      }
    }

    isConnected = false;
    const diag = diagnoseMongoError(lastErr, uri);
    lastDiagnostic = diag;
    lastPingResult = null;
    console.warn(`[Database] Connection notice [${diag.category}]: ${diag.message}`);
    return null;
  })();

  try {
    return await connectionPromise;
  } finally {
    connectionPromise = null;
  }
}

export function isDbConnected() {
  return (isConnected || mongoose.connection.readyState === 1) && mongoose.connection.readyState === 1;
}

/**
 * Active health check testing connectivity with ping
 */
export async function checkDatabaseHealth() {
  const readyState = mongoose.connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  const safeHost = getSafeHost(config.mongoUri);

  if (readyState === 1 && mongoose.connection.db) {
    try {
      const start = Date.now();
      const ping = await mongoose.connection.db.admin().ping();
      const latencyMs = Date.now() - start;
      const ok = ping && ping.ok === 1;

      return {
        connected: ok,
        isLiveMongo: true,
        ping: ok,
        latencyMs,
        readyState: 'connected',
        mode: 'MongoDB Atlas (Mongoose)',
        databaseName: config.dbName,
        clusterHost: safeHost,
        error: null,
        category: null,
      };
    } catch (pingErr) {
      const diag = diagnoseMongoError(pingErr, config.mongoUri);
      return {
        connected: false,
        isLiveMongo: false,
        ping: false,
        latencyMs: null,
        readyState: states[readyState] || 'unknown',
        mode: 'Degraded',
        databaseName: config.dbName,
        clusterHost: safeHost,
        error: diag.message,
        category: diag.category,
      };
    }
  }

  if (readyState !== 1 && config.mongoUri && !config.mongoUri.includes('<username>')) {
    try {
      await connectToDatabase();
      if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
        const start = Date.now();
        const ping = await mongoose.connection.db.admin().ping();
        const latencyMs = Date.now() - start;
        const ok = ping && ping.ok === 1;
        if (ok) {
          return {
            connected: true,
            isLiveMongo: true,
            ping: true,
            latencyMs,
            readyState: 'connected',
            mode: 'MongoDB Atlas (Mongoose)',
            databaseName: config.dbName,
            clusterHost: safeHost,
            error: null,
            category: null,
          };
        }
      }
    } catch (_) {}
  }

  const diag = lastDiagnostic || diagnoseMongoError(null, config.mongoUri);
  return {
    connected: false,
    isLiveMongo: false,
    ping: false,
    latencyMs: null,
    readyState: states[readyState] || 'disconnected',
    mode: 'Disconnected',
    databaseName: config.dbName,
    clusterHost: safeHost,
    error: diag.message,
    category: diag.category,
  };
}

export function getLastDiagnostic() {
  return lastDiagnostic;
}

export function getDbStatus() {
  const readyState = mongoose.connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  const live = isDbConnected();
  const safeHost = getSafeHost(config.mongoUri);

  return {
    connected: live,
    isLiveMongo: live,
    readyState: states[readyState] || 'unknown',
    mode: live ? 'MongoDB Atlas (Mongoose)' : 'Disconnected',
    databaseName: config.dbName,
    clusterHost: safeHost,
    ping: lastPingResult ? lastPingResult.ok : false,
    latencyMs: lastPingResult ? lastPingResult.latencyMs : null,
    error: live ? null : (lastDiagnostic?.message || 'Database not connected. Please verify your MongoDB Atlas connection and network access.'),
    category: live ? null : (lastDiagnostic?.category || 'DISCONNECTED'),
  };
}
