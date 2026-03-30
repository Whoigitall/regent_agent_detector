const express = require('express');
const cors = require('cors');
const { kv } = require('@vercel/kv');
const app = express();

app.use(cors());
app.use(express.json());

app.post('*', async (req, res) => {
  const data = req.body;
  const analysis = analyzeTraffic(data);

  try {
    // 1. Увеличиваем счетчик
    const key = analysis.type === 'human' ? 'stats:human' : 'stats:agent';
    await kv.incr(key);

    // 2. Формируем строку для лога (ВАЖНО: JSON.stringify)
    const logEntry = JSON.stringify({
      type: analysis.type,
      score: analysis.risk_score,
      time: new Date().toISOString()
    });

    // 3. Сохраняем в список
    await kv.lpush('stats:recent', logEntry);
    await kv.ltrim('stats:recent', 0, 9);
  } catch (error) {
    console.error("KV Error during write:", error);
    // Не даем серверу упасть, если база занята
  }

  res.json(analysis);
});

app.get('/api/stats', async (req, res) => {
  try {
    const human = await kv.get('stats:human') || 0;
    const agent = await kv.get('stats:agent') || 0;
    const recent = await kv.lrange('stats:recent', 0, 9);
    res.json({ human, agent, recent });
  } catch (error) {
    res.status(500).json({ error: "Read error" });
  }
});

function analyzeTraffic(d) {
  let score = 0;
  if (d.webdriver) score += 50;
  if (d.plugins === 0) score += 20;
  if (!d.languages || d.languages.length === 0) score += 15;
  
  let type = "human";
  if (score >= 60) type = "agent";
  else if (score >= 30) type = "bot";
  
  return { type, risk_score: score };
}

module.exports = app;
