import { Router } from 'express';
import {
  clearCheckin,
  createTracker,
  deleteTracker,
  endTracker,
  listTrackers,
  pauseTracker,
  resumeTracker,
  setCheckin,
  setSchedule,
  trackerDay,
  trackerProgress,
  trackerWeek,
  updateTracker,
} from '../trackers.js';

export function trackersRouter({ db, now = () => new Date() }) {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json(await listTrackers(db, req.ctx, now()));
  });

  router.post('/', async (req, res) => {
    const result = await createTracker(db, req.ctx, req.body, now());
    res.status(result.created ? 201 : 200).json(result);
  });

  // Fixed paths first, so they are never read as a tracker ID
  router.get('/day', async (req, res) => {
    res.json({ day: await trackerDay(db, req.ctx, req.query.date, now()) });
  });

  router.get('/week', async (req, res) => {
    res.json({ week: await trackerWeek(db, req.ctx, req.query.start, now()) });
  });

  router.get('/progress', async (req, res) => {
    res.json({ progress: await trackerProgress(db, req.ctx, req.query, now()) });
  });

  router.patch('/:id', async (req, res) => {
    res.json(await updateTracker(db, req.ctx, req.params.id, req.body, now()));
  });

  router.delete('/:id', async (req, res) => {
    res.json(await deleteTracker(db, req.ctx, req.params.id));
  });

  router.post('/:id/schedule', async (req, res) => {
    res.json(await setSchedule(db, req.ctx, req.params.id, req.body, now()));
  });

  router.post('/:id/pause', async (req, res) => {
    res.json(await pauseTracker(db, req.ctx, req.params.id, now()));
  });

  router.post('/:id/resume', async (req, res) => {
    res.json(await resumeTracker(db, req.ctx, req.params.id, now()));
  });

  router.post('/:id/end', async (req, res) => {
    res.json(await endTracker(db, req.ctx, req.params.id, now()));
  });

  router.post('/:id/checkins/:date', async (req, res) => {
    res.json(await setCheckin(db, req.ctx, req.params.id, req.params.date, req.body, now()));
  });

  router.delete('/:id/checkins/:date', async (req, res) => {
    res.json(await clearCheckin(db, req.ctx, req.params.id, req.params.date, now()));
  });

  return router;
}
