const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const [human, agent] = await Promise.all([
      kv.get('stats:human'),
      kv.get('stats:agent')
    ]);
    return res.status(200).json({ human: parseInt(human) || 0, agent: parseInt(agent) || 0, recent: [] });
  }

  try {
    const ua = req.headers['user-agent'] || '';
    const isCurl = ua.includes('curl');
    const hasSecCh = req.headers['sec-ch-ua']; // Этот заголовок есть ТОЛЬКО в современных браузерах

    let riskScore = 0;
    let reasons = [];

    // Логика Regent Protocol:
    if (isCurl) { 
      riskScore += 100; 
      reasons.push('Direct CLI Access (curl)'); 
    }
    if (!hasSecCh && !ua.includes('Mozilla')) { 
      riskScore += 80; 
      reasons.push('Non-browser environment'); 
    }
    if (req.body?.webdriver) { 
      riskScore += 90; 
      reasons.push('Webdriver active'); 
    }

    const isAgent = riskScore >= 50;
    const type = isAgent ? 'agent' : 'human';

    // Инкремент в Redis
    await kv.incr(`stats:${type}`);
    
    return res.status(200).json({ type, risk_score: riskScore, reasons });
  } catch (e) {
    return res.status(200).json({ type: 'human', risk_score: 0 });
  }
};
