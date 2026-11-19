// Same permission matrix the backend enforces; used to hide / disable UI actions.
const MANAGE = ['admin', 'test-lead'];
const EXECUTE = ['admin', 'test-lead', 'tester'];

export const PERMISSIONS = {
  'project:create': MANAGE,
  'project:edit': MANAGE,
  'project:delete': ['admin'],
  'project:members': MANAGE,
  'testcase:create': MANAGE,
  'testcase:edit': MANAGE,
  'testcase:delete': MANAGE,
  'testcase:assign': MANAGE,
  'testcase:bulk': MANAGE,
  'testcase:import': MANAGE,
  'testcase:comment': EXECUTE,
  'suite:manage': MANAGE,
  'suite:run': EXECUTE,
  'execution:create': EXECUTE,
  'execution:update': EXECUTE,
  'defect:create': EXECUTE,
  'defect:update': EXECUTE,
  'users:manage': ['admin'],
  'metrics:benchmark': MANAGE,
  'metrics:reset': ['admin'],
};

export const can = (role, action) => Boolean(role && PERMISSIONS[action]?.includes(role));

export const ROLE_LABELS = { admin: 'Admin', 'test-lead': 'Test Lead', tester: 'Tester', 'read-only': 'Read Only' };
