import express from 'express';
import http from 'http';
import cors from 'cors';
import { initSocket } from './sockets/io';
import { startMarketConsumer } from './services/marketConsumer';
import { startGlobalPriceStream } from './services/globalPriceStream'; 

const app = express();
app.use(cors());

const server = http.createServer(app);
initSocket(server);

startMarketConsumer().catch(console.error);

startGlobalPriceStream(); 

const PORT = 3003;
server.listen(PORT, () => {
  console.log(`📡 Market Data WebSocket Server running on port ${PORT}`);
});