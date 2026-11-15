/* 等连串 · 界面（ui.js）
 * 读 state → AppCore.compute → 把同一次输出画出来。页面不自己算数。 */
(function () {
  'use strict';
  var A = window.AppCore;
  var KEY = 'streak-wait:v1';
  var FIELDS = ['mode', 'prob', 'm', 'k', 'n', 'label'];
  var $ = function (id) { return document.getElementById(id); };
  var state = load() || A.defaultState();
  var out = null;

  function sanitize(s) {
    if (!s || typeof s !== 'object') return null;
    var d = A.defaultState(), any = false;
    FIELDS.forEach(function (k) { if (s[k] != null && typeof s[k] !== 'object') { d[k] = String(s[k]).slice(0, 60); any = true; } });
    return any ? d : null;
  }
  function load() { try { var t = localStorage.getItem(KEY); if (!t) return null; var j = JSON.parse(t); return sanitize(j && j.state); } catch (e) { return null; } }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ state: state })); $('saveTag').textContent = '· 已存到本机'; }
    catch (e) { $('saveTag').textContent = '· 没能存到本机'; }
  }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function renderPresets() {
    var k = A.presetKey(state);
    $('presets').innerHTML = A.PRESETS.map(function (p) { return '<button type="button" class="chip" id="preset_' + p.key + '" data-p="' + p.key + '" aria-pressed="' + (k === p.key) + '">' + esc(p.name) + '</button>'; }).join('');
    var cur = A.PRESETS.filter(function (p) { return p.key === k; })[0];
    $('presetNote').textContent = cur ? cur.note : '已按你填的数计算（不是预设）。';
  }
  $('presets').addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (!b) return; state = A.stateFromPreset(b.getAttribute('data-p')); fill(); update(); });

  function fill() {
    ['prob', 'm', 'k', 'n', 'label'].forEach(function (k) { if ($(k).value !== state[k]) $(k).value = state[k]; });
    $('modeOne').setAttribute('aria-pressed', String(state.mode === 'one'));
    $('modeAny').setAttribute('aria-pressed', String(state.mode === 'any'));
    $('f_prob').classList.toggle('hide', state.mode === 'any');
    $('f_m').classList.toggle('hide', state.mode !== 'any');
  }
  $('f_mode').addEventListener('click', function (e) { var b = e.target.closest('[data-mode]'); if (!b) return; state.mode = b.getAttribute('data-mode'); fill(); update(); });
  ['prob', 'm', 'k', 'n', 'label'].forEach(function (k) { $(k).addEventListener('input', function () { state[k] = this.value; update(); }); });

  function markErrors() {
    document.querySelectorAll('.f.bad').forEach(function (f) { f.classList.remove('bad'); });
    (out.errors || []).forEach(function (e) { if ($('f_' + e.field)) $('f_' + e.field).classList.add('bad'); });
  }

  /* 等待尺：每一行一条横条，长度按「次数」的数量级（log10）画；你的 n 那一行是蓝色，其余对照它看 */
  function ruler(v, r) {
    var pts = [
      { cls: 'you', lab: '你试的次数', val: A.fmtInt(v.n) + ' 次', l: Math.log10(v.n) },
      { cls: 'avg', lab: '平均要等', val: A.waitText(r.waitLog10), l: r.waitLog10 == null ? 0 : r.waitLog10 },
      { cls: 'q', lab: '五成把握', val: A.quantText(r.quant['0.5']), l: ql(r.quant['0.5']) },
      { cls: 'q', lab: '九成把握', val: A.quantText(r.quant['0.9']), l: ql(r.quant['0.9']) },
      { cls: 'q', lab: '九十九成把握', val: A.quantText(r.quant['0.99']), l: ql(r.quant['0.99']) }
    ];
    var hi = Math.ceil(Math.max.apply(null, pts.map(function (p) { return p.l; })) + 1e-9); if (hi < 1) hi = 1;
    var you = Math.log10(v.n) / hi * 100;
    $('ruler').innerHTML = pts.map(function (p, i) {
      var w = Math.max(0.6, p.l / hi * 100);
      return '<div class="rl ' + p.cls + '" id="rl_' + i + '"><span class="rk">' + p.lab + '</span><span class="rt"><b style="width:' + w.toFixed(2) + '%"></b><i style="left:' + you.toFixed(2) + '%"></i></span><span class="rv">' + esc(p.val) + '</span></div>';
    }).join('');
    $('rulerNote').textContent = '条的长度按数量级画（整条 = ' + tickLab(hi) + ' 次，每多一位数长一截）。竖线是你试的次数：条超过竖线，就是你试得还不够那么多。';
  }
  function supN(n) { return String(n).split('').map(function (c) { return '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]; }).join(''); }
  function tickLab(t) { return t <= 6 ? A.fmtInt(Math.pow(10, t)) : '10' + supN(t); }
  function ql(x) { return x.n != null ? Math.log10(Math.max(1, x.n)) : x.log10n; }

  function render() {
    var bad = !out.ok;
    $('errBox').classList.toggle('hide', !bad);
    $('resCard').classList.toggle('hide', bad);
    if (bad) { $('errBox').innerHTML = '<b>还算不出来</b>，先把这些改对：<ul>' + out.errors.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('') + '</ul>'; return; }
    var v = out.v, r = out.r;
    $('headline').textContent = out.headline;
    $('bigP').textContent = A.probText(r.P);
    $('bigNote').textContent = (v.mode === 'any' ? v.m + ' 种结果等可能，任何一种连着出现 ' + A.fmtInt(v.k) + ' 次都算' : '每次 ' + A.pText(v.p) + ' 发生') + ' · 每次独立 · ' + (r.P.how === 'tiny' ? '按平均段数近似' : '逐次精确递推');
    ruler(v, r);
    $('kvWait').textContent = A.waitText(r.waitLog10);
    $('kvQ5').textContent = A.quantText(r.quant['0.5']);
    $('kvQ9').textContent = A.quantText(r.quant['0.9']);
    $('kvQ99').textContent = A.quantText(r.quant['0.99']);
    $('kvMu').textContent = A.muText(r.muLog10);
    $('longTable').innerHTML = '<tr><th>最长那串至少</th><th style="text-align:right">可能性</th></tr>' + out.longest.map(function (x) {
      return '<tr class="' + (x.j === v.k ? 'cur' : '') + '" id="lg_' + x.j + '"><td>' + A.fmtInt(x.j) + ' 次</td><td class="n">' + esc(A.probText(x.P)) + '</td></tr>';
    }).join('');
    $('acts').innerHTML = out.actions.map(function (a, i) {
      return '<button type="button" class="act" id="act_' + a.kind + '" data-a="' + i + '">→ ' + esc(a.text) + '<small>改完：' + esc(A.probText(a.P)) + '</small></button>';
    }).join('');
    $('warnBox').classList.toggle('hide', !out.warnings.length);
    $('warnBox').innerHTML = '<ul>' + out.warnings.map(function (x) { return '<li>' + esc(x.message) + '</li>'; }).join('') + '</ul>';
  }
  $('acts').addEventListener('click', function (e) { var b = e.target.closest('[data-a]'); if (!b) return; state = A.applyAction(state, out.actions[+b.getAttribute('data-a')]); fill(); update(); });

  function renderPi() {
    var rows = A.piTable();
    $('piNote').textContent = 'π 小数点后前 ' + A.fmtInt(A.PI.digits) + ' 位里，同一个数字连着出现的最长一串是 7 个 3（从第 710,100 位起）；6 个 9 出现在第 762–767 位（常说的「费曼点」）。';
    $('piTable').innerHTML = '<tr><th>同一个数字连着</th><th>第一次凑齐在第几位</th><th style="text-align:right">实际段数</th><th style="text-align:right">模型平均段数</th><th style="text-align:right">模型平均要等</th><th style="text-align:right">前 100 万位碰到的可能性</th></tr>' + rows.map(function (x) {
      return '<tr id="pi_' + x.k + '"><td>' + x.k + ' 个</td><td>' + (x.end ? '第 ' + A.fmtInt(x.end) + ' 位（' + x.k + ' 个 ' + x.digit + '）' : '前 100 万位里没有') + '</td><td class="n">' + A.fmtInt(x.count) + '</td><td class="n">' + A.muText(x.muLog10) + '</td><td class="n">' + A.waitText(x.waitLog10) + '</td><td class="n">' + esc(A.probShort(x.P)) + '</td></tr>';
    }).join('');
  }

  function update() { out = A.compute(state); markErrors(); render(); renderPresets(); save(); }

  /* 导出 */
  function stamp() { var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function download(name, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  $('dlCsv').addEventListener('click', function () { download('等连串.csv', new Blob(['\ufeff' + A.toCSV(out, stamp())], { type: 'text/csv;charset=utf-8' })); });
  $('dlMd').addEventListener('click', function () { download('等连串.md', new Blob([A.toMD(out, stamp())], { type: 'text/markdown;charset=utf-8' })); });
  $('dlJson').addEventListener('click', function () { download('等连串-备份.json', new Blob([JSON.stringify({ app: '等连串', slug: 'streak-wait', version: 1, exported_at: stamp(), state: state, out: out }, null, 2)], { type: 'application/json' })); });
  $('impJson').addEventListener('click', function () { $('impFile').click(); });
  $('impFile').addEventListener('change', function () { var f = this.files && this.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { importText(String(rd.result)); }; rd.readAsText(f); this.value = ''; });
  function importText(t) {
    var s = null;
    try { var j = JSON.parse(t); s = sanitize(j && j.state ? j.state : j); } catch (e) { s = null; }
    if (!s) { $('saveTag').textContent = '· 这个文件读不出来，没改动'; return false; }
    state = s; fill(); update(); return true;
  }
  $('reset').addEventListener('click', function () { state = A.defaultState(); fill(); update(); });

  /* 结果卡 PNG 1080×1350：文字取自同一次 out */
  function drawCard() {
    var W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    var F = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffffff'; g.fillRect(48, 48, W - 96, H - 96);
    var L = 96, R = W - 96, maxW = R - L, y = 136;
    function clip(t, w) { t = String(t); if (g.measureText(t).width <= w) return t; while (t.length > 1 && g.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }
    function text(t, size, color, bold, x, w) { g.font = (bold ? '700 ' : '') + size + 'px ' + F; g.fillStyle = color; g.fillText(clip(t, w || maxW), x == null ? L : x, y); }
    function wrap(t, size, color, bold, lines) {
      g.font = (bold ? '700 ' : '') + size + 'px ' + F; g.fillStyle = color;
      var cur = '', n = 0, ch = String(t).split('');
      for (var i = 0; i < ch.length; i++) {
        if (g.measureText(cur + ch[i]).width > maxW) { if (n === lines - 1) { g.fillText(clip(cur + ch.slice(i).join(''), maxW), L, y); y += size * 1.35; return; } g.fillText(cur, L, y); y += size * 1.35; n++; cur = ch[i]; }
        else cur += ch[i];
      }
      if (cur) { g.fillText(cur, L, y); y += size * 1.35; }
    }
    text('等连串', 56, '#1f2328', true); y += 44;
    text('导出 ' + stamp() + ' · 模型：每次独立、概率不变', 22, '#878d94'); y += 64;
    if (!out.ok) {
      text('还算不出来', 44, '#b8452f', true); y += 60;
      out.errors.slice(0, 12).forEach(function (e) { wrap('· ' + e.message, 25, '#4d545c', false, 2); y += 6; });
      return cv;
    }
    var v = out.v, r = out.r;
    wrap(out.headline.replace(/的可能性是.*$/, '的可能性'), 34, '#1f2328', true, 3); y += 6;
    g.fillStyle = '#eef4f7'; g.fillRect(L, y, maxW, 150);
    var pt = A.probText(r.P);
    g.font = '800 ' + (pt.length > 12 ? 52 : 92) + 'px ' + F; g.fillStyle = '#2f6f8f'; g.fillText(clip(pt, maxW - 48), L + 24, y + (pt.length > 12 ? 92 : 110));
    y += 200;
    var rows = [['平均要等', A.waitText(r.waitLog10)], ['五成把握要试', A.quantText(r.quant['0.5'])], ['九成把握要试', A.quantText(r.quant['0.9'])], ['九十九成把握要试', A.quantText(r.quant['0.99'])], ['平均碰到几段', A.muText(r.muLog10)]];
    rows.forEach(function (x) {
      g.font = '26px ' + F; g.fillStyle = '#4d545c'; g.fillText(x[0], L, y);
      g.font = '700 30px ' + F; g.fillStyle = '#1f2328'; g.textAlign = 'right'; g.fillText(clip(x[1], maxW - 280), R, y); g.textAlign = 'left';
      y += 52;
    });
    y += 20;
    text('最长那一串至少有多长', 28, '#1f2328', true); y += 46;
    out.longest.forEach(function (x) {
      var cur = x.j === v.k;
      if (cur) { g.fillStyle = '#eef4f7'; g.fillRect(L - 8, y - 30, maxW + 16, 42); }
      g.font = (cur ? '700 ' : '') + '25px ' + F; g.fillStyle = '#1f2328'; g.fillText('至少 ' + A.fmtInt(x.j) + ' 次', L, y);
      g.textAlign = 'right'; g.fillText(clip(A.probText(x.P), maxW - 300), R, y); g.textAlign = 'left';
      y += 44;
    });
    g.font = '21px ' + F; g.fillStyle = '#878d94';
    g.fillText(clip('连续输了之后下一次赢的概率不会变大；本卡不是投注建议', maxW), L, H - 108);
    g.fillText(clip(v.mode === 'any' ? v.m + ' 种结果等可能，任何一种连着 ' + A.fmtInt(v.k) + ' 次都算' : '每次发生的概率 ' + A.pText(v.p) + (v.label ? ' · ' + v.label : ''), maxW), L, H - 74);
    return cv;
  }
  $('dlPng').addEventListener('click', function () { drawCard().toBlob(function (b) { if (b) download('等连串-1080x1350.png', b); }, 'image/png'); });

  window.__streakUi = { state: function () { return JSON.parse(JSON.stringify(state)); }, out: function () { return out; }, importText: importText, drawCard: drawCard, storageKey: KEY };

  fill(); update(); renderPi();
})();
