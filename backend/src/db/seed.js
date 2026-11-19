/* Seeds demo users and realistic sample data.
 * Usage: npm run db:seed          (skips if users already exist)
 *        npm run db:reset         (wipes all data, then seeds)
 */
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { migrate } = require('./migrate');

// Deterministic PRNG so every seed produces the same data.
let state = 20261123;
const rand = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const weighted = (pairs) => {
  const total = pairs.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[0][0];
};

const USERS = [
  { key: 'admin', name: 'Alice Admin', email: 'admin@demo.com', password: 'Admin@123', role: 'admin' },
  { key: 'lead', name: 'Leo Lead', email: 'lead@demo.com', password: 'Lead@123', role: 'test-lead' },
  { key: 'tester', name: 'Tara Tester', email: 'tester@demo.com', password: 'Tester@123', role: 'tester' },
  { key: 'viewer', name: 'Victor Viewer', email: 'viewer@demo.com', password: 'Viewer@123', role: 'read-only' },
  { key: 'tester2', name: 'Sam Singh', email: 'sam@demo.com', password: 'Tester@123', role: 'tester' },
  { key: 'tester3', name: 'Priya Patel', email: 'priya@demo.com', password: 'Tester@123', role: 'tester' },
  { key: 'lead2', name: 'Maya Chen', email: 'maya@demo.com', password: 'Lead@123', role: 'test-lead' },
];

const MODULES = {
  Authentication: ['login', 'auth'],
  'Product Catalog': ['catalog'],
  Search: ['search'],
  Cart: ['cart'],
  Checkout: ['checkout'],
  Payments: ['payments'],
  Orders: ['orders'],
  'User Profile': ['profile'],
  Reviews: ['reviews'],
  Notifications: ['notifications'],
  'Admin Panel': ['admin'],
  'Public API': ['api'],
};

const SCENARIOS = [
  ['Verify {m} happy path for a registered user', 'Functional', 'High', ['smoke']],
  ['Validate {m} input field validation messages', 'UI', 'Medium', ['validation']],
  ['Check {m} behaviour with an expired session', 'Integration', 'High', ['session']],
  ['Regression: {m} works after the v2.3 release', 'Regression', 'Medium', ['release-2.3']],
  ['Smoke test {m} page loads under 2 seconds', 'Smoke', 'Critical', ['performance', 'smoke']],
  ['{m} REST endpoint returns correct status codes', 'API', 'High', ['rest']],
  ['{m} handles concurrent updates without data loss', 'Integration', 'Critical', ['concurrency']],
  ['{m} layout is responsive on mobile viewports', 'UI', 'Low', ['mobile', 'responsive']],
  ['{m} rejects malicious input (XSS / SQL injection)', 'Functional', 'Critical', ['security']],
  ['{m} shows a friendly error when the server is down', 'Functional', 'Low', ['error-handling']],
];

const STEP_TEMPLATES = [
  ['Log in as a registered customer', 'Dashboard is displayed'],
  ['Navigate to the {m} section', '{m} page loads without errors'],
  ['Fill in the required fields with valid data', 'No validation errors are shown'],
  ['Submit the form', 'Success message is displayed'],
  ['Refresh the page', 'Saved data persists'],
  ['Repeat with invalid data', 'Inline validation errors are shown'],
];

async function seed({ reset }) {
  await migrate({ silent: true });
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM users');
    if (rows[0].n > 0 && !reset) {
      console.log('[seed] data already present, skipping (use npm run db:reset to reseed)');
      return;
    }
    await client.query('BEGIN');
    if (reset) {
      await client.query(`TRUNCATE audit_logs, test_case_comments, test_case_versions, defects, execution_attachments,
        test_executions, test_runs, test_suite_cases, test_suites, test_steps, test_cases, project_members, projects, users
        RESTART IDENTITY CASCADE`);
    }

    // ---- Users ----
    const u = {};
    for (const user of USERS) {
      const hash = await bcrypt.hash(user.password, 10);
      const r = await client.query(
        `INSERT INTO users (name, email, password_hash, role, created_at) VALUES ($1, $2, $3, $4, NOW() - INTERVAL '45 days') RETURNING id`,
        [user.name, user.email, hash, user.role]
      );
      u[user.key] = r.rows[0].id;
    }

    // ---- Projects ----
    const createProject = async (name, description, version, status, members, daysAgo) => {
      const r = await client.query(
        `INSERT INTO projects (name, description, version, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - make_interval(days => $6), NOW() - make_interval(days => $6)) RETURNING id`,
        [name, description, version, status, u.admin, daysAgo]
      );
      const id = r.rows[0].id;
      for (const m of members) await client.query('INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)', [id, u[m]]);
      await audit(client, u.admin, id, 'create', 'project', id, { name }, daysAgo);
      return id;
    };

    const ecommerce = await createProject(
      'E-Commerce Web App v2.3',
      'Customer-facing web shop: catalog, cart, checkout, payments and order management. Release 2.3 regression cycle.',
      '2.3.0',
      'active',
      ['admin', 'lead', 'tester', 'viewer', 'tester2', 'tester3'],
      40
    );
    const banking = await createProject(
      'Mobile Banking App',
      'iOS / Android banking app: accounts, transfers and card management.',
      '1.4.2',
      'active',
      ['admin', 'lead', 'tester', 'lead2'],
      25
    );
    await createProject('Internal HR Portal', 'Leave requests and payroll self-service. Restricted team.', '0.9', 'on-hold', ['admin', 'lead2'], 20);

    // ---- E-commerce test cases ----
    const testers = [u.tester, u.tester2, u.tester3];
    const caseIds = [];
    const casesByModule = {};
    for (const [mod, modTags] of Object.entries(MODULES)) {
      casesByModule[mod] = [];
      for (const [tpl, type, priority, tags] of SCENARIOS) {
        const title = tpl.replace('{m}', mod);
        const assignee = rand() < 0.75 ? pick(testers) : rand() < 0.5 ? u.lead : null;
        const daysAgo = 30 + Math.floor(rand() * 8);
        const r = await client.query(
          `INSERT INTO test_cases (project_id, title, description, priority, type, preconditions, postconditions, tags,
                                   assigned_to, created_by, updated_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, NOW() - make_interval(days => $11), NOW() - make_interval(days => $11))
           RETURNING id`,
          [
            ecommerce,
            title,
            `Objective: ${title}. Covers the ${mod} module of the web shop.`,
            priority,
            type,
            'Test environment is deployed with release 2.3 and seeded with demo products.',
            rand() < 0.5 ? 'Test data is cleaned up.' : '',
            [...modTags, ...tags],
            assignee,
            pick([u.admin, u.lead]),
            daysAgo,
          ]
        );
        const id = r.rows[0].id;
        caseIds.push({ id, priority, mod });
        casesByModule[mod].push(id);
        // 90% of cases have steps
        if (rand() < 0.9) {
          const n = 3 + Math.floor(rand() * 4);
          for (let i = 0; i < n; i++) {
            const [action, expected] = STEP_TEMPLATES[i];
            await client.query('INSERT INTO test_steps (test_case_id, step_number, action, expected_result) VALUES ($1, $2, $3, $4)', [
              id,
              i + 1,
              action.replace('{m}', mod),
              expected.replace('{m}', mod),
            ]);
          }
        }
        await audit(client, u.lead, ecommerce, 'create', 'test_case', id, { title }, daysAgo);
      }
    }
    // Extra cases so the list exceeds 120
    for (let i = 1; i <= 6; i++) {
      const r = await client.query(
        `INSERT INTO test_cases (project_id, title, description, priority, type, tags, created_by, updated_by, created_at)
         VALUES ($1, $2, $3, $4, 'Functional', $5, $6, $6, NOW() - INTERVAL '3 days') RETURNING id`,
        [ecommerce, `Exploratory: gift card edge case #${i}`, 'New cases drafted for the next sprint, not yet executed.', pick(['Low', 'Medium']), ['gift-cards', 'draft'], u.lead]
      );
      caseIds.push({ id: r.rows[0].id, priority: 'Medium', mod: 'Gift cards', draft: true });
    }

    // Version 1 snapshots for every case
    await client.query(
      `INSERT INTO test_case_versions (test_case_id, version, snapshot, changed_by, changed_at)
       SELECT tc.id, 1, jsonb_build_object('title', tc.title, 'description', tc.description, 'priority', tc.priority, 'type', tc.type,
              'preconditions', tc.preconditions, 'postconditions', tc.postconditions, 'tags', tc.tags, 'assignedTo', tc.assigned_to,
              'steps', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', s.action, 'expectedResult', s.expected_result) ORDER BY s.step_number)
                                 FROM test_steps s WHERE s.test_case_id = tc.id), '[]'::jsonb)),
              tc.created_by, tc.created_at
         FROM test_cases tc`
    );
    // A few cases were edited later (version 2)
    for (const { id } of caseIds.slice(0, 8)) {
      await client.query(`UPDATE test_cases SET priority = 'Critical', version = 2, updated_by = $2, updated_at = NOW() - INTERVAL '10 days' WHERE id = $1`, [id, u.lead]);
      await client.query(
        `INSERT INTO test_case_versions (test_case_id, version, snapshot, changed_by, changed_at)
         SELECT id, 2, (SELECT snapshot FROM test_case_versions WHERE test_case_id = $1 AND version = 1) || '{"priority":"Critical"}'::jsonb, $2, NOW() - INTERVAL '10 days'
           FROM test_cases WHERE id = $1`,
        [id, u.lead]
      );
      await audit(client, u.lead, ecommerce, 'update', 'test_case', id, { priority: { from: 'High', to: 'Critical' } }, 10);
    }

    // ---- Suites ----
    const core = caseIds.filter((c) => !c.draft);
    const suiteDefs = [
      ['Smoke Suite', 'Fast checks run on every deployment', core.filter((c, i) => i % 10 === 4 || i % 10 === 0).map((c) => c.id)],
      ['Checkout & Payments', 'End-to-end purchase flow', [...casesByModule.Cart, ...casesByModule.Checkout, ...casesByModule.Payments]],
      ['Authentication & Profile', 'Login, session and account management', [...casesByModule.Authentication, ...casesByModule['User Profile']]],
      ['Release 2.3 Regression', 'Full regression for the 2.3 release', core.filter((c, i) => i % 10 === 3 || i % 10 === 6).map((c) => c.id)],
      ['Security', 'Input sanitization and auth hardening', core.filter((c, i) => i % 10 === 8).map((c) => c.id)],
      ['Public API Contract', 'REST API contract tests', [...casesByModule['Public API']]],
    ];
    const suites = [];
    for (const [name, description, ids] of suiteDefs) {
      const r = await client.query(
        `INSERT INTO test_suites (project_id, name, description, created_by, created_at) VALUES ($1, $2, $3, $4, NOW() - INTERVAL '32 days') RETURNING id`,
        [ecommerce, name, description, u.lead]
      );
      const sid = r.rows[0].id;
      suites.push({ id: sid, name, ids });
      await client.query(
        `INSERT INTO test_suite_cases (suite_id, test_case_id, position) SELECT $1, x.id, x.ord FROM unnest($2::int[]) WITH ORDINALITY x(id, ord)`,
        [sid, ids]
      );
      await audit(client, u.lead, ecommerce, 'create', 'test_suite', sid, { name }, 32);
    }

    // ---- 30 days of execution history ----
    const failProb = { Critical: 0.18, High: 0.14, Medium: 0.1, Low: 0.06 };
    const executable = caseIds.filter((c) => !c.draft);
    const failures = [];
    const insertExecution = async (caseId, status, by, at, runId = null, comment = '') => {
      const r = await client.query(
        `INSERT INTO test_executions (test_case_id, project_id, run_id, executed_by, status, comments, duration_seconds, executed_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
        [caseId, ecommerce, runId, by, status, comment, 30 + Math.floor(rand() * 600), at]
      );
      return r.rows[0].id;
    };
    const resultFor = (priority, day) => {
      // Quality improves over the cycle: fail rate drops in later days.
      const f = failProb[priority] * (1.4 - day / 30);
      return weighted([['Pass', 1 - f - 0.08], ['Fail', f], ['Blocked', 0.05], ['Skipped', 0.03]]);
    };
    for (let day = 0; day < 30; day++) {
      const daysAgo = 30 - day;
      const count = 8 + Math.floor(rand() * 14);
      for (let i = 0; i < count; i++) {
        const c = pick(executable);
        const status = resultFor(c.priority, day);
        const at = new Date(Date.now() - daysAgo * 86400000 + Math.floor(rand() * 8 * 3600000));
        const comment = status === 'Fail' ? pick(['Unexpected 500 error', 'Button not clickable on Safari', 'Wrong total shown', 'Timeout after 30s']) : status === 'Blocked' ? 'Environment unavailable' : '';
        const id = await insertExecution(c.id, status, pick([...testers, u.lead]), at, null, comment);
        if (status === 'Fail') failures.push({ execId: id, caseId: c.id, at, priority: c.priority });
      }
    }

    // Completed run of the Smoke Suite and an in-progress Checkout run
    const smoke = suites[0];
    const done = await client.query(
      `INSERT INTO test_runs (project_id, suite_id, name, status, case_ids, started_by, started_at, completed_at)
       VALUES ($1, $2, 'Smoke – nightly build 2.3.0-rc1', 'completed', $3, $4, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '3 hours') RETURNING id`,
      [ecommerce, smoke.id, smoke.ids, u.lead]
    );
    for (const cid of smoke.ids) {
      const c = executable.find((x) => x.id === cid);
      const status = resultFor(c.priority, 28);
      const at = new Date(Date.now() - 2 * 86400000 + Math.floor(rand() * 3 * 3600000));
      const id = await insertExecution(cid, status, pick(testers), at, done.rows[0].id, status === 'Fail' ? 'Regression found in rc1' : '');
      if (status === 'Fail') failures.push({ execId: id, caseId: cid, at, priority: c.priority });
    }
    await audit(client, u.lead, ecommerce, 'complete_run', 'test_run', done.rows[0].id, {}, 2);

    const checkout = suites[1];
    const open = await client.query(
      `INSERT INTO test_runs (project_id, suite_id, name, status, case_ids, started_by, started_at)
       VALUES ($1, $2, 'Checkout – release candidate 2', 'in-progress', $3, $4, NOW() - INTERVAL '3 hours') RETURNING id`,
      [ecommerce, checkout.id, checkout.ids, u.lead]
    );
    for (const cid of checkout.ids.slice(0, Math.floor(checkout.ids.length * 0.4))) {
      const c = executable.find((x) => x.id === cid);
      await insertExecution(cid, resultFor(c.priority, 29), pick(testers), new Date(Date.now() - Math.floor(rand() * 2 * 3600000)), open.rows[0].id);
    }
    await audit(client, u.lead, ecommerce, 'start_run', 'test_run', open.rows[0].id, { suite: checkout.name }, 0);

    // ---- Defects from failed executions ----
    const statuses = ['Open', 'Open', 'In Progress', 'Resolved', 'Closed'];
    for (const f of failures.slice(-22)) {
      const tc = await client.query('SELECT title FROM test_cases WHERE id = $1', [f.caseId]);
      const r = await client.query(
        `INSERT INTO defects (project_id, test_case_id, execution_id, title, description, severity, status, reported_by, assigned_to, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) RETURNING id`,
        [
          ecommerce,
          f.caseId,
          f.execId,
          `Failure: ${tc.rows[0].title}`.slice(0, 255),
          `Found while executing test case #${f.caseId}. See execution #${f.execId} for details.`,
          f.priority,
          pick(statuses),
          pick(testers),
          rand() < 0.6 ? u.lead : null,
          f.at,
        ]
      );
      await audit(client, u.tester, ecommerce, 'create', 'defect', r.rows[0].id, { executionId: f.execId }, 0);
    }

    // ---- Comments ----
    const comments = [
      [u.tester, 'Step 3 needs a clearer expected result - which message exactly?'],
      [u.lead, 'Updated, thanks. It should say "Saved successfully".'],
      [u.tester2, 'This one is flaky on Firefox, retried twice.'],
      [u.admin, 'Please attach the HAR file when this fails again.'],
    ];
    for (const { id } of caseIds.slice(0, 5)) {
      for (const [uid, body] of comments) {
        await client.query(`INSERT INTO test_case_comments (test_case_id, user_id, body, created_at) VALUES ($1, $2, $3, NOW() - INTERVAL '5 days' + make_interval(mins => $4))`, [
          id,
          uid,
          body,
          Math.floor(rand() * 600),
        ]);
      }
    }

    // ---- Mobile banking project (smaller) ----
    const bankingCases = [
      ['Login with biometrics', 'Critical', 'Functional'],
      ['Transfer money between own accounts', 'Critical', 'Integration'],
      ['View last 30 days of transactions', 'High', 'Functional'],
      ['Freeze and unfreeze a debit card', 'High', 'Functional'],
      ['Push notification on incoming payment', 'Medium', 'Integration'],
      ['Dark mode renders all screens correctly', 'Low', 'UI'],
      ['Accounts API returns balances in minor units', 'High', 'API'],
      ['App cold start under 3 seconds', 'Medium', 'Smoke'],
    ];
    const bIds = [];
    for (const [title, priority, type] of bankingCases) {
      const r = await client.query(
        `INSERT INTO test_cases (project_id, title, description, priority, type, tags, assigned_to, created_by, updated_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, NOW() - INTERVAL '20 days') RETURNING id`,
        [banking, title, `Verify: ${title}.`, priority, type, ['mobile'], u.tester, u.lead2]
      );
      bIds.push(r.rows[0].id);
      await client.query(`INSERT INTO test_steps (test_case_id, step_number, action, expected_result) VALUES ($1, 1, 'Open the app on a test device', 'Home screen is shown'), ($1, 2, $2, 'Operation succeeds')`, [r.rows[0].id, title]);
    }
    await client.query(
      `INSERT INTO test_case_versions (test_case_id, version, snapshot, changed_by)
       SELECT id, 1, jsonb_build_object('title', title, 'priority', priority, 'type', type), created_by FROM test_cases WHERE project_id = $1`,
      [banking]
    );
    const bSuite = await client.query(`INSERT INTO test_suites (project_id, name, description, created_by) VALUES ($1, 'Core Banking', 'Money movement and accounts', $2) RETURNING id`, [banking, u.lead2]);
    await client.query(`INSERT INTO test_suite_cases (suite_id, test_case_id, position) SELECT $1, x.id, x.ord FROM unnest($2::int[]) WITH ORDINALITY x(id, ord)`, [bSuite.rows[0].id, bIds.slice(0, 4)]);
    for (let d = 10; d > 0; d--) {
      const cid = pick(bIds);
      await client.query(
        `INSERT INTO test_executions (test_case_id, project_id, executed_by, status, executed_at) VALUES ($1, $2, $3, $4, NOW() - make_interval(days => $5))`,
        [cid, banking, u.tester, weighted([['Pass', 0.8], ['Fail', 0.15], ['Blocked', 0.05]]), d]
      );
    }

    await client.query('COMMIT');
    const counts = await client.query(
      `SELECT (SELECT COUNT(*) FROM users) users, (SELECT COUNT(*) FROM projects) projects, (SELECT COUNT(*) FROM test_cases) cases,
              (SELECT COUNT(*) FROM test_suites) suites, (SELECT COUNT(*) FROM test_executions) executions, (SELECT COUNT(*) FROM defects) defects`
    );
    console.log('[seed] done:', counts.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function audit(client, userId, projectId, action, entityType, entityId, details, daysAgo) {
  return client.query(
    `INSERT INTO audit_logs (user_id, project_id, action, entity_type, entity_id, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() - make_interval(days => $7))`,
    [userId, projectId, action, entityType, entityId, JSON.stringify(details), daysAgo]
  );
}

if (require.main === module) {
  seed({ reset: process.argv.includes('--reset') })
    .then(() => pool.end())
    .catch((err) => {
      console.error('[seed] failed:', err);
      process.exit(1);
    });
}

module.exports = { seed };
