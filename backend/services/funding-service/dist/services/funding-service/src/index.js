"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const fundingRoutes_1 = __importDefault(require("./routes/fundingRoutes"));
const withdrawalConsumer_1 = require("./workers/withdrawalConsumer");
const webhookController_1 = require("./controllers/webhookController");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3005;
app.post('/api/funding/stripe-webhook', express_1.default.raw({ type: 'application/json' }), webhookController_1.handleStripeWebhook);
app.use(express_1.default.json());
app.use('/api/funding', fundingRoutes_1.default);
(0, withdrawalConsumer_1.startWithdrawalConsumer)();
app.listen(PORT, () => {
    console.log(`Funding Service running on http://localhost:${PORT}`);
});
