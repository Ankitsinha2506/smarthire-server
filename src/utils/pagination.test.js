import test from 'node:test';
import assert from 'node:assert/strict';
import {pagination, pageMeta, combinedPageWindow} from './pagination.js';

test('pagination rejects unsafe, fractional and negative parameters', () => {
  for (const value of [-1, 0, 1.5, 'invalid', Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(pagination({page: value, limit: value}), {page: 1, limit: 10});
  }
  assert.deepEqual(pagination({page: '2', limit: '1000'}), {page: 2, limit: 100});
});
test('empty and deleted last pages clamp to a usable page', () => {
  assert.deepEqual(pageMeta(0, 5, 10), {total: 0, page: 1, pages: 1, limit: 10, offset: 0});
  assert.equal(pageMeta(20, 3, 10).page, 2);
});
test('combined pages return every record once across source boundaries', () => {
  for (const sheetCount of [0, 3, 10, 13, 30]) {
    for (const dbCount of [0, 4, 10, 25]) {
      const sheet = Array.from({length: sheetCount}, (_, i) => `sheet-${i}`);
      const database = Array.from({length: dbCount}, (_, i) => `db-${i}`);
      const actual = [];
      for (let offset = 0; offset < sheetCount + dbCount; offset += 10) {
        const window = combinedPageWindow(sheet, offset, 10);
        const page = [...window.items, ...database.slice(window.databaseOffset, window.databaseOffset + window.databaseLimit)];
        assert.ok(page.length <= 10);
        actual.push(...page);
      }
      assert.deepEqual(actual, [...sheet, ...database]);
    }
  }
});
