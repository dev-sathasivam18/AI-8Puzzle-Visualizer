/**
 * board.js - Renders 8-puzzle boards.
 *
 *  Board  : an animated board. Every tile is its own element positioned with CSS
 *           transforms, so when the state changes the tiles SLIDE into place and the
 *           blank (dashed outline) visibly moves.
 *  mini() : a tiny static board (HTML string) used in the frontier / explored lists.
 */
(function (root) {
  'use strict';

  const P = root.Puzzle;

  class Board {
    /**
     * @param {HTMLElement} container
     * @param {{size?: 'sm'|'md'|'lg'}} opts
     */
    constructor(container, opts) {
      this.el = container;
      this.el.classList.add('board');
      if (opts && opts.size) this.el.classList.add('board-' + opts.size);
      this.tiles = {};
      this.el.innerHTML = '';

      this.blank = document.createElement('div');
      this.blank.className = 'tile tile-blank';
      this.blank.innerHTML = '<div class="face"></div>';
      this.el.appendChild(this.blank);

      for (let n = 1; n <= 8; n++) {
        const t = document.createElement('div');
        t.className = 'tile';
        t.innerHTML = '<div class="face">' + n + '</div>';
        this.el.appendChild(t);
        this.tiles[n] = t;
      }
      this.lastKey = null;
    }

    /** Duration (ms) of the sliding animation. */
    setDuration(ms) {
      this.el.style.setProperty('--dur', Math.max(0, ms) + 'ms');
    }

    /**
     * Show a state.
     * @param {number[]} arr   9 numbers, 0 = blank
     * @param {{highlight?: number|null}} opts  tile number to flash (the tile that just moved)
     */
    set(arr, opts) {
      const highlight = opts && opts.highlight ? opts.highlight : null;
      for (let i = 0; i < 9; i++) {
        const v = arr[i];
        const el = v === 0 ? this.blank : this.tiles[v];
        el.style.setProperty('--r', Math.floor(i / 3));
        el.style.setProperty('--c', i % 3);
      }
      for (let n = 1; n <= 8; n++) {
        this.tiles[n].classList.toggle('moved', n === highlight);
      }
      this.el.setAttribute('aria-label', 'Puzzle state ' + arr.map((v) => (v === 0 ? 'blank' : v)).join(' '));
    }
  }

  /** Tiny static board as an HTML string. `key` may be a packed key or an array. */
  function mini(state, opts) {
    const arr = Array.isArray(state) ? state : P.arrOf(state);
    const hl = opts && opts.highlight ? opts.highlight : 0;
    let h = '<span class="mini' + (opts && opts.cls ? ' ' + opts.cls : '') + '">';
    for (let i = 0; i < 9; i++) {
      const v = arr[i];
      h +=
        '<i class="' + (v === 0 ? 'b' : v === hl ? 'm' : '') + '">' + (v === 0 ? '' : v) + '</i>';
    }
    return h + '</span>';
  }

  root.Board = Board;
  root.Board.mini = mini;
})(typeof window !== 'undefined' ? window : globalThis);
