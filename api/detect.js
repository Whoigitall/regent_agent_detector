const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Геттер статистики (GET) — теперь возвращает и список последних событий
  if (req.method === 'GET') {
    try {
      const [h, a, recentRaw] = await Promise.all([
        redis.get('stats:human'),
        redis.get('stats:agent'),
        redis.lrange('stats:recent', 0, 9) // Берем последние 10 записей
      ]);
      
      const recent = recentRaw.map(item => JSON.parse(item));

      return res.status(200).json({ 
        human: parseInt(h) || 0, 
        agent: parseInt(a) || 0,
        recent: recent
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
    let reasons = [];

    if (ua.includes('curl')) { riskScore += 100; reasons.push('CLI Tool'); }
    if (!hasSecCh && !ua.includes('Mozilla')) { riskScore += 80; reasons.push('No Browser Headers'); }
    if (req.body?.webdriver) { riskScore += 90; reasons.push('Webdriver detected'); }

    const type = riskScore >= 50 ? 'agent' : 'human';

    // 1. Инкремент счетчиков
    await redis.incr(`stats:${type}`);

    // 2. Запись детального события в список
    const eventData = JSON.stringify({
      id: Math.random().toString(36).substr(2, 9),
      type: type,
      score: riskScore,
      reason: reasons.length > 0 ? reasons[0] : 'Normal behavior',
      time: new Date().toLocaleTimeString('ru-RU')
    });

    await redis.lpush('stats:recent', eventData);
    await redis.ltrim('stats:recent', 0, 19); // Храним только последние 20 событий

    return res.status(200).json({ type, risk_score: riskScore });
  } catch (e) {
    return res.status(500).json({ error: "Runtime Error", msg: e.message });
  }
};
