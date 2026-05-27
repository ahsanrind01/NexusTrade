import { Kafka } from 'kafkajs';
import Redis from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
});

redis.on('connect', () => {
  console.log('Matching Engine connected to Redis');
});

const kafka = new Kafka({
  clientId: 'matching-engine',
  brokers: ['localhost:9092']
});

const consumer = kafka.consumer({ groupId: 'matching-group' });
const producer = kafka.producer(); 

const run = async () => {
  await consumer.connect();
  await producer.connect(); 
  console.log('Matching Engine connected to Kafka Consumer & Producer');

  await consumer.subscribe({ topic: 'pending-orders', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      const order = JSON.parse(message.value.toString());
      console.log(`\nMatching Engine caught: ${order.side} ${order.amount} ${order.asset} @ $${order.price}`);
      
      const redisKey = `orderbook:${order.asset}:${order.side}`;

      try {
        await redis.zadd(redisKey, order.price, JSON.stringify(order));
        
        const totalOrders = await redis.zcard(redisKey);
        console.log(`Added to Redis! Total ${order.side} orders for ${order.asset}: ${totalOrders}`);

        const oppositeSide = order.side === 'BUY' ? 'SELL' : 'BUY';
        const oppositeKey = `orderbook:${order.asset}:${oppositeSide}`;

        let matchFound = false;

        if (order.side === 'BUY') {
          const bestSellers = await redis.zrange(oppositeKey, 0, 0); 
          
          if (bestSellers.length > 0) {
            const bestSellOrder = JSON.parse(bestSellers[0]);
            
            if (order.price >= bestSellOrder.price) {
              console.log(`\nTRADE EXECUTED! BUY order matched with SELL order at $${bestSellOrder.price}!`);
              
              await redis.zrem(redisKey, JSON.stringify(order));
              await redis.zrem(oppositeKey, bestSellers[0]);
              matchFound = true;

              await producer.send({
                topic: 'completed-trades', 
                messages: [{
                  value: JSON.stringify({
                    asset: order.asset,
                    price: bestSellOrder.price, 
                    amount: order.amount,      
                    timestamp: new Date().toISOString()
                  }),
                }],
              });
            }
          }
        } else {
          const bestBuyers = await redis.zrevrange(oppositeKey, 0, 0);
          
          if (bestBuyers.length > 0) {
            const bestBuyOrder = JSON.parse(bestBuyers[0]);
            
            if (order.price <= bestBuyOrder.price) {
              console.log(`\nTRADE EXECUTED! SELL order matched with BUY order at $${bestBuyOrder.price}!`);
              
              await redis.zrem(redisKey, JSON.stringify(order));
              await redis.zrem(oppositeKey, bestBuyers[0]);
              matchFound = true;

              await producer.send({
                topic: 'completed-trades', 
                messages: [{
                  value: JSON.stringify({
                    asset: order.asset,
                    price: bestBuyOrder.price, 
                    amount: order.amount,     
                    timestamp: new Date().toISOString()
                  }),
                }],
              });
            }
          }
        }

        if (!matchFound) {
          console.log(`No match found yet. Order resting in the book.`);
        }

      } catch (error) {
        console.error('Redis Error:', error);
      }
    },
  });
};

run().catch(console.error);