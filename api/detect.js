const Redis = require('ioredis');

// Подключаемся к твоему Redis Labs
const redis = new Redis(process.env.REDIS_URL);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Геттер статистики (GET)
  if (req.method === 'GET') {
    try {
      const [h, a] = await Promise.all([
        redis.get('stats:human'),
        redis.get('stats:agent')
      ]);
      return res.status(200).json({ 
        human: parseInt(h) || 0, 
        agent: parseInt(a) || 0 
      });
    } catch (e) {
      return res.status(500).json({ error: "Redis Error", details: e.message });
    }
  }

  // Детекция (POST)
  try {
    const ua = req.headers['user-agent'] || '';
    const hasSecCh = req.headers['sec-ch-ua'];
    
    let riskScore = 0;
    
    // Детекция агента
    if (ua.includes('curl') || ua.includes('Postman')) riskScore += 100;
    if (!hasSecCh && !ua.includes('Mozilla')) riskScore += 80;
    if (req.body?.webdriver) riskScore += 90;

    const type = riskScore >= 50 ? 'agent' : 'human';

    // Запись в Redis Labs
    await redis.incr(`stats:${type}`);
    
    return res.status(200).json({ 
      type, 
      risk_score: riskScore,
      provider: "Redis Labs External"
    });
  } catch (e) {
    return res.status(500).json({ error: "Runtime Error", msg: e.message });
  }
};
