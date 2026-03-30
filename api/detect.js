const express = require('express');
const cors = require('cors');
const { kv } = require('@vercel/kv');
const app = express();

app.use(cors());
app.use(express.json());

app.post('*', async (req, res) => {
  try {
    const analysis = analyzeTraffic(req.body || {});
    const key = analysis.type === 'human' ? 'stats:human' : 'stats:agent';
    
    await kv.incr(key);
    await kv.lpush('stats:recent', JSON.stringify({
      type: analysis.type,
      score: analysis.risk_score,
      time: new Date().toISOString()
    }));
    await kv.ltrim('stats:recent', 0, 9);

    res.json(analysis);
  } catch (e) {
    console.error(e);
    res.json({ type: "human", risk_score: 0 }); // Возвращаем дефолт, чтобы не вешать фронтенд
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const [human, agent, recent] = await Promise.all([
      kv.get('stats:human'),
      kv.get('stats:agent'),
      kv.lrange('stats:recent', 0, 9)
    ]);
    res.json({ human: human || 0, agent: agent || 0, recent: recent || [] });
  } catch (e) {
    res.json({ human: 0, agent: 0, recent: [] });
  }
});

function analyzeTraffic(d) {
  let score = 0;
  if (d.webdriver) score += 50;
  if (d.plugins === 0) score += 20;
  let type = score >= 60 ? "agent" : (score >= 30 ? "bot" : "human");
  return { type, risk_score: score };
}

module.exports = app;
