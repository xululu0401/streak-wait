/* 等连串 · 核心测试。node --test tests/core.test.cjs
 * 锚点来自 evidence/手算锚点.py（Fraction 马尔可夫链 + 小 n 全枚举 + 期望吸收时间方程）、随机对拍.py、尾部参考.py（Decimal 60 位），都不读 core.js。
 * 最后一组把错误注入源码再跑同一批锚点，确认锚点够尖。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../core.js');

const EV = path.join(__dirname, '..', '..', 'evidence');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'core.js'), 'utf8');
const PY = JSON.parse(fs.readFileSync(path.join(EV, '手算锚点.json'), 'utf8'));
const RAND = JSON.parse(fs.readFileSync(path.join(EV, '随机对拍.json'), 'utf8'));
const TAIL = JSON.parse(fs.readFileSync(path.join(EV, '尾部参考.json'), 'utf8'));
const DEG = JSON.parse(fs.readFileSync(path.join(EV, '退化参考.json'), 'utf8'));
const HP = JSON.parse(fs.readFileSync(path.join(EV, '主极点高精度.json'), 'utf8'));
const PIS = JSON.parse(fs.readFileSync(path.join(EV, 'pi连串统计.json'), 'utf8'));
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= (tol || 1e-10) * Math.max(1e-300, Math.abs(b));
const frac = (t) => { const [a, b] = String(t).split('/').map(Number); return b ? a / b : a; };
function load(src) { const sb = { module: { exports: {} } }; sb.globalThis = sb; vm.runInNewContext(src, sb); return sb.module.exports; }
const st = (o) => Object.assign(C.defaultState(), o);

function anchors(M) {
  for (const [p, k, n, P] of PY.one) {
    const r = M.compute(st({ mode: 'one', prob: p, k: String(k), n: String(n) }));
    if (!r.ok) return 'one 算不出 ' + p + ',' + k + ',' + n;
    if (!(P === 0 ? r.r.P.P === 0 : near(r.r.P.P, P, 1e-11))) return 'one ' + [p, k, n] + ' ' + r.r.P.P + ' ≠ ' + P;
  }
  for (const [m, k, n, P] of PY.any) {
    const r = M.compute(st({ mode: 'any', m: String(m), k: String(k), n: String(n) }));
    if (!r.ok) return 'any 算不出';
    if (!(P === 0 ? r.r.P.P === 0 : near(r.r.P.P, P, 1e-11))) return 'any ' + [m, k, n] + ' ' + r.r.P.P + ' ≠ ' + P;
  }
  for (const [p, k, , E] of PY.wait_one) if (!near(Math.pow(10, M.core({ mode: 'one', p: frac(p), k, n: k }).waitLog10), E, 1e-12)) return '平均等待 one ' + p + ',' + k;
  for (const [m, k, , E] of PY.wait_any) if (!near(Math.pow(10, M.core({ mode: 'any', p: 1 / m, m, k, n: k }).waitLog10), E, 1e-12)) return '平均等待 any ' + m + ',' + k;
  for (const [p, k, a, b, c] of PY.quant) {
    const q = M.quantiles(p, k);
    if (q['0.5'].n !== a || q['0.9'].n !== b || q['0.99'].n !== c) return '把握次数 ' + p + ',' + k + ' ' + JSON.stringify(q);
  }
  /* 换成 any 的把握次数要加回第 1 次：2 种结果连 10 次 = 硬币正面连 9 次再 +1 */
  const qa = M.core({ mode: 'any', p: 0.5, m: 2, k: 10, n: 1000 }).quant, qo = M.quantiles(0.5, 9);
  if (qa['0.5'].n !== qo['0.5'].n + 1) return 'any 把握次数没加第 1 次';
  /* 平均段数：硬币 1000 次、连 10 次正面 = 2^-10 ×（1 + 990/2） */
  const mu = M.core({ mode: 'one', p: 0.5, k: 10, n: 1000 }).mu;
  if (!near(mu, (1 + 990 * 0.5) / 1024, 1e-14)) return '平均段数 ' + mu;
  /* 深尾：1 − P 小到 10^-664 */
  for (const [p, k, n, l] of TAIL.feller_tail) {
    const r = M.probAtLeast(+p, k, n);
    if (!near(r.log10Q, l, 1e-11)) return '深尾 ' + [p, k, n] + ' ' + r.log10Q + ' ≠ ' + l;
  }
  /* 两根重合的退化点 p = k/(k+1) 与离它 1e-7 的点（第一版在这里出 NaN / 误差 2e-5） */
  for (const [p, k, n, l] of DEG) {
    const g = M.logTailFeller(p, k, n) / Math.LN10;
    if (!near(g, l, 1e-12)) return '退化点 ' + [p, k, n] + ' ' + g + ' ≠ ' + l;
  }
  /* 主极点式在 x 接近 1 时的精度（第一版只有 1e-10，Chrome 与 Node 在第 11 位分叉；加牛顿修正后对 Decimal 80 位参考到 1e-14） */
  for (const [p, k, n, l] of HP) {
    const g = M.logTailFeller(p, k, n) / Math.LN10;
    if (!near(g, l, 1e-14)) return '主极点精度 ' + [p, k, n] + ' ' + g + ' ≠ ' + l;
  }
  /* 超过 200 万次的外推、极罕见的指数近似 */
  for (const [p, k, a, b, c] of TAIL.quant_big) {
    const q = M.quantiles(+p, k), got = ['0.5', '0.9', '0.99'].map((t) => Math.round(Math.pow(10, q[t].log10n)));
    if (got.join() !== [a, b, c].join()) return '外推把握 ' + p + ',' + k + ' ' + got + ' ≠ ' + [a, b, c];
  }
  for (const [p, k, lE, l5, l9, l99] of TAIL.tiny) {
    const q = M.quantiles(+p, k);
    if (!near(M.waitLog10(+p, k), lE, 1e-12) || !near(q['0.5'].log10n, l5, 1e-12) || !near(q['0.9'].log10n, l9, 1e-12) || !near(q['0.99'].log10n, l99, 1e-12)) return '极罕见 ' + p + ',' + k;
  }
  /* 极罕见分支：p^k 很小时 P = 平均段数 */
  const tn = M.probAtLeast(0.5, 60, 2000000);
  if (tn.how !== 'tiny' || !near(tn.P, Math.pow(2, -60) * (1 + (2000000 - 60) * 0.5), 1e-12)) return '极罕见 P ' + JSON.stringify(tn);
  /* 默认场景 */
  const o = M.compute(M.defaultState());
  if (!o.ok || M.probText(o.r.P) !== '38.54%' || M.waitText(o.r.waitLog10) !== '2,046 次') return '默认 ' + (o.ok && M.probText(o.r.P));
  if (o.actions.map((a) => a.kind).join() !== 'k_minus,k_plus,n_90,n_x2,to_any') return '默认改法 ' + o.actions.map((a) => a.kind);
  if (o.actions[2].patch.n !== '4700') return '九成把握改法 ' + o.actions[2].patch.n;
  return null;
}

test('A1 与 Python 精确锚点一致（概率、平均等待、把握次数、平均段数、深尾、外推、极罕见、默认）', () => { assert.equal(anchors(C), null); });

test('A2 小 n 全枚举（2^n / m^n 条序列）', () => {
  for (const [mode, a, k, n, P] of PY.brute) {
    const r = mode === 'one' ? C.compute(st({ mode, prob: a, k: String(k), n: String(n) })) : C.compute(st({ mode, m: String(a), k: String(k), n: String(n) }));
    assert.ok(r.ok && near(r.r.P.P, P, 1e-12), mode + ' ' + [a, k, n] + ' ' + (r.ok && r.r.P.P) + ' vs ' + P);
  }
});

test('A3 随机 300 组与 Python 浮点马尔可夫链对拍（one 与 any 各自建链，含 1 − P）', () => {
  let n = 0;
  for (const R of RAND) {
    const s = R.mode === 'one' ? st({ mode: 'one', prob: R.prob, k: String(R.k), n: String(R.n) }) : st({ mode: 'any', m: String(R.m), k: String(R.k), n: String(R.n) });
    const o = C.compute(s);
    assert.ok(o.ok, JSON.stringify(R));
    assert.ok(R.P === 0 ? o.r.P.P === 0 : near(o.r.P.P, R.P, 1e-9), JSON.stringify(R) + ' P ' + o.r.P.P);
    if (R.A > 1e-300 && R.A < 1) { assert.ok(near(Math.pow(10, o.r.P.log10Q), R.A, 1e-8), JSON.stringify(R) + ' 1−P ' + Math.pow(10, o.r.P.log10Q)); n++; }
  }
  assert.ok(n > 200, '有效的 1−P 对比太少 ' + n);
});

test('A4 单调与边界：k 越大越难、n 越大越容易；n < k 为 0；k = 1 闭式；P + (1 − P) = 1', () => {
  for (const p of [0.1, 0.5, 0.9]) {
    let prev = 2;
    for (let k = 1; k <= 12; k++) { const P = C.probAtLeast(p, k, 200).P; assert.ok(P <= prev + 1e-15); prev = P; }
    prev = -1;
    for (let n = 1; n <= 400; n += 7) { const P = C.probAtLeast(p, 4, n).P; assert.ok(P >= prev - 1e-15); prev = P; }
    assert.equal(C.probAtLeast(p, 5, 4).P, 0);
    assert.ok(near(C.probAtLeast(p, 1, 37).P, 1 - Math.pow(1 - p, 37), 1e-13));
    for (const n of [10, 100, 1000]) { const r = C.probAtLeast(p, 3, n); if (r.P < 0.5) assert.ok(near(r.P + Math.pow(10, r.log10Q), 1, 1e-14)); }
  }
});

test('A5 输入校验：三种概率写法、非法值、上下限、超长名字', () => {
  assert.equal(C.parseProb('50%').p, 0.5); assert.equal(C.parseProb('0.5').p, 0.5); assert.ok(near(C.parseProb('1/6').p, 1 / 6, 1e-15));
  assert.equal(C.parseProb(' 45 ％').p, 0.45); assert.ok(near(C.parseProb('1／3').p, 1 / 3, 1e-15));
  for (const bad of ['', '0', '100%', '1', '1.5', '1/0', 'abc', '-0.2', '0.00000001']) assert.equal(C.parseProb(bad).ok, false, bad);
  const e = (o) => C.compute(st(o)).errors.map((x) => x.field).sort().join();
  assert.equal(e({ k: '0' }), 'k'); assert.equal(e({ k: '1.5' }), 'k'); assert.equal(e({ n: '2000001' }), 'n'); assert.equal(e({ n: '' }), 'n');
  assert.equal(e({ mode: 'any', m: '1' }), 'm'); assert.equal(e({ mode: 'x' }), 'mode');
  assert.equal(e({ label: '一二三四五六七八九十一二三四五六七八九十一' }), 'label');
  assert.equal(C.compute(st({ label: '一二三四五六七八九十一二三四五六七八九十' })).ok, true);
  assert.equal(C.compute(st({ n: '1,000' })).ok, true);
  /* any 模式忽略概率栏 */
  assert.equal(C.compute(st({ mode: 'any', prob: '乱写' })).ok, true);
});

test('A6 提醒：k > n、极罕见、any 连 1 次', () => {
  const w = (o) => C.compute(st(o)).warnings.map((x) => x.code).join();
  assert.equal(w({ k: '20', n: '10' }), 'k_gt_n');
  assert.equal(w({ k: '60', n: '2000000' }), 'tiny');
  assert.equal(w({ mode: 'any', k: '1' }), 'k1');
  assert.equal(w({}), '');
});

test('A7 改法：只改一项、改完的读数 = 用改完的输入重新算', () => {
  for (const key of C.PRESETS.map((p) => p.key)) {
    const s = C.stateFromPreset(key), o = C.compute(s);
    for (const a of o.actions) {
      const s2 = C.applyAction(s, a), o2 = C.compute(s2);
      assert.ok(o2.ok, key + ' ' + a.kind);
      assert.ok(o2.r.P.log10P === a.P.log10P || near(o2.r.P.log10P, a.P.log10P, 1e-12), key + ' ' + a.kind);
      const changed = Object.keys(s).filter((k) => s[k] !== s2[k]);
      assert.ok(changed.length >= 1 && changed.length <= 2, key + ' ' + a.kind + ' 改了 ' + changed);
    }
  }
  const q9 = C.compute(C.defaultState()).actions.find((a) => a.kind === 'n_90');
  assert.equal(q9.patch.n, '4700'); assert.ok(q9.P.P >= 0.9 && C.probAtLeast(0.5, 10, 4699).P < 0.9);
});

test('A8 π 前 100 万位：页面内置的数与 evidence 里 Python 从数字串数出来的一致；数字串 sha256 与首尾位核对', () => {
  const digits = fs.readFileSync(path.join(EV, 'pi-小数点后100万位.txt'), 'utf8');
  assert.equal(digits.length, 1000000);
  assert.equal(digits.slice(0, 20), '14159265358979323846');
  assert.equal(digits.slice(761, 767), '999999');
  assert.equal(require('node:crypto').createHash('sha256').update(digits).digest('hex'), '7806ee47461b49ef1f578e14461b2c83c09c6d7a9a914275da1d71e9cbbf7069');
  assert.deepEqual(C.PI.any, PIS.any); assert.deepEqual(C.PI.anyDigit, PIS.any_digit); assert.deepEqual(C.PI.anyCount, PIS.any_count);
  for (const d of Object.keys(PIS.per)) { assert.equal(C.PI.per[d].L, PIS.per[d].longest); assert.deepEqual(C.PI.per[d].first, PIS.per[d].first); }
  /* 用 JS 再数一遍，不经过 Python */
  let best = 0, at = 0, run = 1;
  for (let i = 1; i < digits.length; i++) { run = digits[i] === digits[i - 1] ? run + 1 : 1; if (run > best) { best = run; at = i - run + 2; } }
  assert.equal(best, 7); assert.equal(at, 710100); assert.equal(digits.slice(710099, 710106), '3333333');
  const t = C.piTable();
  assert.equal(t.find((r) => r.k === 6).end, 767); assert.equal(t.find((r) => r.k === 8).start, null);
  assert.equal(C.probShort(t.find((r) => r.k === 7).P), '59.34%');
});

test('A9 导出：CSV / MD 与同一次 compute 同口径；填错时也能导出', () => {
  const o = C.compute(C.defaultState()), csv = C.toCSV(o, 'T'), md = C.toMD(o, 'T');
  assert.ok(csv.indexOf('至少碰到一次的可能性,38.54%') > 0 && csv.indexOf('平均要等,"2,046 次"') > 0, csv);
  assert.ok(csv.indexOf('九成把握要试,"4,700 次"') > 0);
  assert.ok(md.indexOf('**' + o.headline + '**') > 0 && md.indexOf('五成 / 九成 / 九十九成把握 | 1,421 次 / 4,700 次 / 9,391 次') > 0, md);
  const bad = C.compute(st({ k: 'x' }));
  assert.ok(C.toCSV(bad, 'T').indexOf('还算不出来') > 0 && C.toMD(bad, 'T').indexOf('还算不出来') > 0);
  assert.equal(C.probText({ P: 1, log10P: 0, log10Q: -700.2 }), '只差 6.31 × 10⁻⁷⁰¹ 就是 100%');
  assert.equal(C.probText({ P: 0, log10P: -Infinity, log10Q: 0 }), '0');
  assert.equal(C.waitText(Math.log10(1.1111111) + 1000000), '1.11 × 10 的 1,000,000 次方 次');
  assert.equal(C.waitText(Math.log10(2046)), '2,046 次'); assert.equal(C.waitText(Math.log10(96.71323815813984)), '96.7 次');
  assert.equal(C.waitText(Math.log10(4.5e9)), '45.00 亿 次');
});

test('A10 注入错误：每个都要被锚点抓到', () => {
  const muts = [
    ['递推漏乘 q', 'var q = 1 - p, pk = Math.pow(p, k), c = q * pk, M = k + 2;', 'var q = 1 - p, pk = Math.pow(p, k), c = pk, M = k + 2;'],
    ['第 k 次时漏掉 p^k', 'else if (i === k) { bi = pk; ai = 1 - pk; }', 'else if (i === k) { bi = 0; ai = 1; }'],
    ['递推下标少退一格', 'var j = (i - k - 1) % M;', 'var j = (i - k) % M;'],
    ['any 换算忘了 k−1', "if (v.mode === 'any') return { p: v.p, k: v.k - 1, n: v.n - 1, shift: 1 };", "if (v.mode === 'any') return { p: v.p, k: v.k, n: v.n - 1, shift: 1 };"],
    ['any 换算忘了 n−1', "if (v.mode === 'any') return { p: v.p, k: v.k - 1, n: v.n - 1, shift: 1 };", "if (v.mode === 'any') return { p: v.p, k: v.k - 1, n: v.n, shift: 1 };"],
    ['any 等待没加第 1 次', "if (v.mode === 'any') return { p: v.p, k: v.k - 1, n: v.n - 1, shift: 1 };", "if (v.mode === 'any') return { p: v.p, k: v.k - 1, n: v.n - 1, shift: 0 };"],
    ['平均等待漏了分子 1 − p^k', 'var one = lpk > -300 ? Math.log10(1 - Math.pow(10, lpk)) : 0;', 'var one = 0;'],
    ['放不下两段的闭式漏乘 q', 'var q = 1 - p, l = log10Pk(p, k) + Math.log10(1 + (n - k) * q);', 'var q = 1 - p, l = log10Pk(p, k) + Math.log10(1 + (n - k));'],
    ['闭式适用范围放宽到 3k', 'if (n <= 2 * k) {', 'if (n <= 3 * k) {'],
    ['平均段数多算一格', 'return Math.pow(10, log10Pk(p, k)) * (1 + (n - k) * (1 - p));', 'return Math.pow(10, log10Pk(p, k)) * (1 + (n - k + 1) * (1 - p));'],
    ['主极点根的二分方向反了', 'if (h(mid) < 0) lo = mid; else hi = mid;', 'if (h(mid) < 0) hi = mid; else lo = mid;'],
    ['主极点式少除一个 x', 'return Math.log(Math.expm1(k * t) / (q * den)) - lx - n * lx;', 'return Math.log(Math.expm1(k * t) / (q * den)) - n * lx;'],
    ['牛顿修正符号反了', 'var nl = lx - g / gp; if (!(nl > 0)) break; lx = nl;', 'var nl = lx + g / gp; if (!(nl > 0)) break; lx = nl;'],
    /* 「退化点极限漏系数 2」是等价变异：二分不会恰好落在 t = 0，这一行只是防 0/0 的保护，删掉不测（见 质检报告）。 */
    ['分母求和少一项', 'for (var j = 0; j < k; j++) den += Math.exp(j * t) * Math.expm1((k - j) * t);', 'for (var j = 1; j < k; j++) den += Math.exp(j * t) * Math.expm1((k - j) * t);'],
    ['把握次数差一位', 'while (ti < T.length && bi >= T[ti]) { found[T[ti]] = i; ti++; }', 'while (ti < T.length && bi >= T[ti]) { found[T[ti]] = i + 1; ti++; }'],
    ['外推向下取整', 'var j = Math.ceil((Math.log(1 - t) - la) / Math.log(r));', 'var j = Math.floor((Math.log(1 - t) - la) / Math.log(r));'],
    ['极罕见分位数漏了 −ln(1−t)', "T.forEach(function (t) { out[t] = { log10n: lE + Math.log10(-Math.log(1 - t)), how: 'approx' }; });", "T.forEach(function (t) { out[t] = { log10n: lE, how: 'approx' }; });"],
    ['百分号除以 10', 'v = parseFloat(m[1]) / 100;', 'v = parseFloat(m[1]) / 10;'],
    ['分数写反', 'v = parseFloat(m[2]) > 0 ? parseFloat(m[1]) / parseFloat(m[2]) : NaN;', 'v = parseFloat(m[2]) > 0 ? parseFloat(m[2]) / parseFloat(m[1]) : NaN;'],
    ['九成把握改法用五成', "var q9 = r.quant['0.9'];", "var q9 = r.quant['0.5'];"]
  ];
  const report = [];
  for (const [name, a, b] of muts) {
    assert.equal(SRC.split(a).length, 2, '注入点不唯一或不存在：' + name);
    let caught;
    try { caught = anchors(load(SRC.replace(a, b))); } catch (e) { caught = '抛错 ' + e.message; }
    report.push((caught ? '抓到 ' : '漏掉 ') + name + (caught ? ' ← ' + String(caught).slice(0, 120) : ''));
  }
  fs.writeFileSync(path.join(EV, '注入测试明细.txt'), report.join('\n') + '\n');
  assert.deepEqual(report.filter((r) => r.indexOf('漏掉') === 0), []);
});
