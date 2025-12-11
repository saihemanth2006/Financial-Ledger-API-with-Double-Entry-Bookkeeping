// src/services/transactionService.ts
import { v4 as uuidv4 } from 'uuid';
import { withTransaction } from '../db';
import * as repo from '../repositories/ledgerRepository';
import { ApiError } from '../utils/error';
import Decimal from 'decimal.js';

export async function transferService(sourceAccountId: string, destinationAccountId: string, amountStr: string, currency: string, reference?: string, description?: string) {
  if (sourceAccountId === destinationAccountId) throw new ApiError(400, 'source and destination must differ', 'invalid_accounts');

  const txId = uuidv4();
  const debitId = uuidv4();
  const creditId = uuidv4();

  return await withTransaction(async (conn) => {
    // Lock both accounts in canonical order to avoid deadlock.
    const [firstId, secondId] = [sourceAccountId, destinationAccountId].sort();
    await repo.getAccountForUpdate(conn, firstId);
    await repo.getAccountForUpdate(conn, secondId);

    const source = await repo.getAccount(conn, sourceAccountId);
    const dest = await repo.getAccount(conn, destinationAccountId);
    if (!source) throw new ApiError(404, 'source account not found', 'source_not_found');
    if (!dest) throw new ApiError(404, 'destination account not found', 'destination_not_found');

    if (source.currency !== currency || dest.currency !== currency) throw new ApiError(400, 'currency mismatch', 'currency_mismatch');
    if (source.status !== 'active') throw new ApiError(422, 'source not active', 'source_not_active');
    if (dest.status !== 'active') throw new ApiError(422, 'destination not active', 'dest_not_active');

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
    const balance = new Decimal(balanceRaw);
    const amount = new Decimal(amountStr);

    if (balance.minus(amount).isNegative()) {
      // mark failed and throw
      await repo.failTransaction(conn, txId);
      throw new ApiError(422, 'Insufficient funds', 'insufficient_funds');
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

export async function depositService(destinationAccountId: string, amountStr: string, currency: string, description?: string) {
  const systemAccountId = '11111111-1111-1111-1111-111111111111';
  const txId = uuidv4();
  const debitId = uuidv4();
  const creditId = uuidv4();

  return await withTransaction(async (conn) => {
    await repo.getAccountForUpdate(conn, systemAccountId);
    await repo.getAccountForUpdate(conn, destinationAccountId);

    const system = await repo.getAccount(conn, systemAccountId);
    const dest = await repo.getAccount(conn, destinationAccountId);
    if (!system) throw new ApiError(500, 'system account missing', 'system_missing');
    if (!dest) throw new ApiError(404, 'destination account not found', 'destination_not_found');
    if (dest.currency !== currency) throw new ApiError(400, 'currency mismatch', 'currency_mismatch');
    if (dest.status !== 'active') throw new ApiError(422, 'destination not active', 'dest_not_active');

    await repo.insertTransaction(conn, {
      id: txId,
      transactionType: 'deposit',
      sourceAccountId: systemAccountId,
      destinationAccountId,
      amount: amountStr,
      currency,
      description,
      status: 'pending'
    });

    const amount = new Decimal(amountStr);

    await repo.insertLedgerEntry(conn, {
      id: debitId,
      accountId: systemAccountId,
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

    await repo.completeTransaction(conn, txId);

    return { transactionId: txId, status: 'completed', destinationAccountId, amount: amount.toFixed(8), currency };
  });
}

export async function withdrawalService(sourceAccountId: string, amountStr: string, currency: string, description?: string) {
  const systemAccountId = '11111111-1111-1111-1111-111111111111';
  const txId = uuidv4();
  const debitId = uuidv4();
  const creditId = uuidv4();

  return await withTransaction(async (conn) => {
    await repo.getAccountForUpdate(conn, sourceAccountId);
    await repo.getAccountForUpdate(conn, systemAccountId);

    const source = await repo.getAccount(conn, sourceAccountId);
    const system = await repo.getAccount(conn, systemAccountId);
    if (!source) throw new ApiError(404, 'source account not found', 'source_not_found');
    if (!system) throw new ApiError(500, 'system account missing', 'system_missing');
    if (source.currency !== currency) throw new ApiError(400, 'currency mismatch', 'currency_mismatch');
    if (source.status !== 'active') throw new ApiError(422, 'source not active', 'source_not_active');

    const balanceRaw = await repo.getBalance(conn, sourceAccountId);
    const balance = new Decimal(balanceRaw);
    const amount = new Decimal(amountStr);
    if (balance.minus(amount).isNegative()) throw new ApiError(422, 'Insufficient funds', 'insufficient_funds');

    await repo.insertTransaction(conn, {
      id: txId,
      transactionType: 'withdrawal',
      sourceAccountId,
      destinationAccountId: systemAccountId,
      amount: amountStr,
      currency,
      description,
      status: 'pending'
    });

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
      accountId: systemAccountId,
      transactionId: txId,
      entryType: 'credit',
      amount: amount.toFixed(8),
      currency,
      note: description || null
    });

    await repo.completeTransaction(conn, txId);

    return { transactionId: txId, status: 'completed', sourceAccountId, amount: amount.toFixed(8), currency };
  });
}
