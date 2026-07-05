"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureKafkaTopics = void 0;
const kafkajs_1 = require("kafkajs");
const DEFAULT_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const ensureKafkaTopics = async (clientId, topics) => {
    const kafka = new kafkajs_1.Kafka({
        clientId: `${clientId}-topic-bootstrap`,
        brokers: [DEFAULT_BROKER],
    });
    const admin = kafka.admin();
    await admin.connect();
    try {
        const uniqueTopics = [...new Set(topics)]
            .filter(Boolean)
            .map((topic) => ({
            topic,
            numPartitions: 1,
            replicationFactor: 1,
        }));
        if (uniqueTopics.length > 0) {
            await admin.createTopics({
                topics: uniqueTopics,
                waitForLeaders: true,
            });
        }
    }
    finally {
        await admin.disconnect();
    }
};
exports.ensureKafkaTopics = ensureKafkaTopics;
