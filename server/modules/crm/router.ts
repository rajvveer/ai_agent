import { Router } from 'express';
import {
  listContacts,
  createContact,
  getContact,
  updateContact,
  deleteContact,
  listDeals,
  createDeal,
  getDeal,
  updateDeal,
  deleteDeal,
  getPipeline,
  listActivities,
  createActivity,
} from './controller.js';

export const crmRouter = Router();

// Contacts
crmRouter.get('/contacts', listContacts);
crmRouter.post('/contacts', createContact);
crmRouter.get('/contacts/:id', getContact);
crmRouter.put('/contacts/:id', updateContact);
crmRouter.delete('/contacts/:id', deleteContact);

// Dashboard/Pipeline
crmRouter.get('/deals/pipeline', getPipeline);

// Deals
crmRouter.get('/deals', listDeals);
crmRouter.post('/deals', createDeal);
crmRouter.get('/deals/:id', getDeal);
crmRouter.put('/deals/:id', updateDeal);
crmRouter.delete('/deals/:id', deleteDeal);

// Activities
crmRouter.get('/activities', listActivities);
crmRouter.post('/activities', createActivity);
