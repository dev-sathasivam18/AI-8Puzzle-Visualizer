/**
 * heap.js - A small binary min-heap (priority queue) written from scratch.
 * Used by Uniform Cost Search (and by the reference GBFS / A* implementations).
 *
 * The heap stores whatever you push (here: node ids) and orders them with the
 * comparator `less(a, b)` supplied by the caller.
 */
(function (root) {
  'use strict';

  class MinHeap {
    constructor(less) {
      this.a = [];
      this.less = less;
    }

    get size() {
      return this.a.length;
    }

    push(x) {
      const a = this.a;
      let i = a.length;
      a.push(x);
      // sift up
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (this.less(x, a[parent])) {
          a[i] = a[parent];
          i = parent;
        } else break;
      }
      a[i] = x;
    }

    pop() {
      const a = this.a;
      const top = a[0];
      const last = a.pop();
      if (a.length > 0) {
        // sift down the former last element from the root
        const n = a.length;
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= n) break;
          if (c + 1 < n && this.less(a[c + 1], a[c])) c++;
          if (this.less(a[c], last)) {
            a[i] = a[c];
            i = c;
          } else break;
        }
        a[i] = last;
      }
      return top;
    }
  }

  root.MinHeap = MinHeap;
})(typeof window !== 'undefined' ? window : globalThis);
