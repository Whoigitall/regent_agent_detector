const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

module.exports = async (req, res) => {
  // Настройка CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. ГЕТТЕР: Отдает данные на Дашборд
  if (req.method === 'GET') {
    try {
      const [h, a, recentRaw] = await Promise.all([
        redis.get('stats:human'),
        redis.get('stats:agent'),
        redis.lrange('stats:recent', 0, 14) // Берем последние 15
      ]);
      
      const recent = recentRaw.map(item => JSON.parse(item));

      return res.status(200).json({ 
        human: parseInt(h) || 0, 
        agent: parseInt(a) || 0,
        recent: recent
      });
    } catch (e) {
      return res.status(500).json({ error: "Redis Read Error", details: e.message });
    }
  }

  // 2. РЕПОРТЕР (POST): Принимает данные от Sandbox
  if (req.method === 'POST') {
    try {
      const { risk, verdict, reason } = req.body;

      // Если данных нет в body, значит кто-то дернул эндпоинт впустую — игнорируем
      if (!verdict && risk === undefined) {
          return res.status(400).json({ error: "Empty payload" });
      }

      // Определяем тип на основе вердикта из Sandbox
      // Мы больше не проверяем заголовки здесь! Мы верим Sandbox.
      const isHuman = (verdict === 'Verified' || risk < 20);
      const type = isHuman ? 'human' : 'agent';

      // Атомарный инкремент счетчиков
      await redis.incr(`stats:${type}`);

      // Запись события
      const eventData = JSON.stringify({
        id: Math.random().toString(36).substr(2, 9),
        type: type,
        risk: risk || 0,
        reason: reason || (isHuman ? 'Human behavior' : 'Automated action'),
        time: new Date().toLocaleTimeString('ru-RU', { timeZone: 'Asia/Almaty' })
      });

      // LPUSH — новое всегда сверху. LTRIM — не даем базе раздуваться.
      await redis.lpush('stats:recent', eventData);
      await redis.ltrim('stats:recent', 0, 19); 

      return res.status(200).json({ success: true, recorded_as: type });
    } catch (e) {
      return res.status(500).json({ error: "Runtime Error", msg: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};
