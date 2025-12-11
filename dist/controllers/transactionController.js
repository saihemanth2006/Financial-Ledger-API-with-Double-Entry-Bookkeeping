"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
// src/controllers/transactionController.ts
const express_1 = __importDefault(require("express"));
const transactionServices_1 = require("../services/transactionServices");
const error_1 = require("../utils/error");
exports.router = express_1.default.Router();
exports.router.post('/transfers', async (req, res) => {
    try {
        const { sourceAccountId, destinationAccountId, amount, currency, reference, description } = req.body;
        if (!sourceAccountId || !destinationAccountId || !amount || !currency) {
            return res.status(400).json({ error: 'missing_fields' });
        }
        const result = await (0, transactionServices_1.transferService)(sourceAccountId, destinationAccountId, amount, currency, reference, description);
        return res.status(201).json(result);
    }
    catch (err) {
        if (err instanceof error_1.ApiError) {
            return res.status(err.status).json({ error: err.code || 'error', message: err.message });
        }
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});
