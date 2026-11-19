import { describe, expect, it } from 'vitest';
import { can, PERMISSIONS } from './permissions';
import { describeDetails, passRate } from './constants';

describe('permissions matrix (mirrors backend RBAC)', () => {
  it('read-only users cannot execute or edit', () => {
    expect(can('read-only', 'execution:create')).toBe(false);
    expect(can('read-only', 'testcase:edit')).toBe(false);
    expect(can('read-only', 'defect:create')).toBe(false);
  });
  it('testers execute and raise defects but cannot manage test cases', () => {
    expect(can('tester', 'execution:create')).toBe(true);
    expect(can('tester', 'defect:create')).toBe(true);
    expect(can('tester', 'testcase:create')).toBe(false);
    expect(can('tester', 'project:create')).toBe(false);
  });
  it('test leads manage everything except users', () => {
    expect(can('test-lead', 'testcase:bulk')).toBe(true);
    expect(can('test-lead', 'project:create')).toBe(true);
    expect(can('test-lead', 'users:manage')).toBe(false);
  });
  it('admins can do everything', () => {
    Object.keys(PERMISSIONS).forEach((p) => expect(can('admin', p)).toBe(true));
  });
  it('unknown roles or actions are denied', () => {
    expect(can(null, 'testcase:edit')).toBe(false);
    expect(can('admin', 'nope')).toBe(false);
  });
});

describe('helpers', () => {
  it('computes pass rate over executed cases only', () => {
    expect(passRate({ Pass: 3, Fail: 1, Pending: 10 })).toBe(75);
    expect(passRate({})).toBe(0);
  });
  it('describes audit diffs', () => {
    expect(describeDetails({ priority: { from: 'High', to: 'Low' }, tags: ['a', 'b'] })).toBe('priority: High → Low · tags: a, b');
  });
});
