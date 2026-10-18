import { Router } from 'express';
import { listReports, getSchedule, runReport } from '../controllers/reportController';

// Mounted at /reports by the app.
export const reportRoutes = Router();

reportRoutes.get('/', listReports);
reportRoutes.get('/schedule', getSchedule);
reportRoutes.post('/run', runReport);
