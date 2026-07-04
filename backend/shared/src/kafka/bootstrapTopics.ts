import { Kafka } from 'kafkajs';

const DEFAULT_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';

export const ensureKafkaTopics = async (clientId: string, topics: string[]) => {
  const kafka = new Kafka({
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
  } finally {
    await admin.disconnect();
  }
};
