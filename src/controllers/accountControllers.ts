// src/controllers/accountController.ts
import express from 'express';
import { pool, withTransaction } from '../db';
import * as repo from '../repositories/ledgerRepository';
import { v4 as uuidv4 } from 'uuid';

export const router = express.Router();

router.post('/accounts', async (req, res) => {
  try {
    const { userId, accountType, currency, metadata } = req.body;
    if (!userId || !accountType || !currency) return res.status(400).json({ error: 'missing_fields' });
    const id = uuidv4();
    await withTransaction(async (conn) => {
      await repo.createAccount(conn, { id, userId, accountType, currency, metadata });
    });
    // compute balance (no ledger entries yet)
    const conn = await (pool as any).getConnection();
    const [rows] = await conn.query(`SELECT COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount ELSE -amount END), 0.0) AS balance FROM ledger_entry WHERE account_id = ?`, [id]);
    conn.release();
    const balance = (rows as any[])[0].balance;
    res.status(201).json({ id, userId, accountType, currency, status: 'active', createdAt: new Date().toISOString(), balance: balance.toString() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/accounts/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const conn = await (pool as any).getConnection();
    const [rows] = await conn.query('SELECT * FROM account WHERE id = ?', [id]);
    if ((rows as any[]).length === 0) {
      conn.release();
      return res.status(404).json({ error: 'not_found' });
    }
    const account = (rows as any[])[0];
    const [balRows] = await conn.query(`SELECT COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount ELSE -amount END), 0.0) AS balance FROM ledger_entry WHERE account_id = ?`, [id]);
    conn.release();
    const balance = (balRows as any[])[0].balance;
    return res.json({ id: account.id, userId: account.user_id, accountType: account.account_type, currency: account.currency, status: account.status, createdAt: account.created_at, balance: balance.toString() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/accounts/:id/ledger', async (req, res) => {
  try {
    const id = req.params.id;
    const limit = Math.min(100, parseInt((req.query.limit as string) || '50', 10));
    const offset = parseInt((req.query.offset as string) || '0', 10);
    const conn = await (pool as any).getConnection();
    const entries = await repo.getLedgerEntries(conn, id, limit, offset);
    conn.release();
    return res.json({ accountId: id, entries, limit, offset });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});
