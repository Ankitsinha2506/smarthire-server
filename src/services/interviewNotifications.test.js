import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileNotifications as reconcile} from './interviewNotifications.js';

test('existing interviews become the baseline, then the thirteenth is unread', () => {
  const keys = Array.from({length: 12}, (_, i) => String(i));
  const baseline = reconcile(null, keys, 'all');
  assert.deepEqual(baseline.unread, []);
  const next = reconcile(baseline, [...keys, '12'], 'all');
  assert.deepEqual(next.unread, ['12']);
  assert.deepEqual(reconcile(next, [...keys, '12'], 'all'), next);
});
test('replacement is detected even when total count stays the same', () => {
  const state = reconcile(null, ['a', 'b'], 'all');
  assert.deepEqual(reconcile(state, ['a', 'c'], 'all').unread, ['c']);
});
test('read entries and reappearing entries do not notify again', () => {
  const state = {scope: 'all', known: ['a', 'b'], unread: []};
  assert.deepEqual(reconcile(state, ['a', 'b', 'c'], 'all').unread, ['c']);
});
test('stale snapshots cannot discard newer unread entries and scope changes reset the baseline', () => {
  const state = {scope: 'today', known: ['a', 'b'], unread: ['b']};
  assert.deepEqual(reconcile(state, ['a'], 'today').unread, ['b']);
  assert.deepEqual(reconcile(state, ['a', 'b', 'c'], 'all').unread, []);
});
test('per-account snapshots retain independent unread state', () => {
  const admin = {scope: 'all', known: ['a'], unread: []};
  const staff = {scope: 'all', known: ['a'], unread: ['a']};
  assert.deepEqual(reconcile(admin, ['a', 'b'], 'all').unread, ['b']);
  assert.deepEqual(reconcile(staff, ['a', 'b'], 'all').unread, ['a', 'b']);
});
