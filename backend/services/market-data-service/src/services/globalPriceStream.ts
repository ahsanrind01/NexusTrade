import WebSocket from 'ws';
import { getIo } from '../sockets/io';


const TOP_20_PAIRS = [
  'btcusdt', 'ethusdt', 'bnbusdt', 'solusdt', 'xrpusdt',
  'adausdt', 'dogeusdt', 'avaxusdt', 'dotusdt', 'linkusdt',
  'maticusdt', 'uniusdt', 'ltcusdt', 'bchusdt', 'shibusdt',
  'nearusdt', 'apetusdt', 'filusdt', 'rndrusdt', 'aptusdt'
];

export const startGlobalPriceStream = () => {

  const streamParams = TOP_20_PAIRS.map(pair => `${pair}@trade`).join('/');
  const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streamParams}`;

  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log(`Connected to Binance Global Firehose (${TOP_20_PAIRS.length} pairs)`);
  });

  ws.on('message', (data: WebSocket.Data) => {
    try {
      const payload = JSON.parse(data.toString());
      
      if (!payload.data) return;
      const trade = payload.data;
      
      const priceData = {
        asset: trade.s, 
        price: parseFloat(trade.p),
        amount: parseFloat(trade.q),
        timestamp: new Date(trade.T).toISOString(),
        source: 'BINANCE_GLOBAL'
      };

      const io = getIo();
      io.emit('global-price-update', priceData);
      
    } catch (error) {
      console.error('Error parsing global price data:', error);
    }
  });

  ws.on('close', () => {
    console.log('Binance stream disconnected. Reconnecting in 5s...');
    setTimeout(startGlobalPriceStream, 5000); 
  });

  ws.on('error', (err) => {
    console.error('Binance stream error:', err.message);
  });
};