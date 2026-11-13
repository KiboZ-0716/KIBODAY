# 发布链路规范（唯一真源：仓库 main 的 live-bundle.json）

2026-11-13 从头重写。过去的事故：站点同步 09:00 先跑完、内容包 09:57 才推上去，发布出去的必然是隔夜一期；前端又是「同源包优先、拿到就 return」，旧副本压过新包；云库在新域名未开通、GitHub RAW 国内超时，所有补救都失效，读者反复看到旧内容。

## 三条铁律

1. **先有包，再发布**：内容包推到 GitHub 之后，才允许发布站点。
2. **构建期数据 = 实时内容包**：`scripts/sync-live.mjs` 把包反向展开回 `src/data`，JS 内嵌的期次必须与包一致；否则首屏先渲染旧一期。
3. **结尾必须校验线上**：`scripts/publish-latest.mjs` 会回读线上同源包，期次不一致直接失败，不允许「发布成功但读者看到旧内容」。

## 命令（项目根目录 /workspace/kib0/kib0 执行）

```
TOKEN=<定时任务 prompt 里的 GitHub 凭据，或环境变量 GITHUB_TOKEN；不要写进仓库文件>
npm run push:content                              # 云库冗余通道，失败只记录不中断
npm run push:bundle -- --token=$TOKEN             # 必须见「已推送实时内容包」
node scripts/publish-latest.mjs --token=$TOKEN    # 拉最新包 → sync-live → build → 发布 → 校验
```

`publish-latest.mjs` 必须打印这一行才算完成：

```
[发布完成] 线上同源包 YYYY-MM-DD == 内容包 YYYY-MM-DD · shareLink=... · verified=true
```

缺这行、或任一命令报错，一律停止并如实报告原始输出。**禁止自己另跑 `npm run build` 或单独调 `publish.js` 兜底**——那正是旧链路出事的原因。

## 为什么站点是否重新构建不再决定「打开是不是最新」

`src/lib/livecontent.ts` 并发拉取多条通道：同源包（透传 sharecode，不带会 403）、按 GitHub HEAD commit 锁定的 jsDelivr（`@main` 有 12 小时 CDN 缓存会串期，所以必须用 `@<commit>`）、GitHub RAW、云库、localStorage 缓存、构建期数据；统一按「期次日期 + generatedAt」择优，每发现一个更新的包立即整体替换并重渲染。即使站点还没来得及重新发布，读者打开也能从 CDN 拿到当天最新一期。

## 链接

固定 `https://a564b245be247abf2.app.workbuddy.host/?sharecode=2UZTFZ4OPU`，不新建应用；若 shareLink 变化，原样报告并标注「链接漂移」。
