// src/app.ts
import express from 'express';
import bodyParser from 'body-parser';
import { router as accountRouter } from './controllers/accountControllers';
import { router as transactionRouter } from './controllers/transactionController';
import { router as depositRouter } from './controllers/depositController';

const app = express();
app.use(bodyParser.json());

app.use('/api', accountRouter);
app.use('/api', transactionRouter);
app.use('/api', depositRouter);

app.use((err:any, req:any, res:any, next:any) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

export default app;
