import { create } from 'zustand';

export type OrderSide = 'BUY' | 'SELL';
export type OrderStatus = 'PENDING' | 'FILLED' | 'CANCELLED' | 'PARTIAL';
export type OrderType = 'LIMIT' | 'MARKET';
export type TradeRole = 'MAKER' | 'TAKER';

export interface Order {
  id: string;
  userId: string;
  asset: string;
  side: OrderSide;
  price: string;
  amount: string;
  status: OrderStatus;
  type?: OrderType;
  createdAt: string;
}

export interface Trade {
  id: string;
  tradeId: string;
  userId: string;
  orderId: string;
  asset: string;
  side: OrderSide;
  role: TradeRole;
  price: string;
  amount: string;
  createdAt: string;
}

interface OrderState {
  orders: Order[];
  trades: Trade[];
  lastFetched: number | null;
  setOrders: (orders: Order[]) => void;
  setTrades: (trades: Trade[]) => void;
  upsertOrder: (order: Order) => void;
  removeOrder: (orderId: string) => void;
}

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],
  trades: [],
  lastFetched: null,

  setOrders: (orders) => set({ orders, lastFetched: Date.now() }),

  setTrades: (trades) => set({ trades }),
  
  upsertOrder: (order) => {
    const existing = get().orders;
    const idx = existing.findIndex((o) => o.id === order.id);
    if (idx === -1) {
      set({ orders: [order, ...existing] });
    } else {
      const next = [...existing];
      next[idx] = order;
      set({ orders: next });
    }
  },

  removeOrder: (orderId) => {
    set({ orders: get().orders.filter((o) => o.id !== orderId) });
  },
}));