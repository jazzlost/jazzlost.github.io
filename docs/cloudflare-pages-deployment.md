# Cloudflare Pages Deployment

This checklist prepares the Astro migration for deployment on Cloudflare Pages.

## Project Setup

Create a Cloudflare Pages project from the GitHub repository:

- Repository: `jazzlost/jazzlost.github.io`
- Branch for preview validation: `codex/astro-cloudflare-pages-migration`
- Framework preset: Astro
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js version: current LTS

No environment variables are required for the first deployment.

## Preview Validation

After the preview deployment finishes, verify these URLs on the Cloudflare
preview domain:

- `/`
- `/archive/`
- `/tags/`
- `/search/`
- `/posts/understand-ethereum-abi-encode/`
- `/404.html`

Check that:

- The home page and article pages render with the new research-notes design.
- Search loads and returns results for Chinese, English, and tag keywords.
- Article images load from `/img/...`.
- `sitemap-index.xml` exists.
- `rss.xml` does not exist.
- A legacy article URL redirects to its new `/posts/<slug>/` path, for example:
  `/2023/02/07/Understand-Ethereum-ABI-Encode/`

## Production Cutover

When the preview is approved:

1. Merge the migration branch to the production branch.
2. In Cloudflare Pages, set the production branch to the merged branch.
3. Add the custom domain `jazzlost.me`.
4. Confirm Cloudflare creates the required DNS record.
5. Wait for SSL provisioning to complete.
6. Verify `https://jazzlost.me/` and the sample URLs above.

The old GitHub Pages `CNAME` file has been removed. Cloudflare Pages is the
source of truth for the production custom domain.

## Rollback

If production validation fails:

1. In Cloudflare Pages, roll back to the previous successful deployment if one
   exists.
2. If this is the first Cloudflare deployment, temporarily move `jazzlost.me`
   back to the previous hosting target.
3. Keep the migration branch open and fix the issue before reattempting the
   cutover.
