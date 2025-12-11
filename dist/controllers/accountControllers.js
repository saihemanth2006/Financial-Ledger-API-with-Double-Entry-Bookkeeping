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
exports.router = void 0;
// src/controllers/accountController.ts
const express_1 = __importDefault(require("express"));
const db_1 = require("../db");
const repo = __importStar(require("../repositories/ledgerRepository"));
const uuid_1 = require("uuid");
exports.router = express_1.default.Router();
exports.router.post('/accounts', async (req, res) => {
    try {
        const { userId, accountType, currency, metadata } = req.body;
        if (!userId || !accountType || !currency)
            return res.status(400).json({ error: 'missing_fields' });
        const id = (0, uuid_1.v4)();
        await (0, db_1.withTransaction)(async (conn) => {
            await repo.createAccount(conn, { id, userId, accountType, currency, metadata });
        });
        // compute balance (no ledger entries yet)
        const conn = await db_1.pool.getConnection();
        const [rows] = await conn.query(`SELECT COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount ELSE -amount END), 0.0) AS balance FROM ledger_entry WHERE account_id = ?`, [id]);
        conn.release();
        const balance = rows[0].balance;
        res.status(201).json({ id, userId, accountType, currency, status: 'active', createdAt: new Date().toISOString(), balance: balance.toString() });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});
exports.router.get('/accounts/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const conn = await db_1.pool.getConnection();
        const [rows] = await conn.query('SELECT * FROM account WHERE id = ?', [id]);
        if (rows.length === 0) {
            conn.release();
            return res.status(404).json({ error: 'not_found' });
        }
        const account = rows[0];
        const [balRows] = await conn.query(`SELECT COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount ELSE -amount END), 0.0) AS balance FROM ledger_entry WHERE account_id = ?`, [id]);
        conn.release();
        const balance = balRows[0].balance;
        return res.json({ id: account.id, userId: account.user_id, accountType: account.account_type, currency: account.currency, status: account.status, createdAt: account.created_at, balance: balance.toString() });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});
exports.router.get('/accounts/:id/ledger', async (req, res) => {
    try {
        const id = req.params.id;
        const limit = Math.min(100, parseInt(req.query.limit || '50', 10));
        const offset = parseInt(req.query.offset || '0', 10);
        const conn = await db_1.pool.getConnection();
        const entries = await repo.getLedgerEntries(conn, id, limit, offset);
        conn.release();
        return res.json({ accountId: id, entries, limit, offset });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});
