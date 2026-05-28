import Redis from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
});

redis.on('connect', () => {
  console.log(' Redis Connected (Matching Engine)');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

export default redis;