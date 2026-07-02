# jazzlost

Personal research notes built with Astro and deployed on Cloudflare Pages.

## Stack

- Astro static output
- Astro content collections for blog posts
- Pagefind for static search
- Cloudflare Pages Git integration for deployment

## Local Development

```powershell
npm install
npm run dev
```

## Build

```powershell
npm run build
```

The build output is `dist`. The build command runs `astro build` and then
generates the Pagefind index under `dist/pagefind`.

## Cloudflare Pages

Use these settings:

- Build command: `npm run build`
- Output directory: `dist`
- Production branch: the branch you choose for production after reviewing this migration
- Custom domain: `jazzlost.me`

The legacy GitHub Pages `CNAME` file is intentionally removed. Cloudflare Pages
is the production source of truth for custom-domain configuration.

## Content

Posts live in `src/content/blog`. Each post uses this front matter shape:

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

Public assets live in `public/img` and keep the old `/img/...` URL shape.

## Legacy URLs

Old Jekyll article URLs redirect to the new `/posts/<slug>/` URLs through
`public/_redirects`, which Cloudflare Pages copies into `dist/_redirects`.
