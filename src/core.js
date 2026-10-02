/**
 * A Zip Tree is a randomized binary search tree with treap-like expected depth
 * but simpler insertion and deletion. Each node carries an integer rank drawn
 * from a geometric distribution. Zip trees achieve the same expected balance as
 * treaps while only ever comparing ranks (not weights), which makes the code
 * meaningfully shorter.
 *
 * This file is pure data-structure mechanics: no I/O, no globals.
 */

/**
 * Pluggable source of pseudo-random bits. The default uses Math.random, but
 * tests inject a seeded LCG so results are deterministic — see tests for the
 * exact stream each assertion depends on.
 *
 * @typedef {(maxExclusive: number) => number} RandInt
 */

/**
 * Default RNG: uniform integer in [0, maxExclusive) via Math.random.
 * Kept as an exported function so tests and consumers can swap in a seeded one
 * rather than monkey-patching the global.
 *
 * @param {number} maxExclusive
 * @returns {number}
 */
export function defaultRandInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`);
  }
  return Math.floor(Math.random() * maxExclusive);
}

/**
 * Draw a geometric(1/2) rank as the number of leading zero bits of a uniform
 * random byte stream, capped by maxRank to keep it a small integer. Zip
 * trees specifically use the geometric distribution; using a uniform random
 * integer instead would produce skewed trees.
 *
 * @param {RandInt} rand
 * @param {number} maxRank
 * @returns {number}
 */
function randomRank(rand, maxRank) {
  // Each bit is uniform over {0,1}; count consecutive zero bits from the
  // bottom. This is the textbook geometric(1/2) generator.
  let rank = 0;
  while (rank < maxRank && rand(2) === 0) {
    rank += 1;
  }
  return rank;
}

/**
 * @template T
 */
export class Node {
  /**
   * @param {T} key
   * @param {number} rank
   */
  constructor(key, rank) {
    /** @type {T} */
    this.key = key;
    /** @type {number} */
    this.rank = rank;
    /** @type {Node<T> | null} */
    this.left = null;
    /** @type {Node<T> | null} */
    this.right = null;
  }
}

/**
 * @template T
 */
export class ZipTree {
  /**
   * @param {object} [opts]
   * @param {RandInt} [opts.rand] Random integer source; defaults to Math.random.
   * @param {number} [opts.maxRank] Cap on ranks; defaults to 32, well above the
   *   O(log n) ranks a realistic tree ever sees, while preventing pathological
   *   growth in pathological inputs.
   * @param {(a: T, b: T) => number} [opts.compare] Strict-less-than comparator.
   *   Defaults to numeric comparison.
   */
  constructor(opts = {}) {
    const rand = opts.rand ?? defaultRandInt;
    if (typeof rand !== 'function') {
      throw new TypeError('opts.rand must be a function');
    }
    const maxRank = opts.maxRank ?? 32;
    if (!Number.isInteger(maxRank) || maxRank <= 0) {
      throw new RangeError('opts.maxRank must be a positive integer');
    }
    const compare = opts.compare ?? ((a, b) => {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });
    if (typeof compare !== 'function') {
      throw new TypeError('opts.compare must be a function');
    }
    this._rand = rand;
    this._maxRank = maxRank;
    this._compare = compare;
    /** @type {Node<T> | null} */
    this._root = null;
    /** @type {number} */
    this._size = 0;
  }

  /** @returns {number} */
  get size() {
    return this._size;
  }

  /** @returns {boolean} */
  isEmpty() {
    return this._size === 0;
  }

  /**
   * Insert a key. If the key already exists it is replaced — this library
   * supports a set/map, not a multiset.
   *
   * @param {T} key
   * @returns {boolean} true if a new node was created, false if an existing
   *   key was replaced.
   */
  insert(key) {
    // Replacing an existing key is rank-independent: it is an in-place update,
    // not a structural change, and must report false regardless of the rank the
    // new key would have drawn.
    let existing = this._root;
    while (existing !== null) {
      const cmp = this._compare(key, existing.key);
      if (cmp === 0) {
        existing.key = key;
        return false;
      }
      existing = cmp < 0 ? existing.left : existing.right;
    }

    const rank = randomRank(this._rand, this._maxRank);
    // The "search then unzip" insertion: walk down comparing keys, but split
    // whenever we find a node whose rank is strictly less than ours. Ties go
    // to the existing node (zip-tree convention), which keeps the tree stable
    // across repeated insertions of the same key.
    let prev = null;
    let cur = this._root;
    // Track whether the new node hangs off left or right of `prev`.
    let wentLeft = false;
    while (cur !== null && cur.rank >= rank) {
      const cmp = this._compare(key, cur.key);
      prev = cur;
      if (cmp < 0) {
        cur = cur.left;
        wentLeft = true;
      } else {
        cur = cur.right;
        wentLeft = false;
      }
    }
    const node = new Node(key, rank);
    if (prev === null) {
      this._root = node;
    } else if (wentLeft) {
      prev.left = node;
    } else {
      prev.right = node;
    }
    node.left = node.right = null;
    // Unzip: everything below `cur` whose keys are smaller than `key` hangs
    // off the new node's left; everything greater hangs off its right.
    let nextLeft = node;
    let nextRight = node;
    while (cur !== null) {
      const cmp = this._compare(key, cur.key);
      if (cmp < 0) {
        nextLeft.right = cur;
        nextLeft = cur;
        cur = cur.right;
        nextLeft.right = null;
      } else {
        nextRight.left = cur;
        nextRight = cur;
        cur = cur.left;
        nextRight.left = null;
      }
    }
    this._size += 1;
    return true;
  }

  /**
   * Remove a key. Returns true if the key was present, false otherwise.
   *
   * @param {T} key
   * @returns {boolean}
   */
  delete(key) {
    let prev = null;
    let cur = this._root;
    let wentLeft = false;
    while (cur !== null) {
      const cmp = this._compare(key, cur.key);
      if (cmp === 0) {
        // Zip the two subtrees by repeatedly taking the child with higher rank
        // (ties go left, an arbitrary but consistent choice).
        const merged = this._zip(cur.left, cur.right);
        if (prev === null) {
          this._root = merged;
        } else if (wentLeft) {
          prev.left = merged;
        } else {
          prev.right = merged;
        }
        this._size -= 1;
        return true;
      }
      prev = cur;
      if (cmp < 0) {
        wentLeft = true;
        cur = cur.left;
      } else {
        wentLeft = false;
        cur = cur.right;
      }
    }
    return false;
  }

  /**
   * Merge two disjoint subtrees into one by ranks. Ties go to the left subtree
   * — this is the zip-tree convention and it is important to be consistent so
   * the resulting tree is deterministic for a given rank stream.
   *
   * @param {Node<T> | null} a
   * @param {Node<T> | null} b
   * @returns {Node<T> | null}
   */
  _zip(a, b) {
    if (a === null) return b;
    if (b === null) return a;
    if (a.rank >= b.rank) {
      a.right = this._zip(a.right, b);
      return a;
    }
    b.left = this._zip(a, b.left);
    return b;
  }

  /**
   * @param {T} key
   * @returns {boolean}
   */
  contains(key) {
    let cur = this._root;
    while (cur !== null) {
      const cmp = this._compare(key, cur.key);
      if (cmp === 0) return true;
      cur = cmp < 0 ? cur.left : cur.right;
    }
    return false;
  }

  /**
   * In-order iteration. Yields keys in ascending order per the comparator.
   *
   * @returns {Generator<T, void, void>}
   */
  *[Symbol.iterator]() {
    const stack = [];
    let cur = this._root;
    while (cur !== null || stack.length > 0) {
      while (cur !== null) {
        stack.push(cur);
        cur = cur.left;
      }
      cur = stack.pop();
      yield cur.key;
      cur = cur.right;
    }
  }

  /**
   * Materialize iteration as an array. Convenience for consumers who don't
   * want to spread manually.
   *
   * @returns {T[]}
   */
  toArray() {
    return [...this];
  }

  /**
   * Remove every node. O(1) given GC; nodes still referenced elsewhere are
   * unaffected.
   */
  clear() {
    this._root = null;
    this._size = 0;
  }
}
