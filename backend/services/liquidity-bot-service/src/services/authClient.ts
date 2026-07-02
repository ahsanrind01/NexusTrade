import { BOTS } from '../config/bots';
import { BotSession, LoginResponse } from '../types';
import { getErrorDetails, requestWithRetry } from './httpClient';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';

// In-memory token cache, keyed by bot id
const sessions = new Map<string, BotSession>();

// Fallback TTL if auth-service doesn't return expiresIn (50 min, JWTs are commonly 1hr)
const DEFAULT_TTL_MS = 50 * 60 * 1000;

const login = async (botId: string): Promise<BotSession> => {
  const bot = BOTS.find(b => b.id === botId);
  if (!bot) {
    throw new Error(`Unknown bot id: ${botId}`);
  }

  const response = await requestWithRetry<LoginResponse>({
    method: 'POST',
    url: `${GATEWAY_URL}/api/auth/login`,
    data: {
      email: bot.email,
      password: bot.password
    }
  });

  const { token, expiresIn } = response;
  const ttlMs = expiresIn ? expiresIn * 1000 : DEFAULT_TTL_MS;

  const session: BotSession = {
    botId,
    token,
    expiresAt: Date.now() + ttlMs
  };

  sessions.set(botId, session);
  console.log(`[auth] Bot ${botId} logged in, token valid until ${new Date(session.expiresAt).toISOString()}`);

  return session;
};

// Called once at startup for every configured bot
export const loginAllBots = async (): Promise<void> => {
  await Promise.all(BOTS.map(async bot => {
    try {
      await login(bot.id);
    } catch (err: any) {
      console.error(`[auth] Failed to log in bot ${bot.id}: ${getErrorDetails(err)}`);
    }
  }));
};

// Returns a valid token for the bot, re-logging in if missing/expired.
// Call this before every API call — cheap no-op when the cached token is still fresh.
export const getToken = async (botId: string): Promise<string> => {
  const existing = sessions.get(botId);

  if (existing && existing.expiresAt > Date.now() + 5000) {
    return existing.token;
  }

  const session = await login(botId);
  return session.token;
};

// Call this if a request comes back 401 mid-flight, to force a fresh login
// even if our local expiry clock thought the token was still valid.
export const invalidateSession = (botId: string): void => {
  sessions.delete(botId);
};
