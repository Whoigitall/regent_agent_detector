// api/flush.js
import { Redis } from '@upstash/redis';
const redis = Redis.fromEnv();

export default async function handler(req, res) {
    await redis.del('stats', 'recent', 'human_count', 'agent_count'); // Чистим всё
    return res.status(200).json({ message: 'Database wiped. Ready for clean start.' });
}
