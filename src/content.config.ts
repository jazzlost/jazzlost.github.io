import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    date: z.coerce.date(),
    author: z.string().default('jazzlost'),
    published: z.boolean().default(true),
    headerImage: z.string().optional(),
    tags: z.array(z.string()).default([]),
    slug: z.string(),
  }),
});

export const collections = { blog };
