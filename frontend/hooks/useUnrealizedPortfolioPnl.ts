import { useMemo } from 'react';
import type { Trade } from '../stores/orderStore';

const STABLE_ASSETS = new Set([
  'USDT',
  'USDC',
  'FDUSD',
  'BUSD',
  'DAI',
  'TUSD',
  'USDP',
  'EURC',
]);

const QUOTE_SUFFIXES = [
  'USDT',
  'USDC',
  'FDUSD',
  'BUSD',
  'DAI',
  'TUSD',
  'USDP',
  'EURC',
  'BTC',
  'ETH',
  'TRY',
  'EUR',
  'BRL',
  'GBP',
  'AUD',
];

export interface UnrealizedPortfolioPnl {
  pnlUsd: number;
  pnlPercent: number;
  costBasisUsd: number;
  currentValueUsd: number;
  hasCostBasisData: boolean;
}

type Position = {
  quantity: number;
  costBasis: number;
};

function normalizeTradeAsset(symbol: string) {
  const upper = symbol.toUpperCase();
  const suffix = QUOTE_SUFFIXES.find((quote) => upper.endsWith(quote));
  return suffix ? upper.slice(0, -suffix.length) : upper;
}

function isStableAsset(asset: string) {
  return STABLE_ASSETS.has(asset.toUpperCase());
}

export function calculateUnrealizedPortfolioPnl(
  balances: Record<string, number>,
  livePrices: Record<string, number>,
  trades: Trade[]
): UnrealizedPortfolioPnl {
  const positions: Record<string, Position> = {};

  const sortedTrades = [...trades].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (const trade of sortedTrades) {
    const asset = normalizeTradeAsset(trade.asset);
    if (isStableAsset(asset)) continue;

    const amount = Number(trade.amount);
    const price = Number(trade.price);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(price) || price <= 0) {
      continue;
    }

    const current = positions[asset] ?? { quantity: 0, costBasis: 0 };

    if (trade.side === 'BUY') {
      current.quantity += amount;
      current.costBasis += amount * price;
    } else if (current.quantity > 0) {
      const sellAmount = Math.min(amount, current.quantity);
      const averageCost = current.costBasis / current.quantity;
      current.quantity -= sellAmount;
      current.costBasis = Math.max(current.costBasis - (averageCost * sellAmount), 0);
    }

    positions[asset] = current;
  }

  let pnlUsd = 0;
  let costBasisUsd = 0;
  let currentValueUsd = 0;

  for (const [asset, rawBalance] of Object.entries(balances)) {
    const assetKey = asset.toUpperCase();
    const balance = Number(rawBalance);
    if (!Number.isFinite(balance) || balance <= 0 || isStableAsset(assetKey)) {
      continue;
    }

    const position = positions[assetKey];
    if (!position || position.quantity <= 0 || position.costBasis <= 0) {
      continue;
    }

    const livePrice = Number(livePrices[assetKey] ?? 0);
    if (!Number.isFinite(livePrice) || livePrice <= 0) {
      continue;
    }

    const averageCost = position.costBasis / position.quantity;
    const assetPnl = (livePrice - averageCost) * balance;
    const assetCostBasis = averageCost * balance;

    pnlUsd += assetPnl;
    costBasisUsd += assetCostBasis;
    currentValueUsd += livePrice * balance;
  }

  return {
    pnlUsd,
    pnlPercent: costBasisUsd > 0 ? (pnlUsd / costBasisUsd) * 100 : 0,
    costBasisUsd,
    currentValueUsd,
    hasCostBasisData: costBasisUsd > 0,
  };
}

export function useUnrealizedPortfolioPnl(
  balances: Record<string, number>,
  livePrices: Record<string, number>,
  trades: Trade[]
) {
  return useMemo(
    () => calculateUnrealizedPortfolioPnl(balances, livePrices, trades),
    [balances, livePrices, trades]
  );
}
