import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes/index';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.use('/api', routes);

app.listen(PORT, () => {
  console.log(`API Gateway running on http://localhost:${PORT}`);
});
