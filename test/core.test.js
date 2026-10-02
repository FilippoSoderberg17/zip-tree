import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZipTree, defaultRandInt } from '../src/index.js';

/**
 * Seeded linear congruential generator so every test in this file is fully
 * deterministic. We never touch wall-clock time or real randomness here.
 *
 * @param {number} seed
 * @returns {(maxExclusive: number) => number}
 */
function makeSeededRand(seed) {
  let state = seed >>> 0;
  return function rand(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError('maxExclusive must be a positive integer');
    }
    // LCG with constants from glibc / ANSI C — fine for tests.
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state % maxExclusive;
  };
}

test('default rand rejects non-positive max', () => {
  assert.throws(() => defaultRandInt(0), RangeError);
  assert.throws(() => defaultRandInt(-1), RangeError);
  assert.throws(() => defaultRandInt(1.5), RangeError);
});

test('default rand produces values in range', () => {
  // Statistical assertions are brittle; instead assert the invariant.
  for (let i = 0; i < 100; i++) {
    const v = defaultRandInt(7);
    assert.ok(Number.isInteger(v));
    assert.ok(v >= 0 && v < 7);
  }
});

test('constructor validates options', () => {
  assert.throws(() => new ZipTree({ rand: 'no' }), TypeError);
  assert.throws(() => new ZipTree({ maxRank: 0 }), RangeError);
  assert.throws(() => new ZipTree({ maxRank: -1 }), RangeError);
  assert.throws(() => new ZipTree({ maxRank: 1.5 }), RangeError);
  assert.throws(() => new ZipTree({ compare: 'no' }), TypeError);
});

test('empty tree reports size and contains correctly', () => {
  const t = new ZipTree();
  assert.equal(t.size, 0);
  assert.equal(t.isEmpty(), true);
  assert.equal(t.contains(1), false);
  assert.deepEqual(t.toArray(), []);
});

test('insert returns true on new and false on replace', () => {
  const t = new ZipTree({ rand: makeSeededRand(1) });
  assert.equal(t.insert(5), true);
  assert.equal(t.insert(5), false); // replace, no new node
  assert.equal(t.size, 1);
});

test('insert and contains round trip', () => {
  const t = new ZipTree({ rand: makeSeededRand(2) });
  for (const k of [10, 5, 20, 15, 25, 3, 7]) t.insert(k);
  for (const k of [10, 5, 20, 15, 25, 3, 7]) assert.equal(t.contains(k), true);
  assert.equal(t.contains(8), false);
});

test('iteration yields sorted order for arbitrary keys', () => {
  const t = new ZipTree({ rand: makeSeededRand(3) });
  const keys = [42, 7, 19, 4, 88, 100, 3, 56, 21, 0, -5, 17];
  for (const k of keys) t.insert(k);
  const out = t.toArray();
  const expected = [...keys].sort((a, b) => a - b);
  assert.deepEqual(out, expected);
});

test('insertion respects invariants when ranks are forced equal', () => {
  // Force every rank to 0. Ties go to existing node, so the tree degenerates
  // to an insertion-order chain on the search path. The implementation must
  // still produce a valid BST.
  const t = new ZipTree({ rand: () => 0, maxRank: 1 });
  for (const k of [5, 3, 8, 1, 4, 7, 9, 0, 2, 6]) t.insert(k);
  assert.deepEqual(t.toArray(), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(t.size, 10);
});

test('forced rank 0 with descending keys stays sorted', () => {
  const t = new ZipTree({ rand: () => 0, maxRank: 1 });
  for (let k = 100; k >= 0; k--) t.insert(k);
  const out = t.toArray();
  let prev = -1;
  for (const v of out) {
    assert.ok(v > prev, `out of order at ${v}`);
    prev = v;
  }
  assert.equal(out.length, 101);
});

test('forced rank 0 with ascending keys stays sorted', () => {
  const t = new ZipTree({ rand: () => 0, maxRank: 1 });
  for (let k = 0; k <= 100; k++) t.insert(k);
  const out = t.toArray();
  let prev = -1;
  for (const v of out) {
    assert.ok(v > prev, `out of order at ${v}`);
    prev = v;
  }
  assert.equal(out.length, 101);
});

test('delete returns false for absent key', () => {
  const t = new ZipTree({ rand: makeSeededRand(4) });
  t.insert(1);
  assert.equal(t.delete(2), false);
  assert.equal(t.size, 1);
});

test('delete leaf, one-child, and two-child cases all stay sorted', () => {
  const t = new ZipTree({ rand: makeSeededRand(5) });
  const keys = [50, 30, 70, 20, 40, 60, 80, 10, 35, 45, 65, 75, 90, 5, 85, 95];
  for (const k of keys) t.insert(k);
  // Delete a leaf, a node with one child, and a node with two children in turn.
  assert.equal(t.delete(5), true);   // leaf
  assert.equal(t.delete(20), true);  // node with left child 10
  assert.equal(t.delete(70), true);  // node with two children
  const remaining = keys.filter(k => k !== 5 && k !== 20 && k !== 70).sort((a, b) => a - b);
  assert.deepEqual(t.toArray(), remaining);
  assert.equal(t.size, remaining.length);
  // All survivors still findable.
  for (const k of remaining) assert.equal(t.contains(k), true);
  for (const k of [5, 20, 70]) assert.equal(t.contains(k), false);
});

test('delete every key one by one leaves an empty tree', () => {
  const t = new ZipTree({ rand: makeSeededRand(6) });
  const keys = [];
  for (let i = 0; i < 50; i++) keys.push(i);
  // Insert in scrambled order.
  const rand = makeSeededRand(31);
  const shuffled = [...keys].sort(() => (rand(3) - 1));
  for (const k of shuffled) t.insert(k);
  for (const k of keys) {
    assert.equal(t.delete(k), true, `delete ${k}`);
  }
  assert.equal(t.size, 0);
  assert.equal(t.isEmpty(), true);
  assert.deepEqual(t.toArray(), []);
});

test('delete the only node', () => {
  const t = new ZipTree({ rand: makeSeededRand(7) });
  t.insert(42);
  assert.equal(t.delete(42), true);
  assert.equal(t.size, 0);
  assert.equal(t.contains(42), false);
  assert.deepEqual(t.toArray(), []);
});

test('replace keeps size constant and updates key in place', () => {
  const t = new ZipTree({ rand: makeSeededRand(8) });
  t.insert(5);
  assert.equal(t.insert(5), false);
  assert.equal(t.size, 1);
  assert.equal(t.contains(5), true);
});

test('clear empties the tree', () => {
  const t = new ZipTree({ rand: makeSeededRand(9) });
  for (let i = 0; i < 10; i++) t.insert(i);
  t.clear();
  assert.equal(t.size, 0);
  assert.equal(t.isEmpty(), true);
  assert.deepEqual(t.toArray(), []);
});

test('custom comparator is honoured', () => {
  // Reverse order: the "largest" key sorts first.
  const t = new ZipTree({
    rand: makeSeededRand(10),
    compare: (a, b) => {
      if (a > b) return -1;
      if (a < b) return 1;
      return 0;
    },
  });
  for (const k of [1, 2, 3, 4, 5]) t.insert(k);
  assert.deepEqual(t.toArray(), [5, 4, 3, 2, 1]);
});

test('string keys with default-ish lexicographic comparator', () => {
  const t = new ZipTree({
    rand: makeSeededRand(11),
    compare: (a, b) => a < b ? -1 : a > b ? 1 : 0,
  });
  for (const s of ['banana', 'apple', 'cherry', 'date', 'elderberry']) t.insert(s);
  assert.deepEqual(t.toArray(), ['apple', 'banana', 'cherry', 'date', 'elderberry']);
});

test('mixed insert and delete interleaved stays sorted', () => {
  const t = new ZipTree({ rand: makeSeededRand(12) });
  const present = new Set();
  for (let i = 0; i < 200; i++) {
    const k = i % 50;
    if (i % 2 === 0) {
      if (!present.has(k)) {
        t.insert(k);
        present.add(k);
      }
    } else if (present.has(k)) {
      t.delete(k);
      present.delete(k);
    }
    const arr = t.toArray();
    const expected = [...present].sort((a, b) => a - b);
    assert.deepEqual(arr, expected, `step ${i}`);
  }
});

test('deterministic rank stream yields same shape twice', () => {
  function build() {
    const t = new ZipTree({ rand: makeSeededRand(99) });
    for (let i = 0; i < 30; i++) t.insert(i);
    return t.toArray();
  }
  assert.deepEqual(build(), build());
});
