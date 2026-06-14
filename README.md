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

### 更新流程

```bash
# 解析某个播放页当前用到的所有最终域名
node resolve-source.js http://play.sportsteam368.com/play/steam816357.html
# 把新出现的域名补进 sports-live.list，然后
git commit -am "update sports-live domains" && git push
```

Clash 端通过 `rule-providers` 订阅本清单（jsdelivr CDN），命中域名走 DIRECT。

## resolve-source.js

解析脚本，Node 运行，复用站点自身的 `index.min.js`(XXTEA) 与 `paps.html` 解密逻辑，
站点换密钥也能自适应。详见脚本头部注释。
