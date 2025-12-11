// src/controllers/depositController.ts
import express from 'express';
import { depositService, withdrawalService } from '../services/transactionServices';
import { ApiError } from '../utils/error';

export const router = express.Router();

router.post('/deposits', async (req, res) => {
  try {
    const { destinationAccountId, amount, currency, description } = req.body;
    if (!destinationAccountId || !amount || !currency) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    const result = await depositService(destinationAccountId, amount, currency, description);
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof ApiError) {
      return res.status((err as ApiError).status).json({ error: (err as ApiError).code || 'error', message: (err as ApiError).message });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/withdrawals', async (req, res) => {
  try {
    const { sourceAccountId, amount, currency, description } = req.body;
    if (!sourceAccountId || !amount || !currency) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    const result = await withdrawalService(sourceAccountId, amount, currency, description);
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof ApiError) {
      return res.status((err as ApiError).status).json({ error: (err as ApiError).code || 'error', message: (err as ApiError).message });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});
