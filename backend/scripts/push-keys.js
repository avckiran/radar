// Makes the identification keys the server needs for web push notifications. Run once:
//   npm run push:keys -w backend
// Copy the two lines it prints into the server's .env (type them by hand there; never paste them into chat).
import { generateVapidKeys } from '../src/push.js';

const { publicKey, privateKey } = generateVapidKeys();
console.log('Add these two lines to backend/.env on the server:\n');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('\nKeep the private key secret and do not change the pair later, or every phone must turn notifications on again.');
