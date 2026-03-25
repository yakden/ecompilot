'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MessageSquare, Heart, Eye, Plus, Pin, TrendingUp, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface Post {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  category: string;
  categoryColor: string;
  replies: number;
  views: number;
  likes: number;
  isPinned?: boolean;
  isHot?: boolean;
  timeAgo: string;
  avatar: string;
  liked: boolean;
}

const POSTS: Post[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    title: 'How I went from 0 to 50k PLN monthly on Allegro in 8 months — my strategy',
    excerpt: 'After 8 months of trial and error, I finally cracked the code on Allegro. Here is my full breakdown including which niches work best in Q4...',
    author: 'Marek K.',
    category: 'Success Stories',
    categoryColor: 'success',
    replies: 47,
    views: 3241,
    likes: 234,
    isPinned: true,
    isHot: true,
    timeAgo: '2h ago',
    avatar: 'M',
    liked: false,
  },
  {
    id: '2',
    title: 'Best Chinese suppliers for phone accessories — my vetted list of 15 manufacturers',
    excerpt: 'I spent 3 months testing suppliers on Alibaba and 1688. Here are the 15 I actually trust with my business, including MOQs and contact info...',
    author: 'Anna W.',
    category: 'Suppliers',
    categoryColor: 'info',
    replies: 89,
    views: 5672,
    likes: 456,
    isHot: true,
    timeAgo: '5h ago',
    avatar: 'A',
    liked: true,
  },
  {
    id: '3',
    title: 'Amazon Poland vs Allegro — honest comparison after 2 years selling on both',
    excerpt: 'A lot of people ask me which platform is better. The honest answer is: it depends. Let me break down margins, competition, and logistics...',
    author: 'Piotr M.',
    category: 'Strategy',
    categoryColor: 'warning',
    replies: 63,
    views: 4128,
    likes: 312,
    timeAgo: '1d ago',
    avatar: 'P',
    liked: false,
  },
  {
    id: '4',
    title: 'VAT OSS registration guide for marketplace sellers — 2026 update',
    excerpt: 'New rules came into effect this year. If you are selling cross-border within EU, you need to understand OSS registration. This guide covers...',
    author: 'Katarzyna N.',
    category: 'Legal & Finance',
    categoryColor: 'default',
    replies: 28,
    views: 2341,
    likes: 187,
    isPinned: true,
    timeAgo: '3d ago',
    avatar: 'K',
    liked: false,
  },
  {
    id: '5',
    title: 'Getting your first 100 reviews on Allegro — ethical strategies that work',
    excerpt: 'Reviews are everything on Allegro. Here is how I got my first 100 reviews in 30 days without violating any platform rules...',
    author: 'Robert Z.',
    category: 'Listings',
    categoryColor: 'info',
    replies: 34,
    views: 1876,
    likes: 143,
    timeAgo: '4d ago',
    avatar: 'R',
    liked: false,
  },
];

const CATEGORY_KEYS = [
  { key: 'all', value: 'All' },
  { key: 'catSuccessStories', value: 'Success Stories' },
  { key: 'catSuppliers', value: 'Suppliers' },
  { key: 'catStrategy', value: 'Strategy' },
  { key: 'catListings', value: 'Listings' },
  { key: 'catLegalFinance', value: 'Legal & Finance' },
] as const;

const CATEGORY_I18N_MAP: Record<string, 'catSuccessStories' | 'catSuppliers' | 'catStrategy' | 'catListings' | 'catLegalFinance'> = {
  'Success Stories': 'catSuccessStories',
  'Suppliers': 'catSuppliers',
  'Strategy': 'catStrategy',
  'Listings': 'catListings',
  'Legal & Finance': 'catLegalFinance',
};

export function CommunityClient() {
  const t = useTranslations('dashboard.community');
  const [posts, setPosts] = useState<Post[]>(POSTS);
  const [selectedCategory, setSelectedCategory] = useState('All');

  function toggleLike(id: string) {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, liked: !p.liked, likes: p.liked ? p.likes - 1 : p.likes + 1 }
          : p
      )
    );
  }

  const filtered =
    selectedCategory === 'All'
      ? posts
      : posts.filter((p) => p.category === selectedCategory);

  return (
    <div className="space-y-5">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {CATEGORY_KEYS.map(({ key, value }) => (
            <button
              key={value}
              onClick={() => setSelectedCategory(value)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                selectedCategory === value
                  ? 'border-brand-600/60 bg-brand-600/15 text-brand-600 dark:text-brand-300'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              )}
            >
              {key === 'all' ? t('allCategories') : t(key)}
            </button>
          ))}
        </div>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          {t('newPost')}
        </Button>
      </div>

      <Tabs defaultValue="popular">
        <TabsList>
          <TabsTrigger value="popular">
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
            {t('popular')}
          </TabsTrigger>
          <TabsTrigger value="recent">
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            {t('recent')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="popular" className="mt-4">
          <div className="space-y-3">
            {filtered
              .sort((a, b) => b.likes - a.likes)
              .map((post) => (
                <PostCard key={post.id} post={post} onLike={toggleLike} t={t} />
              ))}
          </div>
        </TabsContent>

        <TabsContent value="recent" className="mt-4">
          <div className="space-y-3">
            {filtered.map((post) => (
              <PostCard key={post.id} post={post} onLike={toggleLike} t={t} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PostCard({
  post,
  onLike,
  t,
}: {
  post: Post;
  onLike: (id: string) => void;
  t: ReturnType<typeof useTranslations<'dashboard.community'>>;
}) {
  const badgeVariant = post.categoryColor as 'default' | 'success' | 'info' | 'warning';
  const categoryKey = CATEGORY_I18N_MAP[post.category];
  const categoryLabel = categoryKey ? t(categoryKey) : post.category;

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-200 dark:border-slate-700 dark:bg-slate-900 p-5 card-hover group cursor-pointer">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600/20 border border-brand-600/30 mt-0.5">
          <span className="text-sm font-bold text-brand-600 dark:text-brand-300">{post.avatar}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {post.isPinned && (
              <Pin className="h-3.5 w-3.5 text-brand-400 shrink-0" />
            )}
            <Badge variant={badgeVariant} className="text-[10px]">
              {categoryLabel}
            </Badge>
            {post.isHot && (
              <span className="text-[10px] text-orange-400 font-semibold">🔥 {t('hot')}</span>
            )}
          </div>

          <h3 className="font-semibold text-slate-900 dark:text-white text-sm leading-snug mb-1.5 group-hover:text-brand-600 dark:group-hover:text-brand-300 transition-colors line-clamp-2">
            {post.title}
          </h3>

          <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed mb-3 line-clamp-2">
            {post.excerpt}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400 dark:text-slate-500">
            <span className="font-medium text-slate-400 dark:text-slate-500 dark:text-slate-400">{post.author}</span>
            <span>{post.timeAgo}</span>

            <div className="flex items-center gap-3 sm:ml-auto">
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                {post.replies} {t('replies')}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                {post.views.toLocaleString()} {t('views')}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onLike(post.id);
                }}
                className={cn(
                  'flex items-center gap-1 transition-colors',
                  post.liked ? 'text-red-400' : 'hover:text-red-400'
                )}
              >
                <Heart
                  className={cn('h-3.5 w-3.5', post.liked && 'fill-red-400')}
                />
                {post.likes}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
