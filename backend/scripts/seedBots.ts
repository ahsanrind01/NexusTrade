import { BOTS } from '../services/liquidity-bot-service/src/config/bots';

type SignupResponse =
  | {
      success: true;
      message: string;
      token: string;
      user: { id: string; name: string; email: string };
    }
  | {
      success: false;
      error: string;
    };

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3007';

const seedBot = async (bot: { id: string; email: string; password: string }) => {
  const payload = {
    name: bot.id,
    email: bot.email,
    password: bot.password,
  };

  const response = await fetch(`${AUTH_SERVICE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as SignupResponse;

  if (response.ok) {
    console.log(`[seed:bots] created ${bot.id} (${bot.email}) -> ${data.user.id}`);
    return;
  }

  if (!response.ok && 'error' in data && data.error === 'Email already registered') {
    console.log(`[seed:bots] skipped ${bot.id} (${bot.email}) - already exists`);
    return;
  }

  throw new Error(
    `[seed:bots] failed for ${bot.id} (${bot.email}) - ${response.status} ${'error' in data ? data.error : 'Unknown error'}`
  );
};

const main = async () => {
  console.log(`[seed:bots] seeding ${BOTS.length} bot accounts via ${AUTH_SERVICE_URL}`);

  for (const bot of BOTS) {
    await seedBot(bot);
  }

  console.log('[seed:bots] complete');
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
