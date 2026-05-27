import * as orderBook from '../repositories/orderBookRepo';
import { producer } from '../config/kafka';

export const processNewOrder = async (incomingOrder: any) => {
  let remainingAmount = incomingOrder.amount;
  let matchFound = false;

  console.log(`\n⚙️ Processing ${incomingOrder.side} order for ${remainingAmount} ${incomingOrder.asset}`);

  while (remainingAmount > 0) {
    let bestMatch;

    if (incomingOrder.side === 'BUY') {
      bestMatch = await orderBook.getCheapestSeller(incomingOrder.asset);
      if (!bestMatch || incomingOrder.price < bestMatch.price) break; 
    } else {
      bestMatch = await orderBook.getHighestBuyer(incomingOrder.asset);
      if (!bestMatch || incomingOrder.price > bestMatch.price) break; 
    }

    matchFound = true;

    // 1. Save the exact string of the Maker BEFORE we do any math
    const originalMakerString = JSON.stringify(bestMatch);
    const originalSide = incomingOrder.side === 'BUY' ? 'SELL' : 'BUY';

    // 2. The Partial Fill Math
    const tradeAmount = Math.min(remainingAmount, bestMatch.amount);
    remainingAmount -= tradeAmount;
    bestMatch.amount -= tradeAmount;

    console.log(`✅ TRADE: ${tradeAmount} ${incomingOrder.asset} @ $${bestMatch.price}`);

    // 3. Remove the old order from Redis using the saved string
    await orderBook.removeExactOrderString(incomingOrder.asset, originalSide, originalMakerString);

    // 4. If the Maker still has crypto left, put them back on the book
    if (bestMatch.amount > 0) {
      await orderBook.addOrder(incomingOrder.asset, originalSide, bestMatch);
      console.log(`   -> Maker partial fill: ${bestMatch.amount} left on book.`);
    } else {
      console.log(`   -> Maker order fully filled and removed.`);
    }

    // 5. Send receipt to Kafka
    await publishTrade(incomingOrder, bestMatch, tradeAmount, bestMatch.price);
  }

  // 6. Update the Taker (The incoming order)
  if (remainingAmount > 0) {
    incomingOrder.amount = remainingAmount;
    await orderBook.addOrder(incomingOrder.asset, incomingOrder.side, incomingOrder);
    
    if (matchFound) {
      console.log(`   -> Taker partial fill: ${remainingAmount} resting on book.`);
    } else {
      console.log(`   -> No match found. Entire order resting on book.`);
    }
  } else {
    console.log(`   -> Taker order fully filled!`);
  }
};

const publishTrade = async (taker: any, maker: any, amount: number, price: number) => {
  await producer.send({
    topic: 'completed-trades', 
    messages: [{
      value: JSON.stringify({
        tradeId: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(), // fallback if crypto isn't imported
        asset: taker.asset,
        price: price, 
        amount: amount,
        takerOrderId: taker.orderId,
        makerOrderId: maker.orderId,
        timestamp: new Date().toISOString()
      }),
    }],
  });
};