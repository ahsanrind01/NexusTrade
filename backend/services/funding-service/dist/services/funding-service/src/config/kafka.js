"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.disconnectKafka = exports.getKafkaProducer = void 0;
const kafkajs_1 = require("kafkajs");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const kafkaBroker = process.env.KAFKA_BROKER || 'localhost:9092';
process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';
const kafka = new kafkajs_1.Kafka({
    clientId: 'funding-service',
    brokers: [kafkaBroker],
    logLevel: kafkajs_1.logLevel.WARN,
});
let producer = null;
const getKafkaProducer = async () => {
    if (producer)
        return producer;
    producer = kafka.producer();
    await producer.connect();
    console.log('⚡ [Funding Service] Kafka Producer connected successfully');
    return producer;
};
exports.getKafkaProducer = getKafkaProducer;
const disconnectKafka = async () => {
    if (producer) {
        await producer.disconnect();
        console.log('🔌 [Funding Service] Kafka Producer disconnected');
    }
};
exports.disconnectKafka = disconnectKafka;
