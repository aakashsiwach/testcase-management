const db = require('../config/db');
const { HttpError } = require('./errors');

// Admins can access every project; everyone else only projects they are a member of.
async function assertProjectAccess(user, projectId) {
  const id = Number(projectId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'A valid projectId is required');
  const { rows } = await db.query(
    `SELECT p.id, EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = $2) AS is_member
       FROM projects p WHERE p.id = $1`,
    [id, user.id]
  );
  if (!rows[0]) throw new HttpError(404, 'Project not found');
  if (user.role !== 'admin' && !rows[0].is_member) throw new HttpError(403, 'You are not a member of this project');
  return id;
}

// Loads an entity's project_id and checks access; returns the row.
async function loadWithAccess(user, sql, id, label) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Invalid ${label} id`);
  const { rows } = await db.query(sql, [n]);
  if (!rows[0]) throw new HttpError(404, `${label} not found`);
  await assertProjectAccess(user, rows[0].project_id);
  return rows[0];
}

async function isProjectMember(projectId, userId) {
  const { rows } = await db.query('SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2', [
    projectId,
    userId,
  ]);
  return rows.length > 0;
}

module.exports = { assertProjectAccess, loadWithAccess, isProjectMember };
