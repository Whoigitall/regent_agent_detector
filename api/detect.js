const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  // CORS настройки
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. ПРОВЕРКА СТАТИСТИКИ (GET)
  if (req.method === 'GET') {
    try {
      const [human, agent, recent] = await Promise.all([
        kv.get('stats:human'),
        kv.get('stats:agent'),
        kv.lrange('stats:recent', 0, 9)
      ]);
      return res.status(200).json({ 
        human: parseInt(human) || 0, 
        agent: parseInt(agent) || 0, 
        recent: recent || [] 
      });
    } catch (e) {
      return res.status(200).json({ human: 0, agent: 0, recent: [] });
    }
  }

  // 2. ДЕТЕКЦИЯ (POST)
  try {
    const body = req.body || {};
    const headers = req.headers || {};
    const ua = headers['user-agent'] || '';

    let score = 0;
    let reasons = [];

    // --- ПРОВЕРКА 1: Браузерные признаки (от фронтенда) ---
    if (body.webdriver === true) { score += 50; reasons.push('Webdriver detected'); }
    if (body.plugins === 0) { score += 20; reasons.push('No plugins'); }

    // --- ПРОВЕРКА 2: Серверные признаки (Headers) ---
    const botLibraries = /python-requests|node-fetch|axios|go-http-client|aiohttp|urllib/i;
    if (botLibraries.test(ua)) {
      score += 100;
      reasons.push('Automated library UA');
    }
    
    // Если заголовков слишком мало (типично для простых ботов)
    if (Object.keys(headers).length < 5) {
      score += 30;
      reasons.push('Suspiciously low header count');
    }

    const isAgent = score >= 50;
    const type = isAgent ? 'agent' : 'human';

    // Запись в базу
    await kv.incr(`stats:${type}`);
    await kv.lpush('stats:recent', JSON.stringify({
      type,
      score,
      time: new Date().toISOString(),
      reasons: reasons.slice(0, 2) // берем пару причин для лога
    }));
    await kv.ltrim('stats:recent', 0, 9);

    return res.status(200).json({ type, risk_score: score });

  } catch (e) {
    console.error('API Error:', e);
    return res.status(200).json({ type: 'human', risk_score: 0 });
  }
};
