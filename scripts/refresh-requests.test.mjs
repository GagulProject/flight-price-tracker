import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingRefreshRequests, refreshMarker, refreshTitle } from './refresh-requests.mjs';

test('only earlier matching mobile requests are completed', () => {
  const matching = { number: 1, state: 'open', title: refreshTitle, body: `${refreshMarker}\nSEL → TYO\n2026-12-30 → 2027-01-01`, created_at: '2026-10-17T07:00:00Z' };
  const issues = [matching, { ...matching, number: 2, created_at: '2026-10-17T07:10:00Z' }, { ...matching, number: 3, title: 'Other issue' }, { ...matching, number: 4, body: 'Other route' }, { ...matching, number: 5, pull_request: {} }];
  assert.deepEqual(pendingRefreshRequests(issues, '2026-10-17T07:05:00Z').map(issue => issue.number), [1]);
});
