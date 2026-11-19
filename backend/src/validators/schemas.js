const { z } = require('zod');

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const TYPES = ['Functional', 'Integration', 'Regression', 'Smoke', 'UI', 'API'];
const RESULTS = ['Pass', 'Fail', 'Blocked', 'Skipped'];
const ROLES = ['admin', 'test-lead', 'tester', 'read-only'];
const PROJECT_STATUSES = ['active', 'on-hold', 'completed', 'archived'];
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
const DEFECT_STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];

const id = z.coerce.number().int().positive();
const text = (max) => z.string().trim().max(max);
const optionalId = z.union([id, z.null()]).optional();

// "a,b,c" or ["a","b"] -> validated array
const csvList = (item) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v),
    z.array(item).max(50)
  );

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

const auth = {
  register: z.object({
    name: text(100).min(2),
    email: z.email().max(255).transform((e) => e.toLowerCase()),
    password,
  }),
  login: z.object({
    email: z.email().transform((e) => e.toLowerCase()),
    password: z.string().min(1).max(72),
  }),
};

const users = {
  list: z.object({
    q: text(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  }),
  update: z
    .object({ role: z.enum(ROLES).optional(), isActive: z.boolean().optional() })
    .refine((o) => o.role !== undefined || o.isActive !== undefined, 'Nothing to update'),
};

const projects = {
  create: z.object({
    name: text(150).min(2),
    description: text(5000).default(''),
    version: text(50).min(1).default('1.0'),
    status: z.enum(PROJECT_STATUSES).default('active'),
  }),
  update: z.object({
    name: text(150).min(2).optional(),
    description: text(5000).optional(),
    version: text(50).min(1).optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
  }),
  addMember: z.object({ userId: id }),
  audit: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    entityType: z.enum(['project', 'test_case', 'test_suite', 'test_execution', 'test_run', 'defect']).optional(),
  }),
};

const step = z.object({
  action: text(2000).min(1, 'Step action is required'),
  expectedResult: text(2000).default(''),
});

const tag = text(40).min(1).regex(/^[\w\- .]+$/, 'Tags may contain letters, numbers, spaces, - _ .');

const testCaseBody = {
  title: text(255).min(3, 'Title must be at least 3 characters'),
  description: text(10000).default(''),
  priority: z.enum(PRIORITIES).default('Medium'),
  type: z.enum(TYPES).default('Functional'),
  preconditions: text(5000).default(''),
  postconditions: text(5000).default(''),
  tags: z.array(tag).max(20).default([]),
  steps: z.array(step).max(100).default([]),
  assignedTo: optionalId,
  suiteIds: z.array(id).max(50).optional(),
};

const SORTABLE = ['id', 'title', 'priority', 'type', 'updated_at', 'created_at', 'last_executed_at', 'last_status'];

const testCases = {
  create: z.object({ projectId: id, ...testCaseBody }),
  update: z.object({
    title: testCaseBody.title.optional(),
    description: text(10000).optional(),
    priority: z.enum(PRIORITIES).optional(),
    type: z.enum(TYPES).optional(),
    preconditions: text(5000).optional(),
    postconditions: text(5000).optional(),
    tags: z.array(tag).max(20).optional(),
    steps: z.array(step).max(100).optional(),
    assignedTo: optionalId,
  }),
  list: z.object({
    projectId: id,
    q: text(200).optional(),
    priority: csvList(z.enum(PRIORITIES)).optional(),
    type: csvList(z.enum(TYPES)).optional(),
    tags: csvList(tag).optional(),
    suiteId: id.optional(),
    assignedTo: z.union([z.literal('me'), z.literal('unassigned'), id]).optional(),
    lastResult: csvList(z.enum([...RESULTS, 'Pending'])).optional(),
    sort: z.enum(SORTABLE).default('id'),
    order: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  }),
  bulk: z.discriminatedUnion('action', [
    z.object({ action: z.literal('delete'), projectId: id, ids: z.array(id).min(1).max(500) }),
    z.object({
      action: z.literal('update-priority'),
      projectId: id,
      ids: z.array(id).min(1).max(500),
      priority: z.enum(PRIORITIES),
    }),
    z.object({ action: z.literal('add-to-suite'), projectId: id, ids: z.array(id).min(1).max(500), suiteId: id }),
    z.object({
      action: z.literal('assign'),
      projectId: id,
      ids: z.array(id).min(1).max(500),
      assigneeId: z.union([id, z.null()]),
    }),
  ]),
  assign: z.object({ assigneeId: z.union([id, z.null()]) }),
  import: z.object({ projectId: id, csv: z.string().min(1).max(900000) }),
  exportQuery: z.object({ projectId: id }),
  comment: z.object({ body: text(5000).min(1) }),
  page: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
};

const suites = {
  list: z.object({ projectId: id }),
  create: z.object({ projectId: id, name: text(150).min(2), description: text(5000).default('') }),
  update: z.object({ name: text(150).min(2).optional(), description: text(5000).optional() }),
  addCases: z.object({ testCaseIds: z.array(id).min(1).max(500) }),
  run: z.object({ name: text(200).min(1).optional() }),
};

const executions = {
  create: z.object({
    testCaseId: id,
    status: z.enum(RESULTS),
    comments: text(5000).default(''),
    durationSeconds: z.coerce.number().int().min(0).max(86400).optional(),
    runId: id.optional(),
  }),
  update: z
    .object({ status: z.enum(RESULTS).optional(), comments: text(5000).optional() })
    .refine((o) => o.status !== undefined || o.comments !== undefined, 'Nothing to update'),
};

const runs = {
  list: z.object({
    projectId: id,
    suiteId: id.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
  update: z.object({ status: z.enum(['completed', 'aborted']) }),
};

const defects = {
  list: z.object({
    projectId: id,
    status: csvList(z.enum(DEFECT_STATUSES)).optional(),
    severity: csvList(z.enum(SEVERITIES)).optional(),
    testCaseId: id.optional(),
    q: text(200).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  }),
  create: z.object({
    projectId: id,
    testCaseId: id.optional(),
    executionId: id.optional(),
    title: text(255).min(3),
    description: text(10000).default(''),
    severity: z.enum(SEVERITIES).default('Medium'),
    assignedTo: optionalId,
  }),
  update: z.object({
    title: text(255).min(3).optional(),
    description: text(10000).optional(),
    severity: z.enum(SEVERITIES).optional(),
    status: z.enum(DEFECT_STATUSES).optional(),
    assignedTo: optionalId,
  }),
};

const analytics = {
  query: z.object({ projectId: id, days: z.coerce.number().int().min(7).max(90).default(30) }),
};

module.exports = {
  PRIORITIES,
  TYPES,
  RESULTS,
  ROLES,
  SEVERITIES,
  DEFECT_STATUSES,
  auth,
  users,
  projects,
  testCases,
  suites,
  executions,
  runs,
  defects,
  analytics,
};
