import { Kafka } from 'kafkajs';

export const kafka = new Kafka({
  clientId: 'order-service',
  brokers: ['localhost:9092'] 
});

export const producer = kafka.producer();

export const connectProducer = async () => {
  try {
    await producer.connect();
    console.log(' Order Service successfully connected to Kafka Producer');
  } catch (error) {
    console.error('Failed to connect to Kafka:', error);
  }
};