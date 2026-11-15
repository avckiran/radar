import { Router } from 'express';
import { HttpError } from '../errors.js';
import { createTestSender, removeDevice, removeSubscription, saveSubscription } from '../push.js';

export function pushRouter({ db, pusher, now = () => new Date() }) {
  const router = Router();
  const sendTest = createTestSender({ db, pusher, now });

  // The browser needs the server's public key to subscribe; enabled is false until the keys are set on the server
  router.get('/config', (req, res) => {
    res.json({ enabled: Boolean(pusher), publicKey: pusher?.publicKey ?? null });
  });

  router.post('/subscribe', async (req, res) => {
    if (!pusher) throw new HttpError(503, 'Notifications are not set up on the server yet.');
    res.json(await saveSubscription(db, req.ctx, req.body));
  });

  router.post('/unsubscribe', async (req, res) => {
    res.json(await removeSubscription(db, req.ctx, req.body?.endpoint));
  });

  router.delete('/devices/:id', async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new HttpError(400, 'Which device?');
    res.json(await removeDevice(db, req.ctx, req.params.id));
  });

  router.post('/test', async (req, res) => {
    res.json(await sendTest(req.ctx));
  });

  return router;
}
