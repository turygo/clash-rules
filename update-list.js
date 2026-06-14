#!/usr/bin/env node
/*
 * update-list.js — 读取 seeds.txt 里的播放页，解析最终域名，并集合并进 sports-live.list。
 *
 * 设计为「只增不减」：任何一个种子解析失败(被 403 / 404 / 超时)都不会删除已有域名，
 * 最坏情况是本次无新增、文件不变。供 GitHub Action 每日调用。
 *
 * 退出码：0=完成(无论有无新增)；2=所有种子全部解析失败(供 Action 判断是否告警)。
 */
const fs = require('fs');
const path = require('path');
const { resolvePage } = require('./resolve-source.js');

const LIST = path.join(__dirname, 'sports-live.list');
const SEEDS = path.join(__dirname, 'seeds.txt');

function readLines(file) {
  return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim());
}
function splitList(text) {                       // 返回 {header: 注释行[], domains: Set<裸域名>}
  const header = [], domains = new Set();
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) { header.push(line); continue; }
    domains.add(t.replace(/^\+\./, ''));         // 去掉 +. 前缀存裸域名
  }
  return { header, domains };
}

(async () => {
  const seeds = readLines(SEEDS).filter((l) => l && !l.startsWith('#'));
  const { header, domains } = splitList(fs.readFileSync(LIST, 'utf8'));
  const before = domains.size;
  let ok = 0;
  for (const url of seeds) {
    try {
      const found = await resolvePage(url);
      found.forEach((d) => domains.add(d));
      ok++;
      console.log(`✓ ${url} -> ${found.join(', ')}`);
    } catch (e) {
      console.log(`✗ ${url} -> ${e.message}`);
    }
  }
  const sorted = [...domains].sort();
  const out = header.join('\n') + '\n' + sorted.map((d) => '+.' + d).join('\n') + '\n';
  fs.writeFileSync(LIST, out);
  console.log(`\n种子 ${seeds.length} 个，成功 ${ok} 个；域名 ${before} -> ${sorted.length}`);
  if (ok === 0) process.exit(2);                 // 全失败：很可能 runner IP 被屏蔽
})();
