import { Router } from 'express';
import { loadSettings, updateSettings } from '../settings.js';
import { buildExport } from '../exporter.js';

export function settingsRouter({ db, now = () => new Date() }) {
  const router = Router();

  router.get('/settings', async (req, res) => {
    res.json(await loadSettings(db, req.ctx));
  });

  router.patch('/settings', async (req, res) => {
    res.json(await updateSettings(db, req.ctx, req.body));
  });

  router.get('/export', async (req, res) => {
    const format = req.query.format === 'csv' ? 'csv' : req.query.format === 'json' ? 'json' : null;
    if (!format) return res.status(400).json({ error: 'Choose json or csv.' });
    const file = await buildExport(db, req.ctx, format, now());
    res.set({
      'Content-Type': file.type,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'no-store',
    });
    res.send(file.body);
  });

  return router;
}
