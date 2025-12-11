// src/types/models.ts
export type Account = {
  id: string;
  userId: string;
  accountType: string;
  currency: string;
  status: string;
  metadata?: any;
  createdAt: string;
};

export type MoneyTransaction = {
  id: string;
  transactionType: string;
  sourceAccountId?: string | null;
  destinationAccountId?: string | null;
  amount: string; // decimal as string
  currency: string;
  status: string;
  reference?: string | null;
  description?: string | null;
  createdAt: string;
  completedAt?: string | null;
};

export type LedgerEntry = {
  id: string;
  accountId: string;
  transactionId: string;
  entryType: 'debit' | 'credit';
  amount: string;
  currency: string;
  note?: string | null;
  createdAt: string;
};
