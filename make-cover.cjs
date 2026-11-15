/* 封面 cover.svg（1200×1200），数字来自 core.js 同一次 compute；再用浏览器截成 cover.png。 */
const fs = require('node:fs');
const A = require('./core.js');
const coin = A.compute(A.defaultState()), pi = A.piTable();
if (!coin.ok) throw new Error('默认场景算不出来');
const F = "-apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
const L = 120, W = 960;
const r6 = pi.find((x) => x.k === 6), r7 = pi.find((x) => x.k === 7);
const rows = [
  ['硬币抛 1,000 次，碰到连续 10 次正面', A.probText(coin.r.P)],
  ['平均要抛', A.waitText(coin.r.waitLog10)],
  ['要九成把握得抛', A.quantText(coin.r.quant['0.9'])],
  ['π 前 100 万位：同一个数字连 6 次', '第 ' + A.fmtInt(r6.end) + ' 位'],
  ['π 前 100 万位：连 7 次（7 个 3）', '第 ' + A.fmtInt(r7.end) + ' 位']
];
let body = '';
rows.forEach((r, i) => {
  const y = 560 + i * 104;
  body += `<text x="${L}" y="${y}" font-family="${F}" font-size="34" fill="#4d545c">${r[0]}</text>` +
    `<text x="${L + W}" y="${y}" text-anchor="end" font-family="${F}" font-size="44" font-weight="700" fill="${i === 0 ? '#2f6f8f' : '#1f2328'}">${r[1]}</text>` +
    `<line x1="${L}" x2="${L + W}" y1="${y + 34}" y2="${y + 34}" stroke="#e1ddd4" stroke-width="2"/>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#f3f1ec"/>
  <rect x="60" y="60" width="1080" height="1080" rx="24" fill="#ffffff"/>
  <text x="${L}" y="240" font-family="${F}" font-size="128" font-weight="800" fill="#1f2328">等连串</text>
  <text x="${L}" y="320" font-family="${F}" font-size="40" fill="#4d545c">连续 k 次，要等多久才碰得上？</text>
  <text x="${L}" y="390" font-family="${F}" font-size="28" fill="#878d94">每次概率 p、试 n 次 → 碰上的可能性、平均等待、几成把握要试几次</text>
  ${body}
  <text x="${L}" y="1080" font-family="${F}" font-size="24" fill="#878d94">硬币是虚构示例；π 的数字由本页自己算出后数的</text>
</svg>`;
fs.writeFileSync('cover.svg', svg);
console.log('cover.svg', svg.length, rows.map((r) => r[1]).join(' | '));
