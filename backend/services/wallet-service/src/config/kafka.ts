import { Kafka } from 'kafkajs';

const kafka = new Kafka({ 
    clientId: 'wallet-service',
    brokers: ['localhost:9092']
 });
 
export const consumer = kafka.consumer({ groupId: 'wallet-group' });