# zip-tree-js

A Zip Tree — a randomized binary search tree with treap-like expected depth but simpler `insert`/`delete` than a treap. Each node carries an integer rank drawn from a geometric(1/2) distribution; the tree is kept heap-ordered by rank and BST-ordered by key.

## Usage

```js
import { ZipTree } from './src/index.js';

const t = new ZipTree();
t.insert(5);
t.insert(2);
t.insert(8);
console.log(t.contains(5));   // true
console.log(t.toArray());      // [2, 5, 8]
t.delete(5);
console.log(t.size);          // 2
for (const k of t) console.log(k);
```

The exported names are `ZipTree`, `Node`, and `defaultRandInt`, all from the package root.

`new ZipTree({ rand, maxRank, compare })` — `rand(maxExclusive)` returns an integer in `[0, maxExclusive)`; the default uses `Math.random`. `maxRank` caps ranks at 32 by default. `compare(a, b)` is a strict-less-than comparator returning `-1`, `0`, or `1`; the default is numeric.

## Why

Zip trees (Tarajan et al., 2018) give the same expected depth and search cost as treaps and randomized BSTs, but with one-pass insertion and a shorter deletion path because ranks are integers and only ever compared for ordering — no per-node priority arithmetic. The trade-off is a slightly larger constant for the tie-breaking convention, which is a fair price for code that fits in one file and is easy to audit.

This implementation is a set, not a multiset: inserting a key that already exists replaces it in place rather than adding a duplicate. If you need duplicates, wrap the key in a counter and supply a comparator that breaks ties.

## Edge cases

- `insert` of an existing key returns `false` and does **not** create a new node; `size` is unchanged. The key object is updated in place.
- `delete` of an absent key returns `false`; the tree is untouched.
- When ranks tie (common under `maxRank: 1`), the existing node wins and the tree degenerates toward an insertion-order chain. The BST invariant still holds; the depth invariant does not. Pass a real `rand` for production trees.
- Iteration is in-order and ascending per the supplied `compare`. The default comparator assumes numeric keys and will not do what you want for strings unless you pass `compare: (a, b) => a < b ? -1 : a > b ? 1 : 0`.
- The default RNG is `Math.random` and is **not** seeded. Inject a `rand` function (the tests use a seeded LCG) if you need reproducible trees.
