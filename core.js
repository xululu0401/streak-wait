/* 等连串 · 计算核心（core.js）
 * 问题：一件事每次发生的概率是 p，每次相互独立。试 n 次，至少碰到一次「连续 k 次都发生」的可能性有多大？
 *       平均要试多少次才第一次碰到？试多少次才有五成 / 九成 / 九十九成把握碰到？
 * 两种问法：
 *   one（指定那个结果连续 k 次）：比如「硬币正面连续 10 次」「骰子连续 3 个六」。
 *   any（随便哪个结果、只要同一个连续 k 次）：m 种结果等可能，比如「π 里同一个数字连着出现 6 次」。
 *     换算：从第 2 次起，「这次和上次一样」的概率是 1/m；同一个结果连续 k 次 ⇔ 「和上次一样」连续 k−1 次。
 *     所以 any(m, k, n) = one(p = 1/m, k − 1, n − 1)，平均等待再加上第 1 次。
 * 算法（one）：b_i = 前 i 次里已经出现过连续 k 次的概率。
 *   i < k：b_i = 0；i = k：b_i = p^k；
 *   i > k：b_i = b_{i−1} + (1 − b_{i−k−1}) · q · p^k   （第一次凑齐恰好落在第 i 次：第 i−k 次没发生、之后 k 次都发生、再之前没凑齐过）
 *   用长度 k+2 的环形数组逐次推，O(n) 时间、O(k) 内存。
 *   平均等待（闭式）：E = (1 − p^k) / (q · p^k)；只用对数算，k 再大也不会溢出。
 *   平均出现几段（每段至少 k 次的最长连串，按「段」数，不重叠）：μ = p^k · (1 + (n − k) · q)，n ≥ k。
 *   k ≤ n ≤ 2k 时 P = p^k · (1 + (n − k) · q) 是精确值（放不下两段）。n > 2k 且这个值 μ < 1e-12 时不逐次递推，直接取 P ≈ μ
 *   （μ 是平均段数，P ≤ μ，且 P ≥ μ − μ²/2 量级，相对误差 < 1e-12）。
 * 只算「每次独立、概率不变」的模型；真实世界里手感、作弊、机器偏差都不在模型里。纯计算，不碰 DOM。 */
(function (root) {
  'use strict';

  var N_MAX = 2000000, K_MAX = 1000000, M_MAX = 1000000, LABEL_MAX = 20;
  var TINY = 1e-12;
  var MODES = { one: '指定那个结果连续 k 次', any: '随便哪个结果，只要同一个连续 k 次' };

  var BASE = { mode: 'one', prob: '50%', m: '10', k: '10', n: '1000', label: '硬币正面' };
  function clone(s) { return JSON.parse(JSON.stringify(s)); }
  var PRESETS = [
    { key: 'coin', name: '硬币连续 10 次正面（虚构）', note: '虚构示例：抛 1000 次硬币，正面朝上的概率当成 50%，问能不能碰到连续 10 次正面。', state: BASE },
    { key: 'dice', name: '骰子连续 3 个六（虚构）', note: '虚构示例：掷 100 次骰子，问能不能碰到连着 3 次都是六点。', state: { mode: 'one', prob: '1/6', m: '6', k: '3', n: '100', label: '掷出六点' } },
    { key: 'shot', name: '投篮连中 5 个（虚构）', note: '虚构示例：命中率 45%，一场练 100 个球，有多大可能连中 5 个。命中率是编的。', state: { mode: 'one', prob: '45%', m: '10', k: '5', n: '100', label: '投中' } },
    { key: 'pi6', name: 'π 里同一个数字连 6 次', note: '把 π 小数点后的数字当成 10 种等可能、互不相关（这一点数学上没有被证明），看前 100 万位里出现「同一个数字连着 6 次」的可能性。下面有真实的 π 前 100 万位可以对照。', state: { mode: 'any', prob: '10%', m: '10', k: '6', n: '1000000', label: 'π 的小数位' } },
    { key: 'pizero', name: 'π 里 100 万个 0 连着', note: '热榜上问：圆周率里可能有 100 万个连续的 0 吗？这里按「每位是 0 的概率 1/10、互不相关」算平均要等多少位。这不能回答「有没有」（那是没解决的数学问题），只能说明「要等多远」。', state: { mode: 'one', prob: '1/10', m: '10', k: '1000000', n: '1000000', label: '数字 0' } }
  ];
  function defaultState() { return clone(BASE); }
  function stateFromPreset(key) { for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].key === key) return clone(PRESETS[i].state); return defaultState(); }
  function presetKey(state) {
    var t = JSON.stringify(state);
    for (var i = 0; i < PRESETS.length; i++) if (JSON.stringify(PRESETS[i].state) === t) return PRESETS[i].key;
    return null;
  }

  /* ── 输入解析 ── 概率接受 50% / 0.5 / 1/6 三种写法 */
  function parseProb(t) {
    var s = String(t == null ? '' : t).replace(/\s+/g, '').replace(/％/g, '%').replace(/／/g, '/');
    var m, v = NaN;
    if (!s) return { ok: false, msg: '先填每次发生的概率（可以写 50%、0.5 或 1/6）' };
    if ((m = /^(\d+(?:\.\d+)?)%$/.exec(s))) v = parseFloat(m[1]) / 100;
    else if ((m = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(s))) v = parseFloat(m[2]) > 0 ? parseFloat(m[1]) / parseFloat(m[2]) : NaN;
    else if (/^\d+(?:\.\d+)?$/.test(s)) v = parseFloat(s);
    else return { ok: false, msg: '概率看不懂：「' + String(t).slice(0, 20) + '」，请写成 50%、0.5 或 1/6' };
    if (!isFinite(v)) return { ok: false, msg: '概率的分母不能是 0' };
    if (v <= 0) return { ok: false, msg: '概率是 0 的话永远碰不到，请填大于 0 的数' };
    if (v >= 1) return { ok: false, msg: '概率是 100%（或更大）的话每次都发生，不用算；请填小于 100% 的数' };
    if (v < 1e-6 || v > 1 - 1e-6) return { ok: false, msg: '概率请在 0.0001% 到 99.9999% 之间' };
    return { ok: true, p: v };
  }
  function parseInt10(t, lo, hi, name, field) {
    var s = String(t == null ? '' : t).replace(/[\s,，]/g, '');
    if (!s) return { ok: false, e: { field: field, message: '先填' + name } };
    if (!/^\d+$/.test(s)) return { ok: false, e: { field: field, message: name + '要填整数：「' + String(t).slice(0, 20) + '」' } };
    var v = parseInt(s, 10);
    if (v < lo || v > hi) return { ok: false, e: { field: field, message: name + '请在 ' + fmtInt(lo) + ' 到 ' + fmtInt(hi) + ' 之间（现在是 ' + fmtInt(v) + '）' } };
    return { ok: true, v: v };
  }
  function validate(s) {
    var errors = [], v = {};
    s = s || {};
    v.mode = s.mode === 'any' ? 'any' : (s.mode === 'one' ? 'one' : null);
    if (!v.mode) errors.push({ field: 'mode', message: '先选是「指定那个结果」还是「随便哪个结果」' });
    v.label = String(s.label == null ? '' : s.label).trim();
    if (v.label.length > LABEL_MAX) errors.push({ field: 'label', message: '这件事的名字超过 ' + LABEL_MAX + ' 个字了，短一点' });
    if (v.mode === 'any') {
      var mm = parseInt10(s.m, 2, M_MAX, '一共有几种等可能的结果', 'm');
      if (mm.ok) { v.m = mm.v; v.p = 1 / mm.v; } else errors.push(mm.e);
    } else {
      var pp = parseProb(s.prob);
      if (pp.ok) v.p = pp.p; else errors.push({ field: 'prob', message: pp.msg });
    }
    var kk = parseInt10(s.k, 1, K_MAX, '连续几次', 'k');
    if (kk.ok) v.k = kk.v; else errors.push(kk.e);
    var nn = parseInt10(s.n, 1, N_MAX, '一共试几次', 'n');
    if (nn.ok) v.n = nn.v; else errors.push(nn.e);
    return { ok: !errors.length, v: v, errors: errors };
  }

  /* ── 「one」模型的底层计算（p, k ≥ 0, n ≥ 0） ── */
  var LN10 = Math.LN10;
  function log10Pk(p, k) { return k * Math.log10(p); }
  /* 平均等待 E = (1 − p^k)/(q p^k)，返回 log10E（k = 0 时 E = 0，返回 null） */
  function waitLog10(p, k) {
    if (k === 0) return null;
    var lpk = log10Pk(p, k);
    var one = lpk > -300 ? Math.log10(1 - Math.pow(10, lpk)) : 0;
    return one - lpk - Math.log10(1 - p);
  }
  /* 逐次递推。返回 { P: b_n, logA: ln(1 − b_n)（a_n 另行按对数推，接近 1 时也不丢精度）,
   *   q: { 0.5: 最小 n, 0.9: …, 0.99: … }（只找 ≤ upto 的），aLast, aPrev（upto 处的 a，用于外推） } */
  function run(p, k, n, upto, wantQ) {
    var q = 1 - p, pk = Math.pow(p, k), c = q * pk, M = k + 2;
    var b = new Float64Array(M), a = new Float64Array(M), ls = 0, P = 0, logA = 0, found = {}, T = [0.5, 0.9, 0.99], ti = 0;
    var last = Math.max(n, wantQ ? upto : 0), aPrev = 1, aLast = 1, lsPrev = 0;
    for (var i = 0; i <= last; i++) {
      var bi, ai;
      if (i < k) { bi = 0; ai = 1; }
      else if (i === k) { bi = pk; ai = 1 - pk; }
      else {
        var j = (i - k - 1) % M;
        bi = b[(i - 1) % M] + c * (1 - b[j]);
        ai = a[(i - 1) % M] - c * a[j];
      }
      if (bi > 1) bi = 1;
      b[i % M] = bi; a[i % M] = ai;
      if (ai < 1e-250 && ai > 0) { for (var r = 0; r < M; r++) a[r] *= 1e250; ls -= 250 * LN10; }
      if (wantQ) while (ti < T.length && bi >= T[ti]) { found[T[ti]] = i; ti++; }
      if (i === n) { P = bi; logA = Math.log(a[i % M]) + ls; }
      if (i === last - 1) { aPrev = a[i % M]; lsPrev = ls; }
      if (i === last) { aLast = a[i % M]; }
      if (!wantQ && i >= n) break;
      if (wantQ && i >= n && ti >= T.length) break;
    }
    return { P: P, logA: logA, found: found, reachedAll: ti >= T.length, aRatio: last > k + 1 ? (aLast * Math.exp(ls - lsPrev)) / aPrev : null, logALast: Math.log(aLast) + ls, last: last };
  }
  /* P ≥ 0.5 时 1 − P 可能小到 10^−600，标量递推 a_i = a_{i−1} − c·a_{i−k−1} 会相减抵消（p = 0.9、k = 3 实测出负数），
   * 所以这时 1 − P 用生成函数的主极点（Feller《概率论及其应用》第一卷 XIII.7 的同一条思路）：
   *   没凑齐的概率 a_n 的生成函数 = (1 − p^k s^k) / f(s)，f(s) = 1 − s + q p^k s^{k+1}；
   *   f 在 (1, ∞) 里除了「假根」1/p 还有一个真根 x，a_n ≈ −N(x) / (x f'(x)) · x^{−n}。
   * 直接解 f 在 p = k/(k+1) 附近两根重合、数值很差（第一版就栽在这：p = 1/2、k = 1 时取到 NaN，离这一点 1e-5 时误差 2e-5）。
   * 换元 u = p·x 后把假根约掉：f = 0 ⇔ h(u) = q·(1 + u + … + u^k) − 1 = 0，h 单调递增，只有一个根；
   * 再用 h(u) = 0 把 f'(x) 改写成 q·Σ_j u^j·(u^{k−j} − 1)，每一项同号，不会相减抵消：
   *   a_n ≈ (u^k − 1) / (x · q · Σ_{j=0}^{k−1} u^j·expm1((k−j)·t)) · x^{−n}，t = ln u，ln x = t − ln p。
   * t 恰好为 0（p = k/(k+1)）时取极限：a_n ≈ 2 p^{n+1} / ((k+1) q)。 */
  function fellerT(p, k) {
    var q = 1 - p, K = k + 1;
    function h(t) { return t === 0 ? q * K - 1 : q * Math.expm1(K * t) / Math.expm1(t) - 1; }
    var lo = Math.log(p), hi = -Math.log(q) / k;  /* x > 1 ⇒ t > ln p；h(t) ≥ q·u^k − 1 ⇒ t ≤ −ln q / k */
    if (h(lo) >= 0) return lo;
    for (var it = 0; it < 300; it++) { var mid = (lo + hi) / 2; if (mid === lo || mid === hi) break; if (h(mid) < 0) lo = mid; else hi = mid; }
    return h(lo) === 0 ? lo : (Math.abs(h(lo)) < Math.abs(h(hi)) ? lo : hi);
  }
  function logTailFeller(p, k, n) {
    var q = 1 - p, t = fellerT(p, k), lx = t - Math.log(p);
    if (t === 0) return Math.log(2) + (n + 1) * Math.log(p) - Math.log((k + 1) * q);
    /* x 接近 1 时 lx = t − ln p 是两个约 −2.3 的数相减，只剩约 1e-10 的相对精度（浏览器验收时 Chrome 与 Node 在第 11 位分叉才发现）。
     * 离退化点够远（|t| > 1e-3）时，再在 ln x 上对原方程 −expm1(lx) + c·e^{(k+1)·lx} = 0 做两步牛顿，把 lx 的相对精度拉回到末位。 */
    if (Math.abs(t) > 1e-3) {
      var lc = Math.log(q) + k * Math.log(p), K = k + 1;
      for (var it = 0; it < 3; it++) {
        var e = Math.exp(lc + K * lx), g = -Math.expm1(lx) + e, gp = -Math.exp(lx) + K * e;
        var nl = lx - g / gp; if (!(nl > 0)) break; lx = nl;
      }
      t = lx + Math.log(p);
    }
    var den = 0;
    for (var j = 0; j < k; j++) den += Math.exp(j * t) * Math.expm1((k - j) * t);
    return Math.log(Math.expm1(k * t) / (q * den)) - lx - n * lx;
  }
  /* 至少一次的概率：返回 { P, log10P, log10Q(=log10(1−P)), exact: true/false } */
  function probAtLeast(p, k, n) {
    if (k === 0) return { P: 1, log10P: 0, log10Q: -Infinity, exact: true, how: 'k=0' };
    if (n < k) return { P: 0, log10P: -Infinity, log10Q: 0, exact: true, how: 'n<k' };
    var q = 1 - p, l = log10Pk(p, k) + Math.log10(1 + (n - k) * q);
    if (n <= 2 * k) {
      var P0 = Math.pow(10, l);
      return { P: P0, log10P: l, log10Q: P0 < 1 ? Math.log10(1 - P0) : -Infinity, exact: true, how: 'closed' };
    }
    if (l < Math.log10(TINY)) {
      var P1 = Math.pow(10, l);
      return { P: P1, log10P: l, log10Q: Math.log10(1 - P1), exact: false, how: 'tiny' };
    }
    var R = run(p, k, n, n, false);
    var lq = R.P < 0.5 ? Math.log10(1 - R.P) : logTailFeller(p, k, n) / LN10;
    return { P: R.P, log10P: R.P > 0 ? Math.log10(R.P) : -Infinity, log10Q: lq, exact: true, how: 'dp' };
  }
  /* 有 t 把握要试几次（最小 n）。upto 以内逐次找到的是精确值；找不到就外推。 */
  function quantiles(p, k) {
    var T = [0.5, 0.9, 0.99], out = {};
    if (k === 0) { T.forEach(function (t) { out[t] = { n: 0, how: 'exact' }; }); return out; }
    var q = 1 - p, lc = Math.log10(q) + log10Pk(p, k);
    if (lc + Math.log10(N_MAX) < Math.log10(TINY)) {
      /* 每次「凑齐」都极罕见：等待次数几乎是平均为 E 的指数分布 */
      var lE = waitLog10(p, k);
      T.forEach(function (t) { out[t] = { log10n: lE + Math.log10(-Math.log(1 - t)), how: 'approx' }; });
      return out;
    }
    var R = run(p, k, 0, N_MAX, true);
    T.forEach(function (t) {
      if (R.found[t] != null) out[t] = { n: R.found[t], how: 'exact' };
      else {
        /* 尾部按几何级数外推：a_{N+j} ≈ a_N · r^j */
        var r = R.aRatio, la = R.logALast;
        var j = Math.ceil((Math.log(1 - t) - la) / Math.log(r));
        out[t] = { log10n: Math.log10(R.last + Math.max(j, 1)), how: 'extrap' };
      }
    });
    return out;
  }
  function meanRuns(p, k, n) {
    if (n < k) return 0;
    if (k === 0) return 1 + n * (1 - p); /* 只在 any 模式 k=1 时用到，那里 n 已减 1 */
    return Math.pow(10, log10Pk(p, k)) * (1 + (n - k) * (1 - p));
  }

  /* 把用户的问法换成「one」模型的参数 */
  function eff(v) {
    if (v.mode === 'any') return { p: v.p, k: v.k - 1, n: v.n - 1, shift: 1 };
    return { p: v.p, k: v.k, n: v.n, shift: 0 };
  }
  /* 对外：同一套输入算出所有读数 */
  function core(v) {
    var e = eff(v);
    var pr = probAtLeast(e.p, e.k, e.n);
    var lE = waitLog10(e.p, e.k);
    var waitL = e.k === 0 ? 0 : (lE < 15 ? Math.log10(Math.pow(10, lE) + e.shift) : lE);
    var qs = quantiles(e.p, e.k);
    Object.keys(qs).forEach(function (t) { if (qs[t].n != null) qs[t].n += e.shift; else if (e.shift && qs[t].log10n < 15) qs[t].log10n = Math.log10(Math.pow(10, qs[t].log10n) + e.shift); });
    var muL = e.n < e.k ? null : (e.k === 0 ? Math.log10(1 + e.n * (1 - e.p)) : log10Pk(e.p, e.k) + Math.log10(1 + (e.n - e.k) * (1 - e.p)));
    return { P: pr, waitLog10: waitL, quant: qs, mu: meanRuns(e.p, e.k, e.n), muLog10: muL, eff: e };
  }

  /* 最长连串分布：n 次里最长那串 ≥ j 的概率，j 取 k 附近 */
  function longestTable(v) {
    var rows = [], lo = Math.max(1, v.k - 2), hi = Math.min(v.n, v.k + 2);
    for (var j = lo; j <= hi; j++) {
      var e = eff({ mode: v.mode, p: v.p, k: j, n: v.n });
      rows.push({ j: j, P: probAtLeast(e.p, e.k, e.n) });
    }
    return rows;
  }

  function compute(state) {
    var val = validate(state);
    if (!val.ok) return { ok: false, errors: val.errors, v: val.v };
    var v = val.v, r = core(v), warnings = [];
    if (v.k > v.n) warnings.push({ code: 'k_gt_n', message: '连续 ' + fmtInt(v.k) + ' 次比一共试的 ' + fmtInt(v.n) + ' 次还多，这 ' + fmtInt(v.n) + ' 次里不可能碰到；看下面「平均要等多少次」。' });
    if (r.P.how === 'tiny') warnings.push({ code: 'tiny', message: '可能性极小（平均段数不到一万亿分之一），这里没有逐次推算，直接用平均段数 p^k ×（1 +（n − k）× q）当可能性，相对误差小于一万亿分之一。' });
    if (v.mode === 'any' && v.k === 1) warnings.push({ code: 'k1', message: '「同一个结果连续 1 次」每次都满足，没有意义；试试 2 次以上。' });
    ['0.5', '0.9', '0.99'].forEach(function (t) { var x = r.quant[t]; if (x.how !== 'exact') x.note = x.how === 'approx' ? '按平均等待估算（每次凑齐都极罕见时，等待次数近似指数分布）' : '超过 ' + fmtInt(N_MAX) + ' 次，按尾部几何级数外推'; });
    return {
      ok: true, v: v, r: r, longest: longestTable(v), actions: actions(v, r), warnings: warnings,
      headline: headline(v, r)
    };
  }

  function headline(v, r) {
    var who = v.mode === 'any' ? '同一个结果' : (v.label || '这件事');
    return (v.mode === 'any' && v.label ? v.label + '：' : '') + '试 ' + fmtInt(v.n) + ' 次，碰到「' + who + (/[0-9A-Za-z]$/.test(who) ? ' ' : '') + '连续 ' + fmtInt(v.k) + ' 次」的可能性是 ' + probText(r.P);
  }

  /* ── 改法：每条只改一项，给出改完的读数 ── */
  function actions(v, r) {
    var list = [];
    function after(nv) { return core(nv); }
    if (v.k > 1 && !(v.mode === 'any' && v.k === 2)) {
      var a1 = Object.assign({}, v, { k: v.k - 1 }), o1 = after(a1);
      list.push({ kind: 'k_minus', text: '少要一次：连续 ' + fmtInt(v.k - 1) + ' 次', patch: { k: String(v.k - 1) }, P: o1.P });
    }
    if (v.k < Math.min(K_MAX, v.n)) {
      var a2 = Object.assign({}, v, { k: v.k + 1 }), o2 = after(a2);
      list.push({ kind: 'k_plus', text: '多要一次：连续 ' + fmtInt(v.k + 1) + ' 次', patch: { k: String(v.k + 1) }, P: o2.P });
    }
    var q9 = r.quant['0.9'];
    if (q9.how === 'exact' && q9.n !== v.n && q9.n <= N_MAX && q9.n >= 1) {
      var a3 = Object.assign({}, v, { n: q9.n }), o3 = after(a3);
      list.push({ kind: 'n_90', text: '试的次数改成 ' + fmtInt(q9.n) + '（刚好够九成把握）', patch: { n: String(q9.n) }, P: o3.P });
    }
    if (v.n * 2 <= N_MAX) {
      var a4 = Object.assign({}, v, { n: v.n * 2 }), o4 = after(a4);
      list.push({ kind: 'n_x2', text: '试的次数翻倍：' + fmtInt(v.n * 2) + ' 次', patch: { n: String(v.n * 2) }, P: o4.P });
    }
    if (v.mode === 'one') {
      var m = Math.round(1 / v.p);
      if (m >= 2 && m <= M_MAX && Math.abs(1 / m - v.p) < 1e-12 && v.k >= 2) {
        var a5 = { mode: 'any', p: 1 / m, m: m, k: v.k, n: v.n, label: v.label }, o5 = after(a5);
        list.push({ kind: 'to_any', text: '不指定哪一个：' + m + ' 种结果里随便哪个连续 ' + fmtInt(v.k) + ' 次', patch: { mode: 'any', m: String(m) }, P: o5.P });
      }
    } else {
      var a6 = Object.assign({}, v, { mode: 'one' }), o6 = after(a6);
      list.push({ kind: 'to_one', text: '只认其中一个结果（概率 1/' + v.m + '）连续 ' + fmtInt(v.k) + ' 次', patch: { mode: 'one', prob: '1/' + v.m }, P: o6.P });
    }
    list.forEach(function (a) { a.deltaLog10 = (a.P.log10P === -Infinity || r.P.log10P === -Infinity) ? null : a.P.log10P - r.P.log10P; });
    return list;
  }
  function applyAction(state, a) { var s = clone(state); Object.keys(a.patch).forEach(function (k) { s[k] = a.patch[k]; }); return s; }

  /* ── π 前 100 万位（本地用 Chudnovsky 公式算出，见 evidence/pi计算.py）里的连串统计 ──
   * first[k−1] = 「某个数字连着出现 k 次」第一次出现时的起始位置（小数点后第几位，从 1 数） */
  var PI = {
    digits: 1000000,
    any: [1, 24, 153, 762, 762, 762, 710100],
    anyDigit: ['1', '3', '1', '9', '9', '9', '3'],
    /* anyCount[k−1] = 前 100 万位里「同一个数字连着 ≥ k 次」的段数（每段按最长那串计 1 次） */
    anyCount: [899928, 90152, 8896, 920, 90, 13, 1, 0],
    per: { '0': { L: 5, first: [32, 307, 601, 13390, 17534] }, '1': { L: 6, first: [1, 94, 153, 12700, 32788, 255945] }, '2': { L: 6, first: [6, 135, 1735, 4902, 65260, 963024] }, '3': { L: 7, first: [9, 24, 1698, 28467, 28467, 710100, 710100] }, '4': { L: 6, first: [2, 59, 2707, 54525, 808650, 828499] }, '5': { L: 6, first: [4, 130, 177, 24466, 24466, 244453] }, '6': { L: 6, first: [7, 117, 2440, 21880, 48439, 252499] }, '7': { L: 6, first: [13, 559, 1589, 1589, 162248, 399579] }, '8': { L: 6, first: [11, 34, 4751, 4751, 213245, 222299] }, '9': { L: 6, first: [5, 44, 762, 762, 762, 762] } }
  };
  /* 对照表：k = 2…7，「任意数字连 k 次」第一次凑齐在第几位（结束位置）vs 模型平均要等几位、前 100 万位里碰到的可能性 */
  function piTable() {
    var rows = [];
    for (var k = 2; k <= 8; k++) {
      var st = PI.any[k - 1], m = core({ mode: 'any', p: 0.1, m: 10, k: k, n: PI.digits });
      rows.push({ k: k, start: st || null, end: st ? st + k - 1 : null, digit: st ? PI.anyDigit[k - 1] : null, count: PI.anyCount[k - 1], waitLog10: m.waitLog10, P: m.P, muLog10: m.muLog10 });
    }
    return rows;
  }

  /* ── 文本 ── */
  function fmtInt(x) { return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  var SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
  function sup(n) { return String(n).split('').map(function (c) { return SUP[c] || c; }).join(''); }
  /* 10 的 e 次方：|e| < 1000 用上标；更大时上标里要加千分位逗号，而 Unicode 没有上标逗号（结果卡目检时发现大小不一），改写成文字 */
  function pow10(e) { return Math.abs(e) < 1000 ? '10' + sup(e) : '10 的 ' + (e < 0 ? '−' : '') + fmtInt(Math.abs(e)) + ' 次方'; }
  /* 用 log10 表示一个正数：小的直接写，大的写成 a × 10^b */
  function bigText(l10, digitsSmall) {
    if (l10 == null) return '0';
    if (l10 < 9) { var x = Math.pow(10, l10); return x < 100 ? (Math.round(x * 100) / 100).toFixed(x < 10 ? 2 : 1).replace(/\.?0+$/, '') : fmtInt(x); }
    var e = Math.floor(l10), mnt = Math.pow(10, l10 - e);
    if (mnt >= 9.995) { mnt = 1; e++; }
    if (l10 < 12) return Math.pow(10, l10 - 8).toFixed(2) + ' 亿';
    return mnt.toFixed(2) + ' × ' + pow10(e);
  }
  function countText(l10) { return l10 == null ? '0 次' : (l10 < 9 ? fmtInt(Math.ceil(Math.pow(10, l10) - 1e-9)) : bigText(l10)) + ' 次'; }
  function waitText(l10) { return l10 == null ? '0 次' : (l10 < 3 ? (Math.round(Math.pow(10, l10) * 10) / 10).toFixed(1).replace(/\.0$/, '') : bigText(l10)) + ' 次'; }
  function muText(l10) { if (l10 == null) return '0'; if (l10 < -4) { var e = Math.floor(l10), m = Math.pow(10, l10 - e); if (m >= 9.995) { m = 1; e++; } return m.toFixed(2) + ' × ' + pow10(e); } if (l10 < 9) { var x = +Math.pow(10, l10).toPrecision(4); return x >= 1000 ? fmtInt(x) : String(x); } return bigText(l10); }
  function probText(P) {
    if (P.P === 0 && P.log10P === -Infinity) return '0';
    if (P.P >= 1 && P.log10Q === -Infinity) return '100%';
    if (P.log10P < -4) { var e = Math.floor(P.log10P), mnt = Math.pow(10, P.log10P - e); if (mnt >= 9.995) { mnt = 1; e++; } return mnt.toFixed(2) + ' × ' + pow10(e); }
    if (P.log10Q < -4) { var e2 = Math.floor(P.log10Q), m2 = Math.pow(10, P.log10Q - e2); if (m2 >= 9.995) { m2 = 1; e2++; } return '只差 ' + m2.toFixed(2) + ' × ' + pow10(e2) + ' 就是 100%'; }
    return (P.P * 100).toFixed(2) + '%';
  }
  function probShort(P) {
    if (P.P === 0 && P.log10P === -Infinity) return '0';
    if (P.log10P < -4) return '约 ' + pow10(Math.round(P.log10P));
    if (P.log10Q < -4) return '> 99.99%';
    return (P.P * 100).toFixed(2) + '%';
  }
  function quantText(x) { return (x.how === 'exact' ? '' : '约 ') + (x.n != null ? fmtInt(x.n) + ' 次' : countText(x.log10n)); }
  function pText(p) { return (p * 100).toFixed(p * 100 < 1 ? 4 : 2).replace(/\.?0+$/, '') + '%'; }

  /* ── 导出 ── */
  function csvCell(t) { t = String(t); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
  function toCSV(out, stamp) {
    var L = [['等连串', '导出 ' + stamp]];
    if (!out.ok) { L.push(['还算不出来']); out.errors.forEach(function (e) { L.push([e.field, e.message]); }); return L.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n'; }
    var v = out.v, r = out.r;
    L.push(['项目', '值']);
    L.push(['这件事', v.label || '']);
    L.push(['问法', MODES[v.mode]]);
    L.push(['每次发生的概率', v.mode === 'any' ? '1/' + v.m : pText(v.p)]);
    L.push(['连续几次', v.k]);
    L.push(['一共试几次', v.n]);
    L.push(['至少碰到一次的可能性', probText(r.P)]);
    L.push(['至少碰到一次的可能性_原始值', r.P.P]);
    L.push(['log10可能性', r.P.log10P]);
    L.push(['平均要等', waitText(r.waitLog10)]);
    L.push(['log10平均要等次数', r.waitLog10]);
    L.push(['五成把握要试', quantText(r.quant['0.5'])]);
    L.push(['九成把握要试', quantText(r.quant['0.9'])]);
    L.push(['九十九成把握要试', quantText(r.quant['0.99'])]);
    L.push(['平均碰到几段', muText(r.muLog10)]);
    L.push([]);
    L.push(['最长连串至少', '可能性']);
    out.longest.forEach(function (x) { L.push([x.j, probText(x.P)]); });
    L.push([]);
    L.push(['改法', '改完的可能性']);
    out.actions.forEach(function (a) { L.push([a.text, probText(a.P)]); });
    return L.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n';
  }
  function toMD(out, stamp) {
    var L = ['# 等连串', '', '导出 ' + stamp + '。模型：每次独立、概率不变。', ''];
    if (!out.ok) { L.push('还算不出来：'); out.errors.forEach(function (e) { L.push('- ' + e.message); }); return L.join('\n') + '\n'; }
    var v = out.v, r = out.r;
    L.push('**' + out.headline + '**', '');
    L.push('| 读数 | 值 |', '|---|---|');
    L.push('| 问法 | ' + MODES[v.mode] + ' |');
    L.push('| 每次发生的概率 | ' + (v.mode === 'any' ? '1/' + v.m : pText(v.p)) + ' |');
    L.push('| 平均要等 | ' + waitText(r.waitLog10) + ' |');
    L.push('| 五成 / 九成 / 九十九成把握 | ' + quantText(r.quant['0.5']) + ' / ' + quantText(r.quant['0.9']) + ' / ' + quantText(r.quant['0.99']) + ' |');
    L.push('| 平均碰到几段 | ' + muText(r.muLog10) + ' |');
    L.push('', '## 最长那串至少有多长', '');
    out.longest.forEach(function (x) { L.push('- 至少 ' + fmtInt(x.j) + ' 次：' + probText(x.P)); });
    L.push('', '## 只改一项', '');
    out.actions.forEach(function (a) { L.push('- ' + a.text + ' → ' + probText(a.P)); });
    out.warnings.forEach(function (w) { L.push('', '> ' + w.message); });
    return L.join('\n') + '\n';
  }

  var api = {
    N_MAX: N_MAX, K_MAX: K_MAX, M_MAX: M_MAX, LABEL_MAX: LABEL_MAX, MODES: MODES, PRESETS: PRESETS, PI: PI,
    defaultState: defaultState, stateFromPreset: stateFromPreset, presetKey: presetKey,
    parseProb: parseProb, validate: validate, compute: compute, applyAction: applyAction,
    probAtLeast: probAtLeast, logTailFeller: logTailFeller, waitLog10: waitLog10, quantiles: quantiles, meanRuns: meanRuns, core: core, piTable: piTable,
    fmtInt: fmtInt, bigText: bigText, waitText: waitText, muText: muText, countText: countText, probText: probText, probShort: probShort, quantText: quantText, pText: pText,
    toCSV: toCSV, toMD: toMD
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
