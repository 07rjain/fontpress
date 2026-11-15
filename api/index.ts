import { getRequestListener } from '@hono/node-server';
import { app } from '../server/app.js';

// The Node adapter streams responses and preserves the original /api/* URL.
export default getRequestListener(app.fetch);
