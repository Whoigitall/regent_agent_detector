const express = require('express');
const cors = require('cors');
const { createClient } = require('@vercel/kv'); // Используем прямой конструктор

const app = express();
app.use(cors());
app.use(express.json());

// Инициализируем KV только если есть переменные
const kv = (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) 
  ? createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  : null;

app.post('*', async (req, res) => {
  const analysis = { type: 'human', risk_score: 0 }; // Дефолт
  
  if (kv) {
    try {
      // Твоя логика записи в KV
      await kv.incr('stats:human'); 
    } catch (e) {
      console.error("Database Write Error:", e.message);
    }
  } else {
    console.warn("KV Client not initialized - missing env vars");
  }

  res.json(analysis);
});

// Аналогично в GET /api/stats
app.get('/api/stats', async (req, res) => {
  if (!kv) return res.json({ human: 0, agent: 0, recent: [] });
  // ... логика получения данных
});

module.exports = app;
