"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccountForUpdate = getAccountForUpdate;
exports.getAccount = getAccount;
exports.insertTransaction = insertTransaction;
exports.insertLedgerEntry = insertLedgerEntry;
exports.completeTransaction = completeTransaction;
exports.failTransaction = failTransaction;
exports.getBalance = getBalance;
exports.createAccount = createAccount;
exports.getLedgerEntries = getLedgerEntries;
async function getAccountForUpdate(conn, accountId) {
    // Locks the selected account row FOR UPDATE
    const [rows] = await conn.query('SELECT * FROM account WHERE id = ? FOR UPDATE', [accountId]);
    return rows[0] || null;
}
async function getAccount(conn, accountId) {
    const [rows] = await conn.query('SELECT * FROM account WHERE id = ?', [accountId]);
    return rows[0] || null;
}
async function insertTransaction(conn, tx) {
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
async function insertLedgerEntry(conn, entry) {
    const sql = `INSERT INTO ledger_entry
    (id, account_id, transaction_id, entry_type, amount, currency, note)
    VALUES (?, ?, ?, ?, ?, ?, ?);`;
    const params = [entry.id, entry.accountId, entry.transactionId, entry.entryType, entry.amount, entry.currency, entry.note || null];
    await conn.query(sql, params);
    return entry;
}
async function completeTransaction(conn, txId) {
    await conn.query('UPDATE money_transaction SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?', ['completed', txId]);
}
async function failTransaction(conn, txId) {
    await conn.query('UPDATE money_transaction SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?', ['failed', txId]);
}
async function getBalance(conn, accountId) {
    // Sum credits as positive, debits as negative.
    const [rows] = await conn.query(`SELECT COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount ELSE -amount END), 0.0) AS balance
     FROM ledger_entry WHERE account_id = ?`, [accountId]);
    const res = rows[0];
    // returns decimal as string or number depending on driver config; use as string for safety
    return res ? res.balance : '0';
}
async function createAccount(conn, account) {
    const sql = `INSERT INTO account (id, user_id, account_type, currency, status, metadata) VALUES (?, ?, ?, ?, ?, ?)`;
    await conn.query(sql, [account.id, account.userId, account.accountType, account.currency, account.status || 'active', JSON.stringify(account.metadata || {})]);
    return account;
}
async function getLedgerEntries(conn, accountId, limit = 50, offset = 0) {
    const [rows] = await conn.query(`SELECT id, transaction_id as transactionId, entry_type as entryType, amount, currency, note, created_at as createdAt
    FROM ledger_entry WHERE account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`, [accountId, limit, offset]);
    return rows;
}
