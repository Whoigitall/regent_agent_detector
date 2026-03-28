const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors()); // Позволяет принимать данные с любых доменов
app.use(express.json());

app.post('/', (req, res) => {
  const data = req.body;
  const analysis = analyzeTraffic(data);
  
  // Вывод в лог сервера для мониторинга
  console.log(`[${new Date().toLocaleTimeString()}] Analysis: ${analysis.type} | Score: ${analysis.risk_score}`);
  
  res.json(analysis);
});

function analyzeTraffic(d) {
  let score = 0;
  let signals = [];

  // Базовые правила детекции
  if (d.webdriver) {
    score += 50;
    signals.push("webdriver detected (automation tool)");
  }
  if (d.plugins === 0) {
    score += 20;
    signals.push("zero plugins (typical for headless bots)");
  }
  if (!d.languages || d.languages.length === 0) {
    score += 15;
    signals.push("missing language headers");
  }

  let type = "human";
  if (score >= 60) type = "probable_agent";
  else if (score >= 30) type = "bot";

  return {
    type,
    risk_score: score,
    signals,
    timestamp: new Date()
  };
}

module.exports = app;
