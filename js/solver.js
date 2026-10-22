/**
 * solver.js - Controller for solver.html
 *
 * Flow:  input -> UCS.run() computes the whole search and records a trace
 *        -> Replay steps through that trace (forward / backward) -> UI renders each step.
 *        When the search replay ends, the solution path is animated move by move.
 */
(function () {
  'use strict';

  const P = window.Puzzle;
  const B = window.Board;
  const esc = window.escapeHtml;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString('en-US');

  // speed levels (slider 1..8)
  const SEARCH_SPEEDS = [1, 2, 5, 10, 40, 150, 600, 3000]; // expansions per second
  const PATH_SPEEDS = [0.4, 0.7, 1, 1.5, 2, 3, 4, 6]; // solution moves per second

  const STATUS_TEXT = [
    { label: 'Added to frontier', cls: 's-new', badge: 'text-bg-success' },
    { label: 'Cheaper path found - replaced', cls: 's-improved', badge: 'text-bg-warning' },
    { label: 'Already explored - discarded', cls: 's-dup', badge: 'text-bg-secondary' },
    { label: 'In frontier, not cheaper - discarded', cls: 's-dup', badge: 'text-bg-secondary' }
  ];

  /* ====================================================================
     Replay: walks a recorded UCS trace forward and backward
     ==================================================================== */
  class Replay {
    constructor(result) {
      this.r = result;
      this.T = result.trace;
      this.total = this.T.stepNode.length;
      this.k = 0; // number of steps applied
      this.frontier = new Set([0]); // live frontier node ids
      this.closed = []; // explored node ids (in expansion order)
    }

    forward() {
      if (this.k >= this.total) return false;
      const T = this.T;
      const i = this.k;
      const id = T.stepNode[i];
      this.frontier.delete(id);
      if (i !== T.goalStep) {
        this.closed.push(id);
        for (let j = T.stepSuccStart[i]; j < T.stepSuccStart[i + 1]; j++) {
          const st = T.sStatus[j];
          if (st === 0) this.frontier.add(T.sId[j]);
          else if (st === 1) {
            this.frontier.delete(T.sRep[j]);
            this.frontier.add(T.sId[j]);
          }
        }
      }
      this.k++;
      return true;
    }

    backward() {
      if (this.k <= 0) return false;
      const T = this.T;
      const i = this.k - 1;
      const id = T.stepNode[i];
      if (i !== T.goalStep) {
        for (let j = T.stepSuccStart[i + 1] - 1; j >= T.stepSuccStart[i]; j--) {
          const st = T.sStatus[j];
          if (st === 0) this.frontier.delete(T.sId[j]);
          else if (st === 1) {
            this.frontier.delete(T.sId[j]);
            this.frontier.add(T.sRep[j]);
          }
        }
        this.closed.pop();
      }
      this.frontier.add(id);
      this.k--;
      return true;
    }
  }

  /** K cheapest frontier nodes ordered by (g, creation order) - the order UCS will expand them. */
  function topK(set, g, K) {
    const arr = [];
    const less = (a, b) => g[a] < g[b] || (g[a] === g[b] && a < b);
    for (const id of set) {
      if (arr.length === K && !less(id, arr[K - 1])) continue;
      let i = arr.length;
      arr.push(id);
      while (i > 0 && less(id, arr[i - 1])) {
        arr[i] = arr[i - 1];
        i--;
      }
      arr[i] = id;
      if (arr.length > K) arr.pop();
    }
    return arr;
  }

  /* ====================================================================
     State
     ==================================================================== */
  const S = {
    initial: P.EXAMPLE_INITIAL.slice(),
    goal: P.EXAMPLE_GOAL.slice(),
    costModel: 'unit',
    result: null,
    replay: null,
    phase: 'search', // 'search' | 'solution'
    p: 0, // index into the solution path
    playing: false,
    speedIdx: 4,
    revealed: false,
    busy: false
  };

  let boardInit, boardGoal, boardCur;
  let initInputs, goalInputs;
  let raf = 0;
  let lastT = 0;
  let acc = 0;

  /* ====================================================================
     Puzzle input grids
     ==================================================================== */
  function buildGrid(host, label) {
    host.innerHTML = '';
    const inputs = [];
    for (let i = 0; i < 9; i++) {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.maxLength = 1;
      inp.autocomplete = 'off';
      inp.inputMode = 'text';
      inp.setAttribute('aria-label', label + ' row ' + (Math.floor(i / 3) + 1) + ' column ' + ((i % 3) + 1));
      inp.addEventListener('focus', () => inp.select());
      inp.addEventListener('input', () => {
        let v = inp.value.trim();
        if (v === '' && inp.value === ' ') v = '_';
        if (v === '0' || v === '_') v = '_';
        else if (!/^[1-8]$/.test(v)) v = '';
        inp.value = v;
        inp.classList.remove('invalid');
        if (v && inputs[i + 1]) inputs[i + 1].focus();
      });
      host.appendChild(inp);
      inputs.push(inp);
    }
    return inputs;
  }

  function setGrid(inputs, arr) {
    inputs.forEach((inp, i) => {
      inp.value = arr[i] === 0 ? '_' : String(arr[i]);
      inp.classList.remove('invalid');
    });
  }

  function readGrid(inputs) {
    return inputs.map((inp) => {
      const v = inp.value.trim();
      if (v === '_' || v === '0') return 0;
      if (/^[1-8]$/.test(v)) return parseInt(v, 10);
      return NaN;
    });
  }

  function markInvalid(inputs, arr) {
    inputs.forEach((inp, i) => {
      const bad = Number.isNaN(arr[i]) || arr.indexOf(arr[i]) !== i;
      inp.classList.toggle('invalid', bad);
    });
  }

  function setMsg(html, kind) {
    const el = $('puzzleMsg');
    el.className = 'small mt-3 text-' + (kind || 'body-secondary');
    el.innerHTML = html;
  }

  /**
   * Read + validate both grids. On success stores them in the state
   * (discarding any previous result if something changed). Returns true/false.
   */
  function commitPuzzle() {
    const a = readGrid(initInputs);
    const b = readGrid(goalInputs);
    const ea = P.validate(a);
    const eb = P.validate(b);
    markInvalid(initInputs, a);
    markInvalid(goalInputs, b);
    if (ea || eb) {
      setMsg('<b>Invalid puzzle:</b> ' + esc(ea ? 'Initial state - ' + ea : 'Goal state - ' + eb), 'danger');
      return false;
    }
    const changed = P.keyOf(a) !== P.keyOf(S.initial) || P.keyOf(b) !== P.keyOf(S.goal);
    S.initial = a;
    S.goal = b;
    // UCS is fixed to the assignment's unit step cost; it is not user-selectable.
    S.costModel = 'unit';
    if (changed) invalidate();
    boardInit.set(S.initial);
    boardGoal.set(S.goal);
    window.PuzzleStore.save({ initial: S.initial, goal: S.goal, costModel: S.costModel });

    if (P.isSolvable(S.initial, S.goal)) {
      setMsg('&#10003; Puzzle accepted &mdash; the goal is reachable (solvable).', 'success');
    } else {
      setMsg(
        '&#9888; This puzzle is <b>not solvable</b> (inversion parity differs). UCS will report <i>Not Found</i>.',
        'warning'
      );
    }
    return true;
  }

  /** Forget the computed result (puzzle or cost model changed). */
  function invalidate() {
    pause();
    S.result = null;
    S.replay = null;
    S.phase = 'search';
    S.p = 0;
    S.revealed = false;
    $('summaryCard').classList.add('d-none');
    $('tabSolution').disabled = true;
    render();
  }

  /* ====================================================================
     Running the search
     ==================================================================== */
  function compute() {
    const res = window.UCS.run(S.initial, S.goal, { costModel: S.costModel });
    S.result = res;
    S.replay = res.trace ? new Replay(res) : null;
    S.phase = 'search';
    S.p = 0;
    S.revealed = false;
    $('tabSolution').disabled = !res.found;
    return res;
  }

  /** Compute on demand (used by Run / Next / Skip). Returns true when a replayable solution exists. */
  function ensureResult() {
    if (!commitPuzzle()) return false;
    if (!S.result) compute();
    if (!S.result.found) {
      showSummary();
      render();
      return false;
    }
    return true;
  }

  function onRun() {
    if (S.busy) return;
    if (!commitPuzzle()) return;
    pause();
    S.busy = true;
    $('stepLabel').textContent = 'Searching…';
    $('stepInfo').textContent = 'Running Uniform Cost Search';
    updateButtons();
    setTimeout(() => {
      if (!S.result) compute();
      S.busy = false;
      if (!S.result.found) {
        showSummary();
        render();
        return;
      }
      resetView(false);
      play();
    }, 30);
  }

  function resetView(redraw) {
    pause();
    S.phase = 'search';
    S.p = 0;
    S.revealed = false;
    if (S.result && S.result.trace) S.replay = new Replay(S.result);
    $('summaryCard').classList.add('d-none');
    if (redraw !== false) render();
  }

  /* ====================================================================
     Playback
     ==================================================================== */
  function setDur(ms) {
    boardCur.setDuration(ms);
  }

  function play() {
    if (S.playing) return;
    S.playing = true;
    lastT = performance.now();
    acc = 0;
    raf = requestAnimationFrame(tick);
    updateButtons();
  }

  function pause() {
    S.playing = false;
    cancelAnimationFrame(raf);
    updateButtons();
  }

  function tick(now) {
    if (!S.playing) return;
    const dt = Math.min(now - lastT, 100) / 1000;
    lastT = now;

    if (S.phase === 'search') {
      const rp = S.replay;
      const sps = SEARCH_SPEEDS[S.speedIdx];
      setDur(Math.min(300, 600 / sps));
      if (rp.k >= rp.total) {
        onSearchEnd(true);
      } else {
        acc += dt * sps;
        let n = Math.min(Math.floor(acc), 5000);
        if (n > 0) {
          acc -= Math.floor(acc);
          while (n-- > 0 && rp.forward()) { /* advance */ }
          renderSearch();
          if (rp.k >= rp.total) onSearchEnd(true);
        }
      }
    } else {
      const L = S.result.path.length - 1;
      const mps = PATH_SPEEDS[S.speedIdx];
      setDur(Math.min(450, 750 / mps));
      acc += dt * mps;
      const n = Math.floor(acc);
      if (n > 0) {
        acc -= n;
        S.p = Math.min(L, S.p + n);
        renderPath();
        if (S.p >= L) pause();
      }
    }
    if (S.playing) raf = requestAnimationFrame(tick);
  }

  function onSearchEnd(autoContinue) {
    showSummary();
    $('tabSolution').disabled = false;
    if (autoContinue) {
      if (S.result.path.length > 1) {
        S.phase = 'solution';
        S.p = 0;
        acc = 0;
        render();
      } else {
        pause();
        render();
      }
    }
  }

  function onNext() {
    pause();
    if (!ensureResult()) return;
    setDur(320);
    if (S.phase === 'search') {
      if (S.replay.k < S.replay.total) {
        S.replay.forward();
        renderSearch();
        if (S.replay.k >= S.replay.total) onSearchEnd(false);
      } else if (S.result.path.length > 1) {
        S.phase = 'solution';
        S.p = 0;
        render();
      }
    } else if (S.p < S.result.path.length - 1) {
      S.p++;
      renderPath();
    }
    updateButtons();
  }

  function onPrev() {
    pause();
    if (!S.result || !S.result.found) return;
    setDur(320);
    if (S.phase === 'search') {
      S.replay.backward();
      renderSearch();
    } else if (S.p > 0) {
      S.p--;
      renderPath();
    } else {
      S.phase = 'search';
      render();
    }
    updateButtons();
  }

  function onSkip() {
    pause();
    if (!ensureResult()) return;
    setDur(0);
    if (S.phase === 'search') {
      while (S.replay.forward()) { /* run to the end */ }
      renderSearch();
      onSearchEnd(false);
    } else {
      S.p = S.result.path.length - 1;
      renderPath();
    }
    updateButtons();
  }

  function setPhase(phase) {
    if (!S.result || !S.result.found) return;
    pause();
    if (phase === 'solution') {
      showSummary();
      S.phase = 'solution';
      S.p = Math.min(S.p, S.result.path.length - 1);
    } else {
      S.phase = 'search';
    }
    setDur(320);
    render();
  }

  /* ====================================================================
     Rendering
     ==================================================================== */
  function render() {
    if (!S.result || (S.result.found && !S.replay)) renderIdle();
    else if (!S.result.found) renderIdle();
    else if (S.phase === 'search') renderSearch();
    else renderPath();
    updateButtons();
  }

  function setStatus(text, kind) {
    $('statusVal').textContent = text;
    $('statusBox').className = 'stat text-center mb-2' + (kind ? ' ' + kind : '');
  }

  function setStats(gen, exp, fr, ex, depth, maxD) {
    $('sGen').textContent = fmt(gen);
    $('sExp').textContent = fmt(exp);
    $('sFr').textContent = fmt(fr);
    $('sEx').textContent = fmt(ex);
    $('sDepth').textContent = fmt(depth);
    $('sMax').textContent = fmt(maxD);
  }

  function renderIdle() {
    boardInit.set(S.initial);
    boardGoal.set(S.goal);
    boardCur.set(S.initial);
    $('stepLabel').textContent = 'Ready';
    $('statG').textContent = '0';
    $('tabSearch').classList.add('active');
    $('tabSolution').classList.remove('active');

    if (S.result && !S.result.found) {
      setStatus('Not found', 'bad');
      $('stepInfo').textContent = S.result.message;
    } else {
      setStatus('Idle', '');
      $('stepInfo').textContent = 'Press Run to start the search.';
    }
    setStats(1, 0, 1, 0, 0, 0);
    $('curMini').innerHTML = B.mini(S.initial, { cls: 'mini-lg' });
    $('curText').textContent = 'Initial state';
    $('curMeta').textContent = 'Not expanded yet';
    $('parMini').innerHTML = '';
    $('parText').textContent = '—';
    $('parMeta').textContent = '';
    $('succList').innerHTML = '<span class="small text-body-secondary">Nothing expanded yet.</span>';
    $('frontierList').innerHTML =
      '<div class="row-item first"><span class="rank">1</span>' + B.mini(S.initial) +
      '<div class="grow"><b>root</b> &middot; g = 0 &middot; depth = 0</div></div>';
    $('exploredList').innerHTML = '<div class="row-item text-body-secondary">Nothing explored yet.</div>';
  }

  function renderSearch() {
    const r = S.result;
    const rp = S.replay;
    const N = r.nodes;
    const T = r.trace;
    const k = rp.k;
    const id = k > 0 ? T.stepNode[k - 1] : 0;
    const isGoalStep = k > 0 && k - 1 === T.goalStep;
    const arr = P.arrOf(N.key[id]);
    const g = N.g[id];

    $('tabSearch').classList.add('active');
    $('tabSolution').classList.remove('active');

    boardCur.set(arr, { highlight: k > 0 ? N.tile[id] : null });
    $('stepLabel').textContent = 'Search step ' + fmt(k) + ' / ' + fmt(rp.total);
    $('statG').textContent = fmt(g);

    let info;
    if (k === 0) {
      info = 'Root node (initial state) placed in the frontier with g = 0.';
    } else if (isGoalStep) {
      info = 'Node #' + id + ' has the lowest cost in the frontier (g = ' + fmt(g) + ') and passes the goal test. Search stops.';
    } else {
      const c = N.parent[id] >= 0 ? g - N.g[N.parent[id]] : 0;
      info = 'Popped node #' + id + ' (lowest g = ' + fmt(g) + ').' +
        (N.dir[id] ? ' Reached by moving the blank ' + N.arrow[id] + ' ' + N.dir[id] + ' (tile ' + N.tile[id] + ', cost ' + c + ').' : '');
    }
    $('stepInfo').textContent = info;
    setStatus(k === 0 ? 'Start' : isGoalStep ? 'Goal reached ✓' : 'Searching', isGoalStep ? 'ok' : '');

    setStats(
      r.cumGenerated[k],
      rp.closed.length,
      rp.frontier.size,
      rp.closed.length,
      N.depth[id],
      r.cumMaxDepth[k]
    );

    // current + parent node
    $('curMini').innerHTML = B.mini(arr, { cls: 'mini-lg', highlight: k > 0 ? N.tile[id] : 0 });
    $('curText').textContent = (k === 0 ? 'Root' : 'Node') + ' #' + id;
    $('curMeta').textContent =
      'g(n) = ' + fmt(g) + '  ·  depth = ' + N.depth[id] + '  ·  f(n) = g(n) = ' + fmt(g);
    const pid = N.parent[id];
    if (pid >= 0) {
      $('parMini').innerHTML = B.mini(N.key[pid], { cls: 'mini-lg' });
      $('parText').textContent = (pid === 0 ? 'Root' : 'Node') + ' #' + pid;
      $('parMeta').textContent = 'g = ' + fmt(N.g[pid]) + '  ·  depth = ' + N.depth[pid];
    } else {
      $('parMini').innerHTML = '';
      $('parText').textContent = 'None (this is the root)';
      $('parMeta').textContent = '';
    }

    // generated successors of the node being expanded
    if (k > 0 && !isGoalStep) {
      let h = '';
      for (let j = T.stepSuccStart[k - 1]; j < T.stepSuccStart[k]; j++) {
        const st = STATUS_TEXT[T.sStatus[j]];
        h +=
          '<div class="succ ' + st.cls + '">' + B.mini(T.sKey[j], { highlight: T.sTile[j] }) +
          '<b>g = ' + fmt(T.sG[j]) + '</b>' +
          '<span>' + T.sArrow[j] + ' ' + T.sDir[j] + ' &middot; tile ' + T.sTile[j] + '</span>' +
          '<span class="badge ' + st.badge + ' text-wrap">' + st.label + '</span></div>';
      }
      $('succList').innerHTML = h;
    } else if (isGoalStep) {
      $('succList').innerHTML = '<span class="small text-body-secondary">Goal node &mdash; it is not expanded.</span>';
    } else {
      $('succList').innerHTML = '<span class="small text-body-secondary">Nothing expanded yet.</span>';
    }

    // frontier (top 10 by g)
    const top = topK(rp.frontier, N.g, 10);
    if (top.length === 0) {
      $('frontierList').innerHTML = '<div class="row-item text-body-secondary">Frontier is empty.</div>';
    } else {
      let h = '';
      top.forEach((nid, i) => {
        h +=
          '<div class="row-item' + (i === 0 ? ' first' : '') + '"><span class="rank">' + (i + 1) + '</span>' +
          B.mini(N.key[nid]) +
          '<div class="grow"><b>#' + nid + '</b> &middot; g = ' + fmt(N.g[nid]) + ' &middot; depth = ' + N.depth[nid] +
          (i === 0 ? '<div class="small text-body-secondary">next to be expanded</div>' : '') + '</div></div>';
      });
      if (rp.frontier.size > top.length) {
        h += '<div class="row-item text-body-secondary">+ ' + fmt(rp.frontier.size - top.length) + ' more nodes in the frontier</div>';
      }
      $('frontierList').innerHTML = h;
    }

    // explored (latest 10)
    const cl = rp.closed;
    if (cl.length === 0) {
      $('exploredList').innerHTML = '<div class="row-item text-body-secondary">Nothing explored yet.</div>';
    } else {
      let h = '';
      for (let i = cl.length - 1; i >= Math.max(0, cl.length - 10); i--) {
        const nid = cl[i];
        h +=
          '<div class="row-item"><span class="rank">' + (i + 1) + '</span>' + B.mini(N.key[nid]) +
          '<div class="grow"><b>#' + nid + '</b> &middot; g = ' + fmt(N.g[nid]) + ' &middot; depth = ' + N.depth[nid] + '</div></div>';
      }
      if (cl.length > 10) {
        h += '<div class="row-item text-body-secondary">+ ' + fmt(cl.length - 10) + ' earlier explored nodes</div>';
      }
      $('exploredList').innerHTML = h;
    }
  }

  function renderPath() {
    const r = S.result;
    const path = r.path;
    const L = path.length - 1;
    const item = path[S.p];

    $('tabSearch').classList.remove('active');
    $('tabSolution').classList.add('active');

    boardCur.set(P.arrOf(item.key), { highlight: S.p > 0 ? item.tile : null });
    $('stepLabel').textContent = 'Solution step ' + S.p + ' / ' + L;
    $('statG').textContent = fmt(item.g);
    if (S.p === 0) {
      $('stepInfo').textContent = 'Initial state - the solution path starts here.';
    } else {
      $('stepInfo').textContent =
        'Blank moves ' + item.arrow + ' ' + item.dir + ' (tile ' + item.tile + ' slides into the gap) · step cost ' +
        item.cost + ' · g = ' + fmt(item.g);
    }
    setStatus(S.p === L ? 'Goal reached ✓' : 'Following path', S.p === L ? 'ok' : '');

    document.querySelectorAll('#pathStrip .path-item').forEach((el) => {
      el.classList.toggle('active', Number(el.dataset.i) === S.p);
    });
  }

  function showSummary() {
    const r = S.result;
    const card = $('summaryCard');
    card.classList.remove('d-none');
    const st = r.stats;
    const msg = $('summaryMsg');

    if (r.found) {
      msg.className = 'alert alert-success py-2 mb-3';
      msg.innerHTML = '<b>Solution Found.</b> ' + esc(r.message);
    } else {
      msg.className = 'alert alert-danger py-2 mb-3';
      msg.innerHTML = '<b>Solution Not Found.</b> ' + esc(r.message);
    }

    const tile = (lbl, val, cls) =>
      '<div class="col-6 col-md-4 col-xl-3"><div class="stat ' + (cls || '') + '"><div class="lbl">' + lbl +
      '</div><div class="val">' + val + '</div></div></div>';
    const na = '&mdash;';
    $('summaryGrid').innerHTML =
      tile('Solution', r.found ? 'Found' : 'Not found', r.found ? 'ok' : 'bad') +
      tile('Total moves', r.found ? fmt(st.moves) : na) +
      tile('Total nodes generated', r.found ? fmt(st.generated) : na) +
      tile('Total nodes expanded', r.found ? fmt(st.expanded) : na) +
      tile('Maximum search depth', r.found ? fmt(st.maxDepth) : na) +
      tile('Execution time', r.found ? st.timeMs.toFixed(2) + ' ms' : na) +
      tile('Path cost', r.found ? fmt(st.pathCost) : na) +
      tile('Memory usage (approx.)', r.found ? P.formatBytes(st.memoryBytes) + ' <span class="fs-6 fw-normal text-body-secondary">(' + fmt(st.peakNodes) + ' nodes)</span>' : na) +
      tile('Step cost', 'Unit cost (1 per move)');

    // solution path strip (built once per result)
    const strip = $('pathStrip');
    if (r.found) {
      $('pathWrap').classList.remove('d-none');
      if (strip.dataset.built !== String(r.goalId) + '|' + r.costModel + '|' + P.keyOf(r.initial) + '|' + P.keyOf(r.goal)) {
        let h = '';
        r.path.forEach((it, i) => {
          if (i > 0) h += '<span class="path-arrow">&rarr;</span>';
          h +=
            '<div class="path-item" data-i="' + i + '" role="button" tabindex="0"><span class="fw-semibold">Step ' + i + '</span>' +
            B.mini(it.key, { highlight: i > 0 ? it.tile : 0 }) +
            '<span class="text-body-secondary">' + (i === 0 ? 'start' : it.arrow + ' tile ' + it.tile) + '</span></div>';
        });
        strip.innerHTML = h;
        strip.dataset.built = String(r.goalId) + '|' + r.costModel + '|' + P.keyOf(r.initial) + '|' + P.keyOf(r.goal);
      }
    } else {
      $('pathWrap').classList.add('d-none');
    }
    S.revealed = true;
  }

  function updateButtons() {
    const has = !!S.result && S.result.found;
    const L = has ? S.result.path.length - 1 : 0;
    const solEnd = S.phase === 'solution' && S.p >= L;
    $('btnRun').disabled = S.busy;
    $('btnPause').disabled = !S.playing;
    $('btnResume').disabled = S.playing || !has || solEnd;
    $('btnPrev').disabled =
      S.busy || !has || (S.phase === 'search' && S.replay && S.replay.k === 0);
    $('btnNext').disabled = S.busy;
    $('btnSkip').disabled = S.busy;
    $('btnReset').disabled = S.busy;
  }

  function updateSpeedLabel() {
    $('speedLabel').textContent =
      SEARCH_SPEEDS[S.speedIdx] + ' steps/s · ' + PATH_SPEEDS[S.speedIdx] + ' moves/s';
  }

  /* ====================================================================
     Wiring
     ==================================================================== */
  function loadPuzzle(initial, goal) {
    setGrid(initInputs, initial);
    setGrid(goalInputs, goal);
    commitPuzzle();
    render();
  }

  function init() {
    boardInit = new B($('boardInit'), { size: 'sm' });
    boardGoal = new B($('boardGoal'), { size: 'sm' });
    boardCur = new B($('boardCur'), { size: 'lg' });
    boardInit.setDuration(0);
    boardGoal.setDuration(0);
    initInputs = buildGrid($('initGrid'), 'Initial state');
    goalInputs = buildGrid($('goalGrid'), 'Goal state');

    // restore the last puzzle used (so the comparison page and a refresh stay in sync)
    const saved = window.PuzzleStore.load();
    if (saved && !P.validate(saved.initial) && !P.validate(saved.goal)) {
      S.initial = saved.initial.slice();
      S.goal = saved.goal.slice();
      S.costModel = 'unit';
    }
    setGrid(initInputs, S.initial);
    setGrid(goalInputs, S.goal);
    boardInit.set(S.initial);
    boardGoal.set(S.goal);

    $('speed').value = String(S.speedIdx + 1);
    updateSpeedLabel();

    $('btnApply').addEventListener('click', () => {
      if (commitPuzzle()) render();
    });
    $('btnExample').addEventListener('click', () => loadPuzzle(P.EXAMPLE_INITIAL, P.EXAMPLE_GOAL));
    $('btnRandom').addEventListener('click', () => {
      let goal = readGrid(goalInputs);
      if (P.validate(goal)) goal = S.goal;
      const start = P.randomPuzzle(goal, $('difficulty').value);
      setGrid(goalInputs, goal);
      loadPuzzle(start, goal);
    });
    $('btnRun').addEventListener('click', onRun);
    $('btnPause').addEventListener('click', pause);
    $('btnResume').addEventListener('click', () => {
      if (S.result && S.result.found) play();
    });
    $('btnNext').addEventListener('click', onNext);
    $('btnPrev').addEventListener('click', onPrev);
    $('btnSkip').addEventListener('click', onSkip);
    $('btnReset').addEventListener('click', () => {
      if (!S.result) {
        commitPuzzle();
        render();
      } else {
        resetView(true);
      }
    });
    $('speed').addEventListener('input', (e) => {
      S.speedIdx = Number(e.target.value) - 1;
      updateSpeedLabel();
    });
    $('tabSearch').addEventListener('click', () => setPhase('search'));
    $('tabSolution').addEventListener('click', () => setPhase('solution'));

    const jump = (el) => {
      const item = el.closest('.path-item');
      if (!item || !S.result || !S.result.found) return;
      pause();
      S.phase = 'solution';
      S.p = Number(item.dataset.i);
      setDur(320);
      render();
    };
    $('pathStrip').addEventListener('click', (e) => jump(e.target));
    $('pathStrip').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        jump(e.target);
      }
    });

    commitPuzzle();
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
