// src/repositories/ledgerRepository.ts
import mysql from 'mysql2/promise';

export async function getAccountForUpdate(conn: mysql.PoolConnection, accountId: string) {
  // Locks the selected account row FOR UPDATE
  const [rows] = await conn.query('SELECT * FROM account WHERE id = ? FOR UPDATE', [accountId]);
  return (rows as any[])[0] || null;
}

export async function getAccount(conn: mysql.PoolConnection, accountId: string) {
  const [rows] = await conn.query('SELECT * FROM account WHERE id = ?', [accountId]);
  return (rows as any[])[0] || null;
}

export async function insertTransaction(conn: mysql.PoolConnection, tx: any) {
  const sql = `INSERT INTO money_transaction
    (id, transaction_type, source_account_id, destination_account_id, amount, currency, reference, description, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`;
  const params = [
    tx.id, tx.transactionType, tx.sourceAccountId || null, tx.destinationAccountId || null,
    tx.amount, tx.currency, tx.reference || null, tx.description || null, tx.status || 'pending'
  ];
  await conn.query(sql, params);
  return tx;
}

export async function insertLedgerEntry(conn: mysql.PoolConnection, entry: any) {
  const sql = `INSERT INTO ledger_entry
    (id, account_id, transaction_id, entry_type, amount, currency, note)
    VALUES (?, ?, ?, ?, ?, ?, ?);`;
  const params = [entry.id, entry.accountId, entry.transactionId, entry.entryType, entry.amount, entry.currency, entry.note || null];
  await conn.query(sql, params);
  return entry;
}

export async function completeTransaction(conn: mysql.PoolConnection, txId: string) {
  await conn.query('UPDATE money_transaction SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?', ['completed', txId]);
}

export async function failTransaction(conn: mysql.PoolConnection, txId: string) {
  await conn.query('UPDATE money_transaction SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?', ['failed', txId]);
}

export async function getBalance(conn: mysql.PoolConnection, accountId: string) {
  // Sum credits as positive, debits as negative.
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount ELSE -amount END), 0.0) AS balance
     FROM ledger_entry WHERE account_id = ?`, [accountId]
  );
  const res = (rows as any[])[0];
  // returns decimal as string or number depending on driver config; use as string for safety
  return res ? res.balance : '0';
}

export async function createAccount(conn: mysql.PoolConnection, account: any) {
  const sql = `INSERT INTO account (id, user_id, account_type, currency, status, metadata) VALUES (?, ?, ?, ?, ?, ?)`;
  await conn.query(sql, [account.id, account.userId, account.accountType, account.currency, account.status || 'active', JSON.stringify(account.metadata || {})]);
  return account;
}

export async function getLedgerEntries(conn: mysql.PoolConnection, accountId: string, limit=50, offset=0) {
  const [rows] = await conn.query(`SELECT id, transaction_id as transactionId, entry_type as entryType, amount, currency, note, created_at as createdAt
    FROM ledger_entry WHERE account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`, [accountId, limit, offset]);
  return rows as any[];
}
