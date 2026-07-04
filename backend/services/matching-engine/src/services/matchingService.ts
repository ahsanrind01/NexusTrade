import * as orderBook from '../repositories/orderBookRepo';
import { producer } from '../config/kafka';

export const processNewOrder = async (incomingOrder: any) => {
  const orderType = String(incomingOrder.type ?? 'LIMIT').toUpperCase();
  const isMarketOrder = orderType === 'MARKET';
  const originalAmount = Number(incomingOrder.amount);
  const limitPrice = Number(incomingOrder.price);
  const baseAsset = incomingOrder.baseAsset ?? incomingOrder.asset.replace(/USDT$/, '');
  const quoteAsset = incomingOrder.quoteAsset ?? 'USDT';
  let remainingAmount = originalAmount;
  let matchFound = false;

  console.log(`\nProcessing ${incomingOrder.side} order for ${remainingAmount} ${incomingOrder.asset}`);

  while (remainingAmount > 0) {
    let bestMatch;

    if (incomingOrder.side === 'BUY') {
      bestMatch = await orderBook.getCheapestSellerExcludingUser(incomingOrder.asset, incomingOrder.userId);
      if (!bestMatch) break;
      if (!isMarketOrder && limitPrice < Number(bestMatch.price)) break;
    } else {
      bestMatch = await orderBook.getHighestBuyerExcludingUser(incomingOrder.asset, incomingOrder.userId);
      if (!bestMatch) break;
      if (!isMarketOrder && limitPrice > Number(bestMatch.price)) break;
    }

    matchFound = true;

    const originalMakerString = JSON.stringify(bestMatch);
    const originalSide = incomingOrder.side === 'BUY' ? 'SELL' : 'BUY';
    const makerOriginalAmount = Number(bestMatch.amount);

    const tradeAmount = Math.min(remainingAmount, makerOriginalAmount);
    remainingAmount -= tradeAmount;
    bestMatch.amount = makerOriginalAmount - tradeAmount;

    console.log(`TRADE: ${tradeAmount} ${incomingOrder.asset} @ $${bestMatch.price}`);

    await orderBook.removeExactOrderString(incomingOrder.asset, originalSide, originalMakerString);

    if (bestMatch.amount > 0) {
      await orderBook.addOrder(incomingOrder.asset, originalSide, bestMatch);
      console.log(`   -> Maker partial fill: ${bestMatch.amount} left on book.`);
    } else {
      console.log(`   -> Maker order fully filled and removed.`);
    }

    await publishTrade(incomingOrder, bestMatch, tradeAmount, Number(bestMatch.price), {
      baseAsset,
      quoteAsset,
      takerOriginalAmount: originalAmount,
      takerRemainingAmount: remainingAmount,
      makerOriginalAmount,
      makerRemainingAmount: bestMatch.amount,
      takerType: orderType,
      takerStatus: remainingAmount > 0 ? 'PARTIAL' : 'FILLED',
      makerStatus: bestMatch.amount > 0 ? 'PARTIAL' : 'FILLED',
    });
  }

  if (remainingAmount > 0) {
    if (!isMarketOrder) {
      incomingOrder.amount = remainingAmount;
      await orderBook.addOrder(incomingOrder.asset, incomingOrder.side, incomingOrder);

      if (matchFound) {
        console.log(`   -> Taker partial fill: ${remainingAmount} resting on book.`);
      } else {
        console.log(`   -> No match found. Entire order resting on book.`);
      }
    } else if (matchFound) {
      console.log(`   -> Market order partially filled; remainder cancelled.`);
    } else {
      console.log(`   -> Market order had no liquidity; nothing executed.`);
    }
  } else {
    console.log(`   -> Taker order fully filled!`);
  }

  if (isMarketOrder || remainingAmount === 0) {
    await producer.send({
      topic: 'order-finalized',
      messages: [{
        value: JSON.stringify({
          orderId: incomingOrder.orderId,
          userId: incomingOrder.userId,
          asset: incomingOrder.asset,
          side: incomingOrder.side,
          type: orderType,
          status: matchFound ? (remainingAmount > 0 ? 'PARTIAL' : 'FILLED') : 'CANCELLED',
          remainingAmount: 0,
          closed: true,
          timestamp: new Date().toISOString(),
        }),
      }],
    });
  }
};

export const processCancelledOrder = async (cancelledOrder: any) => {
  const removed = await orderBook.removeOrderById(
    cancelledOrder.asset,
    cancelledOrder.side,
    cancelledOrder.orderId
  );

  if (removed) {
    console.log(`Cancelled order removed from book: ${cancelledOrder.orderId}`);
  } else {
    console.log(`Cancelled order not found in book: ${cancelledOrder.orderId}`);
  }
};

const publishTrade = async (
  taker: any,
  maker: any,
  amount: number,
  price: number,
  meta: {
    baseAsset: string;
    quoteAsset: string;
    takerOriginalAmount: number;
    takerRemainingAmount: number;
    makerOriginalAmount: number;
    makerRemainingAmount: number;
    takerType: string;
    takerStatus: 'PARTIAL' | 'FILLED';
    makerStatus: 'PARTIAL' | 'FILLED';
  }
) => {
  await producer.send({
    topic: 'completed-trades', 
    messages: [{
      value: JSON.stringify({
        tradeId: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(), 
        asset: taker.asset,
        baseAsset: meta.baseAsset,
        quoteAsset: meta.quoteAsset,
        price: price, 
        amount: amount,
        quoteAmount: amount * price,
        takerOrderId: taker.orderId,
        makerOrderId: maker.orderId,
        takerUserId: taker.userId, 
        makerUserId: maker.userId,
        takerSide: taker.side,
        takerOriginalAmount: meta.takerOriginalAmount,
        takerRemainingAmount: meta.takerRemainingAmount,
        makerOriginalAmount: meta.makerOriginalAmount,
        makerRemainingAmount: meta.makerRemainingAmount,
        takerStatus: meta.takerStatus,
        makerStatus: meta.makerStatus,
        timestamp: new Date().toISOString()
      }),
    }],
  });
};
