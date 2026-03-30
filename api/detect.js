const express = require('express');
const cors = require('cors');
const { kv } = require('@vercel/kv'); // Подключаем базу
const app = express();

app.use(cors());
app.use(express.json());

app.post('*', async (req, res) => {
  const data = req.body;
  const analysis = analyzeTraffic(data);

  // Сохраняем статистику в базу данных
  try {
    // Увеличиваем счетчик
    const key = analysis.type === 'human' ? 'stats:human' : 'stats:agent';
    await kv.incr(key);

    // Упаковываем данные в строку ПЕРЕД отправкой
    const logEntry = JSON.stringify({
      type: analysis.type,
      score: analysis.risk_score,
      time: new Date().toISOString()
    });

    // Сохраняем в список
    await kv.lpush('stats:recent', logEntry);
    // Оставляем только последние 10 записей
    await kv.ltrim('stats:recent', 0, 9);
    
    console.log("Stats updated successfully");
  } catch (error) {
    // Если база недоступна, сервер не должен падать с ошибкой 500
    console.error("KV Storage Error:", error);
  }

  res.json(analysis);
});

// Добавим новый эндпоинт для получения статистики для Дашборда
app.get('/api/stats', async (req, res) => {
  const human = await kv.get('stats:human') || 0;
  const agent = await kv.get('stats:agent') || 0;
  const recent = await kv.lrange('stats:recent', 0, 9);
  res.json({ human, agent, recent });
});

function analyzeTraffic(d) {
  let score = 0;
  if (d.webdriver) score += 50;
  if (d.plugins === 0) score += 20;
  if (!d.languages || d.languages.length === 0) score += 15;

  let type = score >= 60 ? "probable_agent" : (score >= 30 ? "bot" : "human");
  return { type, risk_score: score, timestamp: new Date() };
}

module.exports = app;
