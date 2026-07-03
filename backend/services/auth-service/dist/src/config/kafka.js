"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitUserCreatedEvent = exports.connectAuthProducer = void 0;
const kafkajs_1 = require("kafkajs");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const kafka = new kafkajs_1.Kafka({
    clientId: 'auth-service',
    brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});
const producer = kafka.producer();
const connectAuthProducer = async () => {
    try {
        await producer.connect();
        console.log('[Auth Service] Kafka Producer connected successfully');
    }
    catch (error) {
        console.error('[Auth Service] Kafka Producer connection failed:', error);
    }
};
exports.connectAuthProducer = connectAuthProducer;
const emitUserCreatedEvent = async (userId, email, name) => {
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
    }
    catch (error) {
        console.error('[Auth Kafka] Failed to emit user event:', error);
    }
};
exports.emitUserCreatedEvent = emitUserCreatedEvent;
