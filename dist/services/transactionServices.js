"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferService = transferService;
// src/services/transactionService.ts
const uuid_1 = require("uuid");
const db_1 = require("../db");
const repo = __importStar(require("../repositories/ledgerRepository"));
const error_1 = require("../utils/error");
const decimal_js_1 = __importDefault(require("decimal.js"));
async function transferService(sourceAccountId, destinationAccountId, amountStr, currency, reference, description) {
    if (sourceAccountId === destinationAccountId)
        throw new error_1.ApiError(400, 'source and destination must differ', 'invalid_accounts');
    const txId = (0, uuid_1.v4)();
    const debitId = (0, uuid_1.v4)();
    const creditId = (0, uuid_1.v4)();
    return await (0, db_1.withTransaction)(async (conn) => {
        // Lock both accounts in canonical order to avoid deadlock.
        const [firstId, secondId] = [sourceAccountId, destinationAccountId].sort();
        await repo.getAccountForUpdate(conn, firstId);
        await repo.getAccountForUpdate(conn, secondId);
        const source = await repo.getAccount(conn, sourceAccountId);
        const dest = await repo.getAccount(conn, destinationAccountId);
        if (!source)
            throw new error_1.ApiError(404, 'source account not found', 'source_not_found');
        if (!dest)
            throw new error_1.ApiError(404, 'destination account not found', 'destination_not_found');
        if (source.currency !== currency || dest.currency !== currency)
            throw new error_1.ApiError(400, 'currency mismatch', 'currency_mismatch');
        if (source.status !== 'active')
            throw new error_1.ApiError(422, 'source not active', 'source_not_active');
        if (dest.status !== 'active')
            throw new error_1.ApiError(422, 'destination not active', 'dest_not_active');
        // Create transaction record (pending)
        await repo.insertTransaction(conn, {
            id: txId,
            transactionType: 'transfer',
            sourceAccountId,
            destinationAccountId,
            amount: amountStr,
            currency,
            reference,
            description,
            status: 'pending'
        });
        // Compute source balance
        const balanceRaw = await repo.getBalance(conn, sourceAccountId);
        const balance = new decimal_js_1.default(balanceRaw);
        const amount = new decimal_js_1.default(amountStr);
        if (balance.minus(amount).isNegative()) {
            // mark failed and throw
            await repo.failTransaction(conn, txId);
            throw new error_1.ApiError(422, 'Insufficient funds', 'insufficient_funds');
        }
        // Insert ledger entries: debit source (amount), credit dest (amount)
        await repo.insertLedgerEntry(conn, {
            id: debitId,
            accountId: sourceAccountId,
            transactionId: txId,
            entryType: 'debit',
            amount: amount.toFixed(8),
            currency,
            note: description || null
        });
        await repo.insertLedgerEntry(conn, {
            id: creditId,
            accountId: destinationAccountId,
            transactionId: txId,
            entryType: 'credit',
            amount: amount.toFixed(8),
            currency,
            note: description || null
        });
        // Complete transaction
        await repo.completeTransaction(conn, txId);
        return {
            transactionId: txId,
            status: 'completed',
            sourceAccountId,
            destinationAccountId,
            amount: amount.toFixed(8),
            currency
        };
    });
}
