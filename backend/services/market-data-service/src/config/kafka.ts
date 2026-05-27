import { Kafka } from 'kafkajs';

export const kafka = new Kafka({
  clientId: 'market-data',
  brokers: ['localhost:9092']
});

export const consumer = kafka.consumer({ groupId: 'market-data-group' });