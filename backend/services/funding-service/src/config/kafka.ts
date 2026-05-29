import { Kafka, Producer, logLevel } from 'kafkajs';
import dotenv from 'dotenv';

dotenv.config();

const kafkaBroker = process.env.KAFKA_BROKER || 'localhost:9092';

process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';

const kafka = new Kafka({
  clientId: 'funding-service',
  brokers: [kafkaBroker],
  logLevel: logLevel.WARN, 
});

let producer: Producer | null = null;

export const getKafkaProducer = async (): Promise<Producer> => {
  if (producer) return producer;

  producer = kafka.producer();
  await producer.connect();
  console.log('⚡ [Funding Service] Kafka Producer connected successfully');
  return producer;
};

export const disconnectKafka = async (): Promise<void> => {
  if (producer) {
    await producer.disconnect();
    console.log('🔌 [Funding Service] Kafka Producer disconnected');
  }
};