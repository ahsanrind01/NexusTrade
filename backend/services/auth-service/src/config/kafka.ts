import { Kafka } from 'kafkajs';
import dotenv from 'dotenv';

dotenv.config();

const kafka = new Kafka({
  clientId: 'auth-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

const producer = kafka.producer();

export const connectAuthProducer = async () => {
  try {
    await producer.connect();
    console.log('[Auth Service] Kafka Producer connected successfully');
  } catch (error) {
    console.error('[Auth Service] Kafka Producer connection failed:', error);
  }
};

export const emitUserCreatedEvent = async (userId: string, email: string, name: string) => {
  try {
    await producer.send({
      topic: 'user-created',
      messages: [
        {
          value: JSON.stringify({ userId, email, name, timestamp: new Date() }),
        },
      ],
    });
    console.log(`[Auth Kafka] Emitted 'user-created' for User ID: ${userId}`);
  } catch (error) {
    console.error('[Auth Kafka] Failed to emit user event:', error);
  }
};
