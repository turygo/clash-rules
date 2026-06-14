# clash-rules

个人 Clash 规则清单。

## sports-live.list

体育直播聚合站（`sportsteam368` / `jgdhds` 等）的直连域名清单，`clash behavior: domain` 格式。

这类站把真实 HLS 流层层套娃：

```
播放页 (sportsteam368.com)
  └ 各线路 /play/*.php?id=xx   页面内嵌 XXTEA 加密 token (encodedStr)
     └ cloud.yumixiu768.com/player/paps.html?id=<token>   西瓜播放器
        └ XXTEA 解密 token → { url: m3u8, ts: 过期时间戳 }
           └ 真实流 (yjjcfw.com / 52kq.top ...)
```

页面、播放器、最终流三层都跑在火山引擎 / Cloudflare 上，对海外及机房 IP 按地区拒绝（403）。
最终流域名经常更换，故用脚本自动解析、清单集中维护。

### 自动更新（VPS crontab）

由一台**能正常访问目标站**的 VPS 每天跑 `cron-update.sh`：
`git pull` → 解析 `seeds.txt` → **并集合并**进 `sports-live.list` → 有变化才提交推送。

> ⚠️ 必须跑在未被屏蔽的 IP 上。GitHub 托管 runner 的 Azure IP 实测被站点直接 403，故不用 GitHub Action。

「只增不减」是有意的：任何一个种子解析失败（403/404/超时）都不会删域名，
最坏只是本次无新增，不会破坏清单。

部署（在 VPS 上）：

```bash
git clone git@github.com:turygo/clash-rules.git
# 配置对本仓库有写权限的 deploy key，确保 git push 免密
crontab -e
#   0 2 * * *  /path/to/clash-rules/cron-update.sh >> /var/log/clash-rules.log 2>&1
```

Clash 端通过 `rule-providers` 订阅本清单（jsdelivr CDN，约 12h 缓存），命中域名走 DIRECT。

### 手动更新

```bash
node resolve-source.js <播放页URL>   # 仅打印某页的域名
node update-list.js                  # 按 seeds.txt 解析并合并写回 sports-live.list
```

种子页（`steam816357.html` 等）是单场/频道页，失效后改 `seeds.txt` 换成当前有效的播放页。

## 文件

| 文件 | 说明 |
|------|------|
| `sports-live.list` | 直连域名清单（clash `behavior: domain`），Clash 订阅此文件 |
| `resolve-source.js` | 解析单页最终域名；复用站点自身 `index.min.js`(XXTEA)+`paps.html`，换 KEY 也自适应 |
| `update-list.js` | 按 `seeds.txt` 批量解析并集合并写回清单 |
| `seeds.txt` | 解析种子（播放页 URL 列表） |
| `cron-update.sh` | VPS crontab 调用：pull→解析→commit&push |
