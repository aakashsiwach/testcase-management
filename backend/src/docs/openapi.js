// OpenAPI 3 specification served by Swagger UI at /api/docs.
const { PRIORITIES, TYPES, RESULTS, ROLES, SEVERITIES, DEFECT_STATUSES } = require('../validators/schemas');

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ content: { 'application/json': { schema } } });
const idParam = (name = 'id', where = 'path') => ({ name, in: where, required: true, schema: { type: 'integer' } });
const projectQuery = idParam('projectId', 'query');
const q = (name, schema, description) => ({ name, in: 'query', required: false, schema, description });
const pageParams = [q('page', { type: 'integer', default: 1 }), q('pageSize', { type: 'integer', default: 50, maximum: 100 })];

const ok = (description, schema) => ({ 200: { description, ...(schema ? json(schema) : {}) } });
const created = (schema) => ({ 201: { description: 'Created', ...json(schema || { type: 'object' }) } });
const noContent = { 204: { description: 'Deleted' } };
const std = { 400: ref400(), 401: { $ref: '#/components/responses/Unauthorized' }, 403: { $ref: '#/components/responses/Forbidden' }, 404: { description: 'Not found' }, 429: { $ref: '#/components/responses/TooManyRequests' } };
function ref400() {
  return { $ref: '#/components/responses/BadRequest' };
}

const op = (tag, summary, roles, extra = {}) => ({
  tags: [tag],
  summary,
  description: `**Roles:** ${roles}${extra.note ? `\n\n${extra.note}` : ''}`,
  parameters: extra.parameters || [],
  ...(extra.body ? { requestBody: { required: true, ...(extra.body.content ? extra.body : json(extra.body)) } } : {}),
  responses: { ...(extra.responses || ok('OK', { type: 'object' })), ...std },
});

const ALL = 'admin, test-lead, tester, read-only';
const MANAGE = 'admin, test-lead';
const EXEC = 'admin, test-lead, tester';

const paged = (item) => ({
  type: 'object',
  properties: { data: { type: 'array', items: item }, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' } },
});

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Test Case Management System API',
    version: '1.0.0',
    description:
      'REST API for managing projects, test cases, suites, runs, executions, defects and analytics.\n\n' +
      'Authenticate with `POST /api/auth/login`, then click **Authorize** and paste the token.\n\n' +
      'Demo users: `admin@demo.com / Admin@123`, `lead@demo.com / Lead@123`, `tester@demo.com / Tester@123`, `viewer@demo.com / Viewer@123`.\n\n' +
      'Rate limits: auth 5/15 min, test case CRUD 100/h, executions 200/h, analytics 50/h, other 300/15 min. ' +
      'Cached responses carry an `X-Cache: HIT|MISS` header.',
  },
  servers: [{ url: '/' }],
  security: [{ bearerAuth: [] }],
  tags: ['Auth', 'Users', 'Projects', 'Test Cases', 'Test Suites', 'Test Runs', 'Executions', 'Defects', 'Analytics', 'Metrics', 'Health'].map((name) => ({ name })),
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    responses: {
      BadRequest: { description: 'Validation failed', ...json(ref('Error')) },
      Unauthorized: { description: 'Missing or invalid token', ...json(ref('Error')) },
      Forbidden: { description: 'Role or project membership does not allow this action', ...json(ref('Error')) },
      TooManyRequests: { description: 'Rate limit exceeded', ...json(ref('Error')) },
    },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' }, details: { type: 'array', items: { type: 'object' } } } },
      User: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, email: { type: 'string' }, role: { type: 'string', enum: ROLES } } },
      AuthResponse: { type: 'object', properties: { token: { type: 'string' }, user: ref('User') } },
      Project: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          description: { type: 'string' },
          version: { type: 'string' },
          status: { type: 'string', enum: ['active', 'on-hold', 'completed', 'archived'] },
          member_count: { type: 'integer' },
        },
      },
      ProjectInput: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' }, description: { type: 'string' }, version: { type: 'string' }, status: { type: 'string', enum: ['active', 'on-hold', 'completed', 'archived'] } },
      },
      Step: { type: 'object', required: ['action'], properties: { action: { type: 'string' }, expectedResult: { type: 'string' } } },
      TestCaseInput: {
        type: 'object',
        required: ['projectId', 'title'],
        properties: {
          projectId: { type: 'integer' },
          title: { type: 'string', minLength: 3 },
          description: { type: 'string' },
          priority: { type: 'string', enum: PRIORITIES },
          type: { type: 'string', enum: TYPES },
          preconditions: { type: 'string' },
          postconditions: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          steps: { type: 'array', items: ref('Step') },
          assignedTo: { type: 'integer', nullable: true },
          suiteIds: { type: 'array', items: { type: 'integer' } },
        },
      },
      TestCase: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          title: { type: 'string' },
          priority: { type: 'string', enum: PRIORITIES },
          type: { type: 'string', enum: TYPES },
          tags: { type: 'array', items: { type: 'string' } },
          assigned_to: { type: 'integer', nullable: true },
          assignee_name: { type: 'string', nullable: true },
          last_status: { type: 'string', enum: RESULTS, nullable: true },
          last_executed_at: { type: 'string', format: 'date-time', nullable: true },
          step_count: { type: 'integer' },
          version: { type: 'integer' },
        },
      },
      Suite: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, description: { type: 'string' }, case_count: { type: 'integer' } } },
      Run: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, status: { type: 'string' }, total: { type: 'integer' }, executed: { type: 'integer' } } },
      ExecutionInput: {
        type: 'object',
        required: ['testCaseId', 'status'],
        properties: {
          testCaseId: { type: 'integer' },
          status: { type: 'string', enum: RESULTS },
          comments: { type: 'string' },
          durationSeconds: { type: 'integer' },
          runId: { type: 'integer', description: 'Record the result as part of a suite run' },
        },
      },
      Execution: { type: 'object', properties: { id: { type: 'integer' }, test_case_id: { type: 'integer' }, status: { type: 'string', enum: RESULTS }, comments: { type: 'string' }, executed_at: { type: 'string', format: 'date-time' } } },
      DefectInput: {
        type: 'object',
        required: ['projectId', 'title'],
        properties: {
          projectId: { type: 'integer' },
          testCaseId: { type: 'integer' },
          executionId: { type: 'integer', description: 'Links the defect to a failed execution (test case inferred)' },
          title: { type: 'string' },
          description: { type: 'string' },
          severity: { type: 'string', enum: SEVERITIES },
          assignedTo: { type: 'integer', nullable: true },
        },
      },
      Defect: { type: 'object', properties: { id: { type: 'integer' }, title: { type: 'string' }, severity: { type: 'string', enum: SEVERITIES }, status: { type: 'string', enum: DEFECT_STATUSES } } },
    },
  },
  paths: {
    '/api/health': { get: { tags: ['Health'], summary: 'Health check (database and Redis)', security: [], responses: { 200: { description: 'Healthy' }, 503: { description: 'Database unreachable' } } } },
    '/api/auth/register': {
      post: {
        ...op('Auth', 'Register (new users get role tester)', 'public · 5 req / 15 min', {
          body: { type: 'object', required: ['name', 'email', 'password'], properties: { name: { type: 'string' }, email: { type: 'string' }, password: { type: 'string', minLength: 8 } } },
          responses: created(ref('AuthResponse')),
        }),
        security: [],
      },
    },
    '/api/auth/login': {
      post: {
        ...op('Auth', 'Log in and receive a JWT', 'public · 5 req / 15 min per IP + email', {
          body: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', example: 'admin@demo.com' }, password: { type: 'string', example: 'Admin@123' } } },
          responses: ok('Token issued', ref('AuthResponse')),
        }),
        security: [],
      },
    },
    '/api/auth/me': { get: op('Auth', 'Current user', ALL, { responses: ok('Current user', { type: 'object', properties: { user: ref('User') } }) }) },
    '/api/users': { get: op('Users', 'List users', 'admin', { parameters: [q('q', { type: 'string' }), ...pageParams], responses: ok('Users', paged(ref('User'))) }) },
    '/api/users/{id}': {
      patch: op('Users', 'Change role or activate / deactivate', 'admin', {
        parameters: [idParam()],
        body: { type: 'object', properties: { role: { type: 'string', enum: ROLES }, isActive: { type: 'boolean' } } },
      }),
    },
    '/api/projects': {
      get: op('Projects', 'Projects visible to the user (cached 1 h)', ALL, { responses: ok('Projects', { type: 'object', properties: { data: { type: 'array', items: ref('Project') } } }) }),
      post: op('Projects', 'Create a project (creator becomes a member)', MANAGE, { body: ref('ProjectInput'), responses: created(ref('Project')) }),
    },
    '/api/projects/{id}': {
      get: op('Projects', 'Project metadata (cached 1 h)', `${ALL} (members only; admin all)`, { parameters: [idParam()], responses: ok('Project', ref('Project')) }),
      put: op('Projects', 'Update a project', MANAGE, { parameters: [idParam()], body: ref('ProjectInput') }),
      delete: op('Projects', 'Delete a project', 'admin', { parameters: [idParam()], responses: noContent }),
    },
    '/api/projects/{id}/members': {
      get: op('Projects', 'List members', ALL, { parameters: [idParam()] }),
      post: op('Projects', 'Add a member', MANAGE, { parameters: [idParam()], body: { type: 'object', required: ['userId'], properties: { userId: { type: 'integer' } } }, responses: created() }),
    },
    '/api/projects/{id}/members/{userId}': { delete: op('Projects', 'Remove a member (their assignments are cleared)', MANAGE, { parameters: [idParam(), idParam('userId')], responses: noContent }) },
    '/api/projects/{id}/candidates': { get: op('Projects', 'Active users who are not members yet', MANAGE, { parameters: [idParam()] }) },
    '/api/projects/{id}/audit': {
      get: op('Projects', 'Project audit trail', ALL, {
        parameters: [idParam(), q('entityType', { type: 'string', enum: ['project', 'test_case', 'test_suite', 'test_execution', 'test_run', 'defect'] }), ...pageParams],
      }),
    },
    '/api/testcases': {
      get: op('Test Cases', 'Search / filter / sort with server-side pagination', `${ALL} · 100 req/h`, {
        parameters: [
          projectQuery,
          q('q', { type: 'string' }, 'Full-text search on title/description, or an id'),
          q('priority', { type: 'string' }, `Comma-separated: ${PRIORITIES.join(',')}`),
          q('type', { type: 'string' }, `Comma-separated: ${TYPES.join(',')}`),
          q('tags', { type: 'string' }, 'Comma-separated tags (matches any)'),
          q('suiteId', { type: 'integer' }),
          q('assignedTo', { type: 'string' }, '`me`, `unassigned` or a user id'),
          q('lastResult', { type: 'string' }, 'Comma-separated: Pass,Fail,Blocked,Skipped,Pending'),
          q('sort', { type: 'string', enum: ['id', 'title', 'priority', 'type', 'updated_at', 'created_at', 'last_executed_at', 'last_status'] }),
          q('order', { type: 'string', enum: ['asc', 'desc'] }),
          ...pageParams,
        ],
        responses: ok('Page of test cases', paged(ref('TestCase'))),
      }),
      post: op('Test Cases', 'Create a test case with steps', `${MANAGE} · 100 req/h`, { body: ref('TestCaseInput'), responses: created(ref('TestCase')) }),
    },
    '/api/testcases/tags': { get: op('Test Cases', 'Distinct tags in a project', ALL, { parameters: [projectQuery] }) },
    '/api/testcases/export': { get: op('Test Cases', 'Export a project\'s test cases as CSV', ALL, { parameters: [projectQuery], responses: { 200: { description: 'CSV file', content: { 'text/csv': {} } } } }) },
    '/api/testcases/import': {
      post: op('Test Cases', 'Import test cases from CSV text', MANAGE, {
        note: 'Columns: title (required), description, priority, type, preconditions, postconditions, tags (`;` separated), steps (one per line, `action -> expected`). All-or-nothing.',
        body: { type: 'object', required: ['projectId', 'csv'], properties: { projectId: { type: 'integer' }, csv: { type: 'string' } } },
        responses: created(),
      }),
    },
    '/api/testcases/bulk': {
      post: op('Test Cases', 'Bulk delete / update priority / add to suite / assign', MANAGE, {
        body: {
          type: 'object',
          required: ['action', 'projectId', 'ids'],
          properties: {
            action: { type: 'string', enum: ['delete', 'update-priority', 'add-to-suite', 'assign'] },
            projectId: { type: 'integer' },
            ids: { type: 'array', items: { type: 'integer' } },
            priority: { type: 'string', enum: PRIORITIES },
            suiteId: { type: 'integer' },
            assigneeId: { type: 'integer', nullable: true },
          },
        },
      }),
    },
    '/api/testcases/{id}': {
      get: op('Test Cases', 'Test case with steps, suites and latest result', ALL, { parameters: [idParam()] }),
      put: op('Test Cases', 'Update (creates a new version; steps replaced when given)', MANAGE, { parameters: [idParam()], body: ref('TestCaseInput') }),
      delete: op('Test Cases', 'Delete a test case', MANAGE, { parameters: [idParam()], responses: noContent }),
    },
    '/api/testcases/{id}/assign': {
      patch: op('Test Cases', 'Assign to a tester (notifies by email if SMTP is configured)', MANAGE, {
        parameters: [idParam()],
        body: { type: 'object', required: ['assigneeId'], properties: { assigneeId: { type: 'integer', nullable: true } } },
      }),
    },
    '/api/testcases/{id}/executions': { get: op('Test Cases', 'Execution history (paginated)', ALL, { parameters: [idParam(), ...pageParams] }) },
    '/api/testcases/{id}/versions': { get: op('Test Cases', 'Version history (snapshots)', ALL, { parameters: [idParam()] }) },
    '/api/testcases/{id}/audit': { get: op('Test Cases', 'Audit trail of the test case and its executions', ALL, { parameters: [idParam()] }) },
    '/api/testcases/{id}/comments': {
      get: op('Test Cases', 'Comments', ALL, { parameters: [idParam()] }),
      post: op('Test Cases', 'Add a comment', EXEC, { parameters: [idParam()], body: { type: 'object', required: ['body'], properties: { body: { type: 'string' } } }, responses: created() }),
    },
    '/api/testsuites': {
      get: op('Test Suites', 'Suites in a project (cached 30 min)', ALL, { parameters: [projectQuery], responses: ok('Suites', { type: 'object', properties: { data: { type: 'array', items: ref('Suite') } } }) }),
      post: op('Test Suites', 'Create a suite', MANAGE, { body: { type: 'object', required: ['projectId', 'name'], properties: { projectId: { type: 'integer' }, name: { type: 'string' }, description: { type: 'string' } } }, responses: created(ref('Suite')) }),
    },
    '/api/testsuites/{id}': {
      get: op('Test Suites', 'Suite with its ordered test cases', ALL, { parameters: [idParam()] }),
      put: op('Test Suites', 'Update a suite', MANAGE, { parameters: [idParam()], body: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } } }),
      delete: op('Test Suites', 'Delete a suite', MANAGE, { parameters: [idParam()], responses: noContent }),
    },
    '/api/testsuites/{id}/cases': {
      post: op('Test Suites', 'Add test cases to a suite', MANAGE, { parameters: [idParam()], body: { type: 'object', required: ['testCaseIds'], properties: { testCaseIds: { type: 'array', items: { type: 'integer' } } } }, responses: created() }),
    },
    '/api/testsuites/{id}/cases/{caseId}': { delete: op('Test Suites', 'Remove a test case from a suite', MANAGE, { parameters: [idParam(), idParam('caseId')], responses: noContent }) },
    '/api/testsuites/{id}/runs': { post: op('Test Suites', 'Execute the entire suite as a test run', `${EXEC} · 200 req/h`, { parameters: [idParam()], body: { type: 'object', properties: { name: { type: 'string' } } }, responses: created(ref('Run')) }) },
    '/api/testsuites/{id}/report': { get: op('Test Suites', 'Suite report: result breakdown, pass rate, run history', ALL, { parameters: [idParam()] }) },
    '/api/testruns': { get: op('Test Runs', 'Runs with progress (executed / total)', ALL, { parameters: [projectQuery, q('suiteId', { type: 'integer' }), ...pageParams], responses: ok('Runs', paged(ref('Run'))) }) },
    '/api/testruns/{id}': {
      get: op('Test Runs', 'Run detail: cases with steps and results, progress per tester', ALL, { parameters: [idParam()] }),
      patch: op('Test Runs', 'Complete or abort a run', EXEC, { parameters: [idParam()], body: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['completed', 'aborted'] } } } }),
    },
    '/api/testexecutions': { post: op('Executions', 'Record a test result', `${EXEC} · 200 req/h`, { body: ref('ExecutionInput'), responses: created(ref('Execution')) }) },
    '/api/testexecutions/{id}': {
      get: op('Executions', 'Execution with attachment metadata', ALL, { parameters: [idParam()] }),
      put: op('Executions', 'Update a result (testers: own results only)', EXEC, { parameters: [idParam()], body: { type: 'object', properties: { status: { type: 'string', enum: RESULTS }, comments: { type: 'string' } } } }),
    },
    '/api/testexecutions/{id}/attachments': {
      post: op('Executions', 'Upload attachments (max 5 files, 5 MB each; png, jpg, gif, pdf, txt, log, csv)', EXEC, {
        parameters: [idParam()],
        body: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } } } } } },
        responses: created(),
      }),
    },
    '/api/testexecutions/attachments/{attachmentId}': { get: op('Executions', 'Download an attachment', ALL, { parameters: [idParam('attachmentId')], responses: { 200: { description: 'File (Content-Disposition: attachment)' } } }) },
    '/api/defects': {
      get: op('Defects', 'List defects', ALL, {
        parameters: [projectQuery, q('status', { type: 'string' }, DEFECT_STATUSES.join(',')), q('severity', { type: 'string' }, SEVERITIES.join(',')), q('testCaseId', { type: 'integer' }), q('q', { type: 'string' }), ...pageParams],
        responses: ok('Defects', paged(ref('Defect'))),
      }),
      post: op('Defects', 'Create a defect (optionally from a failed execution)', `${EXEC} · 200 req/h`, { body: ref('DefectInput'), responses: created(ref('Defect')) }),
    },
    '/api/defects/{id}': {
      get: op('Defects', 'Get a defect', ALL, { parameters: [idParam()] }),
      put: op('Defects', 'Update a defect (status, severity, assignee...)', EXEC, {
        parameters: [idParam()],
        body: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, severity: { type: 'string', enum: SEVERITIES }, status: { type: 'string', enum: DEFECT_STATUSES }, assignedTo: { type: 'integer', nullable: true } } },
      }),
    },
    '/api/analytics': {
      get: op('Analytics', 'Dashboard analytics in one payload (cached 15 min)', `${ALL} · 50 req/h`, {
        parameters: [projectQuery, q('days', { type: 'integer', default: 30, minimum: 7, maximum: 90 })],
        note: 'Summary, coverage, daily trend, distribution by priority and type, progress by tester, defect density and recent run progress.',
      }),
    },
    '/api/analytics/dashboard': { get: op('Analytics', 'Alias of GET /api/analytics', `${ALL} · 50 req/h`, { parameters: [projectQuery, q('days', { type: 'integer', default: 30 })] }) },
    '/api/metrics/cache': { get: op('Metrics', 'Cache hit/miss ratio and latency per key prefix', ALL) },
    '/api/metrics/cache/reset': { post: op('Metrics', 'Reset cache metrics', 'admin', { responses: noContent }) },
    '/api/metrics/cache/benchmark': { post: op('Metrics', 'Measure uncached vs cached latency', MANAGE, { parameters: [projectQuery] }) },
  },
};
