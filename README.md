# jazzlost

个人研究笔记博客，使用 Astro 构建，并通过 Cloudflare Pages 部署。

## 技术栈

- Astro 静态输出
- Astro content collections 管理博客文章
- Pagefind 提供静态站内搜索
- Cloudflare Pages Git 集成部署

## 本地开发

```powershell
npm install
npm run dev
```

## 构建

```powershell
npm run build
```

构建产物输出到 `dist`。构建命令会先执行 `astro build`，再在
`dist/pagefind` 下生成 Pagefind 搜索索引。

## Cloudflare Pages

使用这些配置：

- 构建命令：`npm run build`
- 输出目录：`dist`
- 生产分支：完成迁移审核后选择的生产分支
- 自定义域名：`jazzlost.me`

旧 GitHub Pages 的 `CNAME` 文件已删除。生产自定义域名配置以 Cloudflare
Pages 为准。

预览验收、自定义域名切换和回滚步骤见
`docs/cloudflare-pages-deployment.md`。

## 内容

文章位于 `src/content/blog`。每篇文章使用下面的 front matter 结构：

```yaml
title: "Post title"
subtitle: "Optional subtitle"
date: 2023-02-07
author: "jazzlost"
published: true
headerImage: "/img/blog-bg-tree.jpg"
tags:
  - "Blockchain"
slug: "understand-ethereum-abi-encode"
```

公开资源位于 `public/img`，并保留旧站 `/img/...` 的 URL 结构。

## 旧链接

旧 Jekyll 文章路径通过 `public/_redirects` 跳转到新的 `/posts/<slug>/`
路径。Cloudflare Pages 会把它复制到 `dist/_redirects`。
