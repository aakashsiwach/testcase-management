const db = require('../config/db');

/**
 * Appends an audit trail entry. Pass a transaction client as `conn` to keep it atomic
 * with the change it describes.
 */
async function logAudit({ userId, projectId = null, action, entityType, entityId = null, details = {} }, conn = db) {
  await conn.query(
    `INSERT INTO audit_logs (user_id, project_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, projectId, action, entityType, entityId, JSON.stringify(details)]
  );
}

// Returns the list of fields whose value differs between two objects.
function diff(before, after, fields) {
  const changes = {};
  for (const f of fields) {
    if (after[f] === undefined) continue;
    if (JSON.stringify(before[f]) !== JSON.stringify(after[f])) changes[f] = { from: before[f], to: after[f] };
  }
  return changes;
}

module.exports = { logAudit, diff };
