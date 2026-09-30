import { createApp } from './app.js';
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const origin = process.env.APP_ORIGIN || `http://${host}:${port}`;
if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://')) throw Error('Production requires HTTPS APP_ORIGIN.');
const { server, db } = createApp({ dbPath: process.env.DB_PATH, origin, secure: origin.startsWith('https://') });
server.listen(port, host, () => console.log(`Focus Log: ${origin}`));
function shutdown() { server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
