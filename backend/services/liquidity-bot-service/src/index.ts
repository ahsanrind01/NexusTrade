import express from 'express';
import { BOTS } from './config/bots';
import { loginAllBots } from './services/authClient';
import { startBotWorker } from './bots/botWorker';

const app = express();
const PORT = process.env.PORT || 3006;

const activeWorkers = new Map<string, () => void>();

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    bots: BOTS.map(b => ({
      id: b.id,
      symbol: b.symbol,
      running: activeWorkers.has(b.id)
    }))
  });
});

const bootstrap = async () => {
  console.log(`Liquidity Bot Service starting with ${BOTS.length} bot(s)...`);

  await loginAllBots();

  for (const bot of BOTS) {
    const stopWorker = startBotWorker(bot);
    activeWorkers.set(bot.id, stopWorker);
  }

  app.listen(PORT, () => {
    console.log(`Liquidity Bot Service health endpoint running on port ${PORT}`);
  });
};

bootstrap().catch(err => {
  console.error('Failed to bootstrap Liquidity Bot Service:', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('Shutting down bot workers...');
  for (const stopWorker of activeWorkers.values()) {
    stopWorker();
  }
  process.exit(0);
});
