const express = require('express');
const Redis = require('ioredis');
const axios = require('axios');
const { Connection, PublicKey } = require('@solana/web3.js');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '50mb' }));

// Redis
const redis = new Redis({ host: '127.0.0.1', port: 6379 });

// ClickHouse
const CLICKHOUSE_URL = 'http://127.0.0.1:8123';

// Solana devnet
const SOLANA_RPC = 'https://api.devnet.solana.com';
const REGENT_PROGRAM = new PublicKey('5jBmqyeo1vUAjHbEFuY59NMGTQR8cEe9Jvz2uCwCjp3L');

// ===== SERVER-SIDE SCORING ENGINE =====
function serverSideClassify(clientSignals, ip) {
  const signals = clientSignals || {};
  
  // Extract features
  const features = {
    webdriver: !!signals.webdriver,
    headless: signals.headless || false,
    plugins: signals.plugins || 0,
    languages: (signals.languages || []).length,
    screenSize: (signals.screen || '').toString(),
    hardwareConcurrency: signals.hardwareConcurrency || 0,
    deviceMemory: signals.deviceMemory || 0,
    hasCanvasFingerprint: !!signals.canvasFingerprint,
    hasAudioFingerprint: !!signals.audioFingerprint,
    behavioralEvents: (signals.mouseMovements || []).length + (signals.scrollPatterns || []).length,
    timeOnPage: signals.timeOnPage || 0,
    pageViews: (signals.pageViews || []).length,
  };
  
  // RULE-BASED PRE-FILTERING (fast path)
  if (features.webdriver || features.headless) {
    return { type: 'bot', confidence: 0.92, method: 'rule:automation_flags' };
  }
  if (features.plugins === 0 && features.languages === 0 && features.hardwareConcurrency === 0) {
    return { type: 'robot', confidence: 0.88, method: 'rule:headless_signature' };
  }
  
  // BEHAVIORAL ANALYSIS
  const mouseEvents = signals.mouseMovements || [];
  const scrollEvents = signals.scrollPatterns || [];
  const keystrokeEvents = signals.keystrokeDynamics || [];
  
  // Human-like behavior indicators
  const hasMouseMovement = mouseEvents.length > 5;
  const hasScrollPattern = scrollEvents.length > 3;
  const hasKeystrokes = keystrokeEvents.length > 0;
  const hasNaturalTiming = features.timeOnPage > 5;
  const hasMultiplePages = features.pageViews > 1;
  
  // AI Agent detection signals
  const rapidActions = mouseEvents.filter(m => m.speed > 1000).length;
  const uniformClicks = analyzeClickUniformity(signals.clickCoordinates || []);
  const instantScrolls = scrollEvents.filter(s => s.velocity > 5000).length;
  
  // Scoring
  let humanScore = 0;
  let botScore = 0;
  let robotScore = 0;
  let aiAgentScore = 0;
  
  // Human indicators
  if (hasMouseMovement) humanScore += 15;
  if (hasScrollPattern) humanScore += 15;
  if (hasKeystrokes) humanScore += 20;
  if (hasNaturalTiming) humanScore += 15;
  if (hasMultiplePages) humanScore += 10;
  if (features.hasCanvasFingerprint) humanScore += 10;
  if (features.hasAudioFingerprint) humanScore += 5;
  if (features.hardwareConcurrency >= 4) humanScore += 10;
  
  // Bot indicators
  if (features.webdriver) botScore += 40;
  if (features.headless) botScore += 30;
  if (rapidActions > 10) botScore += 20;
  if (uniformClicks > 0.8) botScore += 15;
  
  // Robot indicators (no UI, API-only)
  if (features.plugins === 0 && features.languages === 0) robotScore += 40;
  if (features.hardwareConcurrency === 0) robotScore += 20;
  if (!hasMouseMovement && !hasScrollPattern) robotScore += 20;
  if (features.behavioralEvents === 0) robotScore += 20;
  
  // AI Agent indicators
  if (instantScrolls > 5) aiAgentScore += 25;
  if (uniformClicks > 0.6 && uniformClicks < 0.8) aiAgentScore += 20;
  if (rapidActions > 5 && rapidActions < 15) aiAgentScore += 15;
  if (features.timeOnPage < 3 && features.pageViews > 3) aiAgentScore += 20;
  if (signals.userAgent && signals.userAgent.includes('Mozilla') && !hasKeystrokes) aiAgentScore += 10;
  
  // Determine type
  const scores = [
    { type: 'human', score: humanScore },
    { type: 'bot', score: botScore },
    { type: 'robot', score: robotScore },
    { type: 'ai_agent', score: aiAgentScore }
  ];
  
  scores.sort((a, b) => b.score - a.score);
  const winner = scores[0];
  const totalScore = humanScore + botScore + robotScore + aiAgentScore;
  const confidence = totalScore > 0 ? winner.score / totalScore : 0.5;
  
  return {
    type: winner.type,
    confidence: Math.min(confidence, 0.99),
    method: 'server-side:combined',
    scores: {
      human: humanScore,
      bot: botScore,
      robot: robotScore,
      ai_agent: aiAgentScore
    },
    features
  };
}

function analyzeClickUniformity(clicks) {
  if (clicks.length < 3) return 0;
  const xCoords = clicks.map(c => c.x);
  const yCoords = clicks.map(c => c.y);
  const xVariance = variance(xCoords);
  const yVariance = variance(yCoords);
  const maxVariance = Math.max(xVariance, yVariance);
  return maxVariance < 100 ? 0.9 : maxVariance < 500 ? 0.6 : 0.2;
}

function variance(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
}

// ===== API ENDPOINTS =====

// Main detection endpoint
app.post('/api/detect', async (req, res) => {
  try {
    const { signals, siteId, sessionId } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Generate session ID if not provided
    const sid = sessionId || crypto.randomUUID();
    
    // Server-side classification
    const classification = serverSideClassify(signals, clientIp);
    
    // Check on-chain status (async, don't block)
    let onChainStatus = null;
    try {
      const fingerprint = signals?.fingerprint || clientIp;
      onChainStatus = await checkOnChainStatus(fingerprint);
    } catch (e) {
      onChainStatus = false;
    }
    
    // Store in Redis (real-time)
    const timestamp = Date.now();
    const detection = {
      sessionId: sid,
      timestamp,
      ip: clientIp,
      siteId: siteId || 'unknown',
      type: classification.type,
      confidence: classification.confidence,
      method: classification.method,
      onChainVerified: onChainStatus,
      userAgent: signals?.userAgent?.substring(0, 200) || 'unknown',
      timeOnPage: signals?.timeOnPage || 0,
      pageViews: signals?.pageViews?.length || 0,
      scores: classification.scores
    };
    
    // Redis storage
    await redis.lpush('detections', JSON.stringify(detection));
    await redis.ltrim('detections', 0, 9999); // Keep last 10k
    
    // Increment counters
    await redis.hincrby('counters:today', classification.type, 1);
    await redis.hincrby('counters:today', 'total', 1);
    
    // Store in ClickHouse (async)
    try {
      await storeInClickHouse(detection, signals);
    } catch (e) {
      console.error('ClickHouse error:', e.message);
    }
    
    res.json({
      sessionId: sid,
      type: classification.type,
      confidence: classification.confidence,
      onChainVerified: onChainStatus,
      message: `Detected as ${classification.type} with ${(classification.confidence * 100).toFixed(1)}% confidence`
    });
    
  } catch (error) {
    console.error('Detection error:', error);
    res.status(500).json({ error: 'Detection failed', sessionId: sessionId || 'unknown' });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const counters = await redis.hgetall('counters:today');
    const detections = await redis.lrange('detections', 0, 49);
    
    res.json({
      counters: {
        human: parseInt(counters.human || 0),
        bot: parseInt(counters.bot || 0),
        robot: parseInt(counters.robot || 0),
        ai_agent: parseInt(counters.ai_agent || 0),
        total: parseInt(counters.total || 0)
      },
      recent: detections.map(d => JSON.parse(d))
    });
  } catch (error) {
    res.status(500).json({ error: 'Stats error' });
  }
});

// Flush counters (admin)
app.post('/api/flush', async (req, res) => {
  await redis.del('counters:today');
  await redis.del('detections');
  res.json({ flushed: true });
});

// Health check
app.get('/api/health', async (req, res) => {
  const redisStatus = redis.status === 'ready' ? 'ok' : 'down';
  res.json({ status: 'ok', redis: redisStatus, version: '2.0.0' });
});

// ===== HELPERS =====

async function checkOnChainStatus(fingerprint) {
  try {
    const connection = new Connection(SOLANA_RPC);
    const [agentPda] = PublicKey.findProgramAddressSync([
      Buffer.from('agent'),
      Buffer.from(fingerprint)
    ], REGENT_PROGRAM);
    
    const account = await connection.getAccountInfo(agentPda);
    return account !== null;
  } catch (e) {
    return false;
  }
}

async function storeInClickHouse(detection, signals) {
  const query = `
    INSERT INTO sessions (
      session_id, timestamp, ip, user_agent, entity_type, 
      confidence, risk_score, time_on_page, pages_visited,
      mouse_events, scroll_events, keystroke_events,
      on_chain_verified, site_id
    ) VALUES (
      '${detection.sessionId}',
      ${detection.timestamp},
      '${detection.ip}',
      '${(signals?.userAgent || '').replace(/'/g, "''").substring(0, 200)}',
      '${detection.type}',
      ${detection.confidence},
      ${Math.round((1 - detection.confidence) * 100)},
      ${signals?.timeOnPage || 0},
      ${signals?.pageViews?.length || 0},
      ${(signals?.mouseMovements || []).length},
      ${(signals?.scrollPatterns || []).length},
      ${(signals?.keystrokeDynamics || []).length},
      ${detection.onChainVerified ? 1 : 0},
      '${detection.siteId}'
    )
  `;
  
  await axios.post(`${CLICKHOUSE_URL}/?query=${encodeURIComponent(query)}`);
}

// ===== INIT =====
async function initClickHouse() {
  try {
    const createTable = `
      CREATE TABLE IF NOT EXISTS sessions (
        session_id String,
        timestamp UInt64,
        ip String,
        user_agent String,
        entity_type Enum('human', 'bot', 'robot', 'ai_agent'),
        confidence Float32,
        risk_score UInt8,
        time_on_page UInt32,
        pages_visited UInt16,
        mouse_events UInt32,
        scroll_events UInt32,
        keystroke_events UInt32,
        on_chain_verified UInt8,
        site_id String
      ) ENGINE = MergeTree()
      ORDER BY (timestamp, entity_type)
    `;
    await axios.post(`${CLICKHOUSE_URL}/?query=${encodeURIComponent(createTable)}`);
    console.log('ClickHouse table ready');
  } catch (e) {
    console.error('ClickHouse init error:', e.message);
  }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`Regent Detector API v2.0 listening on port ${PORT}`);
  await initClickHouse();
});
