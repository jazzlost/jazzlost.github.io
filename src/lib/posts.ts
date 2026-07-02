import { getCollection, type CollectionEntry } from 'astro:content';

export type BlogPost = CollectionEntry<'blog'>;

export async function getPublishedPosts() {
  const posts = await getCollection('blog', ({ data }) => data.published !== false);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function getPostPath(post: BlogPost) {
  return `/posts/${post.data.slug}/`;
}

export function getTagPath(tag: string) {
  return `/tags/${slugifyTag(tag)}/`;
}

export function slugifyTag(tag: string) {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getAllTags(posts: BlogPost[]) {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function getPostsByYear(posts: BlogPost[]) {
  const years = new Map<number, BlogPost[]>();
  for (const post of posts) {
    const year = post.data.date.getFullYear();
    years.set(year, [...(years.get(year) ?? []), post]);
  }

  return [...years.entries()].sort((a, b) => b[0] - a[0]);
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function excerpt(post: BlogPost, length = 140) {
  const body = 'body' in post ? post.body : '';
  return body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[[^\]]+]\([^)]+\)/g, '$1')
    .replace(/[#*_>`-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, length);
}
