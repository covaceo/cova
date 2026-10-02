// TEST packaging only: keep each existing handler's authentication and method checks.
import status from '../api/connectors/status.js';
import disconnect from '../api/connectors/disconnect.js';

export default function handler(req, res) {
  const path = new URL(req.url || '/', 'https://local.invalid').pathname;
  if (path === '/api/connectors/status' || path === '/api/tradovate/status') return status(req, res);
  if (path === '/api/connectors/disconnect') return disconnect(req, res);
  return res.status(404).json({ error: 'Not found' });
}
