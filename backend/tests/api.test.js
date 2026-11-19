const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, login, request } = require('./helpers');

const ECOMMERCE = 1;
const BANKING = 2;
const HR = 3;

let app;
const tokens = {};
const as = (who) => {
  const auth = (r) => r.set('Authorization', `Bearer ${tokens[who]}`);
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
    put: (url, body) => auth(request(app).put(url)).send(body),
    patch: (url, body) => auth(request(app).patch(url)).send(body),
    del: (url) => auth(request(app).delete(url)),
    upload: (url) => auth(request(app).post(url)),
  };
};

before(async () => {
  app = await setup();
  for (const who of ['admin', 'lead', 'tester', 'viewer']) tokens[who] = await login(app, who);
});
after(teardown);

describe('health & docs', () => {
  it('reports database and redis status', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.database, 'ok');
  });
  it('serves the OpenAPI spec', async () => {
    const res = await request(app).get('/api/openapi.json');
    assert.equal(res.status, 200);
    assert.ok(res.body.paths['/api/testcases']);
  });
});

describe('authentication', () => {
  it('registers new users with the tester role by default', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'New Person', email: 'new@demo.com', password: 'Secret123', role: 'admin' });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'tester');
    assert.ok(res.body.token);
  });
  it('rejects duplicate email and weak passwords', async () => {
    assert.equal((await request(app).post('/api/auth/register').send({ name: 'Dup', email: 'NEW@demo.com', password: 'Secret123' })).status, 409);
    assert.equal((await request(app).post('/api/auth/register').send({ name: 'Weak', email: 'weak@demo.com', password: 'short' })).status, 400);
  });
  it('rejects bad credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@demo.com', password: 'wrong' });
    assert.equal(res.status, 401);
  });
  it('requires a bearer token on protected routes', async () => {
    assert.equal((await request(app).get(`/api/testcases?projectId=${ECOMMERCE}`)).status, 401);
    assert.equal((await request(app).get('/api/projects').set('Authorization', 'Bearer not-a-jwt')).status, 401);
  });
  it('returns the current user with role', async () => {
    const res = await as('lead').get('/api/auth/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.user.role, 'test-lead');
  });
  it('rate-limits auth to 5 requests per 15 minutes per IP + email', async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await request(app).post('/api/auth/login').send({ email: 'limit@demo.com', password: 'x' })).status);
    }
    assert.deepEqual(statuses.slice(0, 5), [401, 401, 401, 401, 401]);
    assert.equal(statuses[5], 429);
  });
});

describe('role-based access control (route matrix from the brief)', () => {
  const newCase = (title) => ({ projectId: ECOMMERCE, title, priority: 'High', type: 'API', steps: [{ action: 'Call endpoint', expectedResult: '200 OK' }] });

  it('GET /api/testcases is allowed for all roles', async () => {
    for (const who of ['admin', 'lead', 'tester', 'viewer']) {
      assert.equal((await as(who).get(`/api/testcases?projectId=${ECOMMERCE}`)).status, 200, who);
    }
  });
  it('POST/PUT/DELETE /api/testcases only for admin and test-lead', async () => {
    assert.equal((await as('tester').post('/api/testcases', newCase('Tester cannot create'))).status, 403);
    assert.equal((await as('viewer').post('/api/testcases', newCase('Viewer cannot create'))).status, 403);
    const created = await as('lead').post('/api/testcases', newCase('Lead can create'));
    assert.equal(created.status, 201);
    const id = created.body.id;
    assert.equal((await as('tester').put(`/api/testcases/${id}`, { title: 'Nope' })).status, 403);
    assert.equal((await as('viewer').del(`/api/testcases/${id}`)).status, 403);
    assert.equal((await as('admin').put(`/api/testcases/${id}`, { title: 'Admin can edit' })).status, 200);
    assert.equal((await as('lead').del(`/api/testcases/${id}`)).status, 204);
  });
  it('POST /api/testexecutions for admin, test-lead and tester only', async () => {
    for (const who of ['admin', 'lead', 'tester']) {
      assert.equal((await as(who).post('/api/testexecutions', { testCaseId: 1, status: 'Pass' })).status, 201, who);
    }
    assert.equal((await as('viewer').post('/api/testexecutions', { testCaseId: 1, status: 'Pass' })).status, 403);
  });
  it('GET /api/analytics for all roles', async () => {
    for (const who of ['admin', 'lead', 'tester', 'viewer']) {
      assert.equal((await as(who).get(`/api/analytics?projectId=${ECOMMERCE}`)).status, 200, who);
    }
  });
  it('GET /api/users is admin only', async () => {
    assert.equal((await as('admin').get('/api/users')).status, 200);
    for (const who of ['lead', 'tester', 'viewer']) assert.equal((await as(who).get('/api/users')).status, 403, who);
  });
  it('POST /api/projects for admin and test-lead', async () => {
    assert.equal((await as('lead').post('/api/projects', { name: 'Lead project' })).status, 201);
    assert.equal((await as('admin').post('/api/projects', { name: 'Admin project' })).status, 201);
    assert.equal((await as('tester').post('/api/projects', { name: 'Tester project' })).status, 403);
    assert.equal((await as('viewer').post('/api/projects', { name: 'Viewer project' })).status, 403);
  });
  it('scopes non-admin users to projects they belong to', async () => {
    assert.equal((await as('tester').get(`/api/testcases?projectId=${HR}`)).status, 403);
    assert.equal((await as('viewer').get(`/api/projects/${BANKING}`)).status, 403);
    assert.equal((await as('admin').get(`/api/projects/${HR}`)).status, 200);
    const list = await as('viewer').get('/api/projects');
    assert.deepEqual(list.body.data.map((p) => p.id), [ECOMMERCE]);
  });
  it('lets only admins change roles', async () => {
    const users = (await as('admin').get('/api/users?q=new@demo.com')).body.data;
    const res = await as('admin').patch(`/api/users/${users[0].id}`, { role: 'read-only' });
    assert.equal(res.status, 200);
    assert.equal(res.body.role, 'read-only');
    assert.equal((await as('lead').patch(`/api/users/${users[0].id}`, { role: 'admin' })).status, 403);
  });
});

describe('test cases', () => {
  let caseId;
  it('creates a test case with ordered steps, tags and a first version; strips HTML', async () => {
    const res = await as('lead').post('/api/testcases', {
      projectId: ECOMMERCE,
      title: 'Coupon <script>alert(1)</script>applies discount',
      description: 'Total must be > 0 after <b onclick="x()">discount</b>',
      priority: 'Critical',
      type: 'Functional',
      tags: ['coupons', 'checkout'],
      steps: [
        { action: 'Add item to cart', expectedResult: 'Cart has 1 item' },
        { action: 'Apply coupon SAVE10', expectedResult: 'Total reduced by 10%' },
      ],
      suiteIds: [2],
    });
    assert.equal(res.status, 201);
    caseId = res.body.id;
    assert.equal(res.body.title, 'Coupon applies discount');
    assert.equal(res.body.description, 'Total must be > 0 after discount');
    const detail = await as('viewer').get(`/api/testcases/${caseId}`);
    assert.deepEqual(detail.body.steps.map((s) => s.step_number), [1, 2]);
    assert.deepEqual(detail.body.suites.map((s) => s.id), [2]);
    assert.equal(detail.body.last_status, null);
  });
  it('validates enums and required fields', async () => {
    const res = await as('lead').post('/api/testcases', { projectId: ECOMMERCE, title: 'x', priority: 'Urgent' });
    assert.equal(res.status, 400);
    assert.ok(res.body.details.some((d) => d.path === 'priority'));
  });
  it('rejects unknown sort columns (whitelist)', async () => {
    const res = await as('viewer').get(`/api/testcases?projectId=${ECOMMERCE}&sort=title;DROP TABLE users`);
    assert.equal(res.status, 400);
  });
  it('filters by several criteria at once and paginates', async () => {
    const res = await as('viewer').get(`/api/testcases?projectId=${ECOMMERCE}&q=coupon&priority=Critical,High&tags=coupons&suiteId=2&lastResult=Pending`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map((r) => r.id), [caseId]);
    const page = await as('viewer').get(`/api/testcases?projectId=${ECOMMERCE}&page=2&pageSize=10&sort=priority&order=desc`);
    assert.equal(page.body.data.length, 10);
    assert.ok(page.body.total > 120);
  });
  it('versions every edit and records the audit trail', async () => {
    await as('lead').put(`/api/testcases/${caseId}`, { priority: 'Low', steps: [{ action: 'Only step', expectedResult: 'Done' }] });
    const versions = await as('viewer').get(`/api/testcases/${caseId}/versions`);
    assert.deepEqual(versions.body.data.map((v) => v.version), [2, 1]);
    assert.equal(versions.body.data[0].snapshot.priority, 'Low');
    const audit = await as('viewer').get(`/api/testcases/${caseId}/audit`);
    assert.ok(audit.body.data.some((a) => a.action === 'update' && a.details.priority));
  });
  it('assigns only to project members who can execute', async () => {
    assert.equal((await as('lead').patch(`/api/testcases/${caseId}/assign`, { assigneeId: 3 })).status, 200);
    assert.equal((await as('lead').patch(`/api/testcases/${caseId}/assign`, { assigneeId: 4 })).status, 400); // read-only
    assert.equal((await as('lead').patch(`/api/testcases/${caseId}/assign`, { assigneeId: 7 })).status, 400); // not a member
    const mine = await as('tester').get(`/api/testcases?projectId=${ECOMMERCE}&assignedTo=me&q=coupon`);
    assert.deepEqual(mine.body.data.map((r) => r.id), [caseId]);
  });
  it('supports bulk priority update, add to suite and delete', async () => {
    const ids = [];
    for (const t of ['Bulk one', 'Bulk two']) ids.push((await as('lead').post('/api/testcases', { projectId: ECOMMERCE, title: t })).body.id);
    let res = await as('lead').post('/api/testcases/bulk', { action: 'update-priority', projectId: ECOMMERCE, ids, priority: 'Critical' });
    assert.equal(res.body.affected, 2);
    res = await as('lead').post('/api/testcases/bulk', { action: 'add-to-suite', projectId: ECOMMERCE, ids, suiteId: 1 });
    assert.equal(res.body.affected, 2);
    assert.equal((await as('tester').post('/api/testcases/bulk', { action: 'delete', projectId: ECOMMERCE, ids })).status, 403);
    assert.equal((await as('lead').post('/api/testcases/bulk', { action: 'delete', projectId: BANKING, ids })).status, 400);
    res = await as('lead').post('/api/testcases/bulk', { action: 'delete', projectId: ECOMMERCE, ids });
    assert.equal(res.body.affected, 2);
  });
  it('exports and imports CSV', async () => {
    const exp = await as('viewer').get(`/api/testcases/export?projectId=${BANKING}`).catch(() => null);
    assert.equal(exp.status, 403); // viewer is not a member of banking
    const csv = await as('tester').get(`/api/testcases/export?projectId=${BANKING}`);
    assert.equal(csv.status, 200);
    assert.match(csv.headers['content-type'], /text\/csv/);
    assert.match(csv.text, /^id,title,description/);
    const imported = await as('lead').post('/api/testcases/import', {
      projectId: BANKING,
      csv: 'title,priority,type,tags,steps\n"Imported, with comma",high,api,a;b,"1. Open app -> Home shown\n2. Tap pay -> Paid"\n',
    });
    assert.equal(imported.status, 201);
    const tc = await as('lead').get(`/api/testcases/${imported.body.ids[0]}`);
    assert.equal(tc.body.title, 'Imported, with comma');
    assert.equal(tc.body.priority, 'High');
    assert.deepEqual(tc.body.steps.map((s) => s.expected_result), ['Home shown', 'Paid']);
    const bad = await as('lead').post('/api/testcases/import', { projectId: BANKING, csv: 'title,priority\nok title,Nope\n' });
    assert.equal(bad.status, 400);
  });
  it('lets testers comment but not read-only users', async () => {
    assert.equal((await as('tester').post(`/api/testcases/${caseId}/comments`, { body: 'Looks good' })).status, 201);
    assert.equal((await as('viewer').post(`/api/testcases/${caseId}/comments`, { body: 'Hi' })).status, 403);
    assert.equal((await as('viewer').get(`/api/testcases/${caseId}/comments`)).body.data.length, 1);
  });
});

describe('caching', () => {
  it('serves analytics from Redis and invalidates on new executions', async () => {
    const url = `/api/analytics?projectId=${ECOMMERCE}&days=14`;
    const first = await as('viewer').get(url);
    assert.equal(first.headers['x-cache'], 'MISS');
    const second = await as('viewer').get(url);
    assert.equal(second.headers['x-cache'], 'HIT');
    assert.deepEqual(second.body.summary, first.body.summary);
    await as('tester').post('/api/testexecutions', { testCaseId: 2, status: 'Fail', comments: 'broken' });
    const third = await as('viewer').get(url);
    assert.equal(third.headers['x-cache'], 'MISS');
  });
  it('caches suite lists and invalidates on suite changes', async () => {
    const url = `/api/testsuites?projectId=${ECOMMERCE}`;
    await as('viewer').get(url);
    assert.equal((await as('viewer').get(url)).headers['x-cache'], 'HIT');
    await as('lead').post('/api/testsuites', { projectId: ECOMMERCE, name: 'New suite' });
    const after = await as('viewer').get(url);
    assert.equal(after.headers['x-cache'], 'MISS');
    assert.ok(after.body.data.some((s) => s.name === 'New suite'));
  });
  it('caches project metadata and invalidates on update', async () => {
    await as('viewer').get(`/api/projects/${ECOMMERCE}`);
    assert.equal((await as('viewer').get(`/api/projects/${ECOMMERCE}`)).headers['x-cache'], 'HIT');
    await as('lead').put(`/api/projects/${ECOMMERCE}`, { version: '2.3.1' });
    const res = await as('viewer').get(`/api/projects/${ECOMMERCE}`);
    assert.equal(res.headers['x-cache'], 'MISS');
    assert.equal(res.body.version, '2.3.1');
  });
  it('exposes hit/miss metrics', async () => {
    const res = await as('viewer').get('/api/metrics/cache');
    assert.equal(res.body.redis, 'connected');
    const analytics = res.body.prefixes.find((p) => p.prefix === 'analytics');
    assert.ok(analytics.hits >= 1 && analytics.misses >= 1);
  });
});

describe('suite runs, executions, attachments and defects', () => {
  let runId;
  let failedExecution;
  it('runs an entire suite and tracks progress', async () => {
    const run = await as('tester').post('/api/testsuites/6/runs', {});
    assert.equal(run.status, 201);
    runId = run.body.id;
    const detail = await as('tester').get(`/api/testruns/${runId}`);
    assert.equal(detail.body.total, detail.body.cases.length);
    assert.equal(detail.body.executed, 0);
    const first = detail.body.cases[0];
    const exec = await as('tester').post('/api/testexecutions', { testCaseId: first.id, status: 'Fail', runId, comments: 'Wrong status code' });
    assert.equal(exec.status, 201);
    failedExecution = exec.body;
    const after = await as('viewer').get(`/api/testruns/${runId}`);
    assert.equal(after.body.executed, 1);
    assert.equal(after.body.cases[0].result, 'Fail');
    assert.equal(after.body.byTester[0].executed, 1);
  });
  it('rejects results for cases outside the run', async () => {
    const res = await as('tester').post('/api/testexecutions', { testCaseId: 1, status: 'Pass', runId });
    assert.equal(res.status, 400);
  });
  it('accepts whitelisted attachments and rejects spoofed content', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const ok = await as('tester').upload(`/api/testexecutions/${failedExecution.id}/attachments`).attach('files', png, 'screen.png');
    assert.equal(ok.status, 201);
    const fake = await as('tester').upload(`/api/testexecutions/${failedExecution.id}/attachments`).attach('files', Buffer.from('<html>'), 'evil.png');
    assert.equal(fake.status, 400);
    const exe = await as('tester').upload(`/api/testexecutions/${failedExecution.id}/attachments`).attach('files', Buffer.from('MZ'), 'run.exe');
    assert.equal(exe.status, 400);
    const dl = await as('viewer').get(`/api/testexecutions/attachments/${ok.body.data[0].id}`);
    assert.equal(dl.status, 200);
    assert.match(dl.headers['content-disposition'], /^attachment/);
    assert.equal(dl.headers['x-content-type-options'], 'nosniff');
  });
  it('creates a defect from a failed execution', async () => {
    const res = await as('tester').post('/api/defects', { projectId: ECOMMERCE, executionId: failedExecution.id, title: 'API returns 500', severity: 'High' });
    assert.equal(res.status, 201);
    assert.equal(res.body.test_case_id, failedExecution.test_case_id);
    assert.equal((await as('viewer').post('/api/defects', { projectId: ECOMMERCE, title: 'Viewer defect' })).status, 403);
    const upd = await as('lead').put(`/api/defects/${res.body.id}`, { status: 'Resolved' });
    assert.equal(upd.body.status, 'Resolved');
  });
  it('keeps history per test case and limits testers to their own results', async () => {
    const hist = await as('viewer').get(`/api/testcases/${failedExecution.test_case_id}/executions`);
    assert.equal(hist.body.data[0].id, failedExecution.id);
    assert.equal(hist.body.data[0].defects.length, 1);
    const leadExec = await as('lead').post('/api/testexecutions', { testCaseId: 3, status: 'Pass' });
    assert.equal((await as('tester').put(`/api/testexecutions/${leadExec.body.id}`, { status: 'Fail' })).status, 403);
    assert.equal((await as('tester').put(`/api/testexecutions/${failedExecution.id}`, { status: 'Blocked' })).status, 200);
  });
  it('completes the run and reports on the suite', async () => {
    assert.equal((await as('tester').patch(`/api/testruns/${runId}`, { status: 'completed' })).status, 200);
    assert.equal((await as('tester').post('/api/testexecutions', { testCaseId: failedExecution.test_case_id, status: 'Pass', runId })).status, 409);
    const report = await as('viewer').get('/api/testsuites/6/report');
    assert.equal(report.status, 200);
    assert.equal(report.body.runs[0].id, runId);
    assert.ok(report.body.total > 0);
  });
});

describe('analytics content', () => {
  it('returns summary, coverage, trend, priority, tester and defect metrics', async () => {
    const res = await as('viewer').get(`/api/analytics?projectId=${ECOMMERCE}&days=30`);
    const d = res.body;
    assert.equal(d.trend.length, 30);
    assert.equal(d.byPriority.length, 4);
    assert.ok(d.byTester.length >= 3);
    assert.equal(d.summary.total, d.summary.Pass + d.summary.Fail + d.summary.Blocked + d.summary.Skipped + d.summary.Pending);
    assert.ok(d.coverage.executedPct > 0);
    assert.ok(d.defects.total > 0);
  });
});
