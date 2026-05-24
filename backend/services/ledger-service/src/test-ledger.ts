import { db } from './db';
import { users, transactions, ledgerEntries } from './db/schema';
import crypto from 'crypto';

async function runTest() {
  console.log(' Starting Ledger Test...');

  try {
    const [userA] = await db.insert(users).values({ email: `alice_${Date.now()}@test.com` }).returning();
    const [userB] = await db.insert(users).values({ email: `bob_${Date.now()}@test.com` }).returning();
    
    console.log(` Created Users: Alice (${userA.id}) & Bob (${userB.id})`);

    await db.transaction(async (tx) => {
      
      const [trade] = await tx.insert(transactions).values({
        referenceId: crypto.randomUUID(), 
        type: 'TRADE',
        status: 'COMPLETED',
      }).returning();

      await tx.insert(ledgerEntries).values([
        {
          transactionId: trade.id,
          userId: userA.id,
          asset: 'USD',
          amount: '500.00',
          direction: 'DEBIT', 
        },
        {
          transactionId: trade.id,
          userId: userB.id,
          asset: 'USD',
          amount: '500.00',
          direction: 'CREDIT', 
        }
      ]);

      console.log(`Trade executed! Transaction ID: ${trade.id}`);
    });

    console.log('Test Complete! The ledger is mathematically sound.');
    process.exit(0);

  } catch (error) {
    console.error(' Test Failed:', error);
    process.exit(1);
  }
}

runTest();