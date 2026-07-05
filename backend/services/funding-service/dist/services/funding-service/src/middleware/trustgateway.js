"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trustGateway = void 0;
const trustGateway = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    const userEmail = req.headers['x-user-email'];
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    req.userId = userId;
    req.userEmail = userEmail;
    return next();
};
exports.trustGateway = trustGateway;
