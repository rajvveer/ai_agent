import { Router } from 'express';
import {
  createLinkToken,
  exchangePublicToken,
  getInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getCashFlow,
  generateForecast,
  getLatestForecast,
} from './controller.js';

export const financeRouter = Router();

// Plaid routes
financeRouter.post('/plaid/create-link-token', createLinkToken);
financeRouter.post('/plaid/exchange-public-token', exchangePublicToken);

// Invoice CRUD
financeRouter.get('/invoices', getInvoices);
financeRouter.post('/invoices', createInvoice);
financeRouter.put('/invoices/:id', updateInvoice);
financeRouter.delete('/invoices/:id', deleteInvoice);

// Cash flow
financeRouter.get('/cash-flow', getCashFlow);
financeRouter.post('/forecast', generateForecast);
financeRouter.get('/forecast', getLatestForecast);
