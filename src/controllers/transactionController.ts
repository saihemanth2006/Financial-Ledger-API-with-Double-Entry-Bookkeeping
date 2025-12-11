// src/controllers/transactionController.ts
import express from 'express';
import { transferService } from '../services/transactionServices';
import { ApiError } from '../utils/error';

export const router = express.Router();

router.post('/transfers', async (req, res) => {
  try {
    const { sourceAccountId, destinationAccountId, amount, currency, reference, description } = req.body;
    if (!sourceAccountId || !destinationAccountId || !amount || !currency) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    const result = await transferService(sourceAccountId, destinationAccountId, amount, currency, reference, description);
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof ApiError) {
      return res.status((err as ApiError).status).json({ error: (err as ApiError).code || 'error', message: (err as ApiError).message });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});
