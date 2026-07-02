# Cloudflare Pages 部署准备

这份清单用于把 Astro 迁移后的博客部署到 Cloudflare Pages。

## 项目创建

在 Cloudflare Pages 中从 GitHub 仓库创建项目：

- 仓库：`jazzlost/jazzlost.github.io`
- 预览验收分支：`codex/astro-cloudflare-pages-migration`
- 框架预设：Astro
- 构建命令：`npm run build`
- 构建输出目录：`dist`
- Node.js 版本：当前 LTS

第一阶段不需要配置环境变量。

## 预览环境验收

Cloudflare Pages 预览部署完成后，在预览域名检查这些路径：

- `/`
- `/archive/`
- `/tags/`
- `/search/`
- `/posts/understand-ethereum-abi-encode/`
- `/404.html`

需要确认：

- 首页和文章页使用新的研究笔记风格正常渲染。
- 搜索页可以加载，并能搜索中文关键词、英文关键词和标签词。
- 文章图片从 `/img/...` 正常加载。
- `sitemap-index.xml` 存在。
- `rss.xml` 不存在。
- 旧文章路径会跳转到新的 `/posts/<slug>/` 路径，例如：
  `/2023/02/07/Understand-Ethereum-ABI-Encode/`

## 生产切换

预览环境验收通过后：

1. 将迁移分支合并到生产分支。
2. 在 Cloudflare Pages 中把生产分支设置为合并后的分支。
3. 添加自定义域名 `jazzlost.me`。
4. 确认 Cloudflare 已创建所需 DNS 记录。
5. 等待 SSL 证书签发完成。
6. 验证 `https://jazzlost.me/` 和上面的抽样路径。

旧 GitHub Pages 的 `CNAME` 文件已经删除。生产域名配置以 Cloudflare
Pages 为准。

## 回滚

如果生产验收失败：

1. 如果 Cloudflare Pages 中已有上一个成功部署，先回滚到上一个成功部署。
2. 如果这是第一次 Cloudflare 部署，临时把 `jazzlost.me` 切回旧托管目标。
3. 保留迁移分支，修复问题后再重新切换生产流量。
