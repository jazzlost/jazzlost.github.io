import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPostPath, getPublishedPosts } from '@/lib/posts';
import { site } from '@/lib/site';

export async function GET(context: APIContext) {
  const posts = await getPublishedPosts();

  return rss({
    title: site.title,
    description: site.description,
    site: context.site ?? site.url,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.subtitle ?? '',
      pubDate: post.data.date,
      link: getPostPath(post),
      categories: post.data.tags,
    })),
  });
}
