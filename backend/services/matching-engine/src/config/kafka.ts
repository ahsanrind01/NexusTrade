import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'matching-engine',
  brokers: ['localhost:9092']
});

export const consumer = kafka.consumer({ groupId: 'matching-group' });
export const producer = kafka.producer();

export const connectKafka = async () => {
  await consumer.connect();
  await producer.connect();
  console.log('Kafka Connected: Consumer & Producer ready');
};