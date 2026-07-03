"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("./config/db");
const kafka_1 = require("./config/kafka");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3006;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/api/auth', authRoutes_1.default);
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'Auth Service is healthy' });
});
const start = async () => {
    await (0, db_1.initDB)();
    await (0, kafka_1.connectAuthProducer)();
    app.listen(PORT, () => {
        console.log(`Auth Service running on http://localhost:${PORT}`);
    });
};
start().catch(console.error);
