#!/usr/bin/env node
/*
 * resolve-source.js — 解析体育直播聚合站的最终播放源域名
 *
 * 这类站点（sportsteam368 / jgdhds 等）把真实 HLS 流层层套娃：
 *   播放页 → 各线路 /play/*.php?id=xx（页面内嵌 XXTEA 加密 token: encodedStr）
 *     → cloud.yumixiu768.com/player/paps.html?id=<token>
 *       → XXTEA 解密 token → {url: m3u8, ts: 过期时间戳}
 * 真实流域名（如 yjjcfw.com）经常更换，本脚本自动走完整条链路把它们解出来。
 *
 * 用法: node resolve-source.js <播放页URL>
 *   例: node resolve-source.js http://play.sportsteam368.com/play/steam816357.html
 * 输出: 去重后的最终域名清单（+.domain 形式，可直接进 clash domain 规则）
 *
 * 依赖站点自身的 index.min.js(XXTEA 实现) 与 paps.html(解密逻辑)，
 * 站点换 KEY 也能自适应；若站点重构页面结构则需相应调整。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

async function fetchText(url, referer) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...(referer ? { Referer: referer } : {}) } });
  return res.text();
}
function regDomain(host) {                 // 取可注册主域 (a.b.example.com -> example.com)
  const p = host.split('.');
  return p.length <= 2 ? host : p.slice(-2).join('.');
}

// 在沙箱里跑 paps.html 的解密脚本，喂入 token，取回最终 m3u8 url
function decryptToken(xxteaLib, papsHtml, token) {
  const scripts = [...papsHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const main = scripts.find(s => s.includes('decryptUrlWithExpiry'));
  if (!main) return null;
  const href = 'http://cloud.yumixiu768.com/player/paps.html?id=' + token;
  const noop = function () {};
  const proxify = (b) => new Proxy(b, { get: (t, p) => (p in t ? t[p] : noop) });
  const loc = { href, search: '?id=' + token, host: 'cloud.yumixiu768.com' };
  const elem = { innerHTML: '', style: {} };
  const documentBase = {
    getElementById: () => proxify(elem), getElementsByTagName: () => [{ parentNode: { insertBefore() {} } }],
    createElement: () => proxify({}), referrer: 'http://play.example.com/', hidden: false, location: loc, write() {}, addEventListener() {},
  };
  const document = proxify(documentBase);
  const navigator = proxify({ userAgent: UA, maxTouchPoints: 0 });
  const windowBase = { location: loc, document, navigator, setTimeout: () => 0, setInterval: () => 0, addEventListener() {} };
  const window = proxify(windowBase); windowBase.window = window; windowBase.self = window;
  const sandbox = {
    window, self: window, document, navigator, location: loc, setTimeout: () => 0, setInterval: () => 0,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    console: { log() {}, error() {}, warn() {}, info() {}, debug() {}, table() {}, trace() {}, exception() {} }, Date,
  };
  const code = xxteaLib + '\n;' + main + "\n; return (typeof originalUrl!=='undefined')?originalUrl:null;";
  try { return (new Function(...Object.keys(sandbox), code))(...Object.values(sandbox)); }
  catch { return null; }
}

(async () => {
  const pageUrl = process.argv[2];
  if (!pageUrl) { console.error('用法: node resolve-source.js <播放页URL>'); process.exit(1); }
  const origin = new URL(pageUrl).origin;
  const domains = new Set();
  domains.add(regDomain(new URL(pageUrl).hostname));   // 播放页域名

  const page = await fetchText(pageUrl);
  // 取所有线路的播放地址
  const plays = [...page.matchAll(/data-play="([^"]+)"/g)].map(m => m[1]);
  // paps 解密所需的站点 JS（一次拉取复用）
  const xxteaLib = await fetchText('http://cloud.yumixiu768.com/player/index.min.js');
  let papsHtml = null;

  for (const play of [...new Set(plays)]) {
    const lineUrl = play.startsWith('http') ? play : origin + play;
    let html;
    try { html = await fetchText(lineUrl, pageUrl); } catch { continue; }
    const m = html.match(/encodedStr\s*=\s*'([^']+)'/);
    if (!m) continue;                                  // 非 cloud 播放器线路，跳过
    domains.add('yumixiu768.com');                     // 播放器域名
    if (!papsHtml) papsHtml = await fetchText('http://cloud.yumixiu768.com/player/paps.html?id=' + m[1], lineUrl);
    const streamUrl = decryptToken(xxteaLib, papsHtml, m[1]);
    if (streamUrl) {
      try { domains.add(regDomain(new URL(streamUrl).hostname)); } catch {}
    }
  }

  const out = [...domains].sort().map(d => '+.' + d);
  console.error(`解析 ${pageUrl}\n命中线路 ${plays.length} 条，最终域名:`);
  console.log(out.join('\n'));
})();
