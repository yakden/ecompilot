'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BookOpen, Clock, Users, Play, Lock, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

interface Course {
  id: string;
  title: string;
  description: string;
  instructor: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  lessons: number;
  hours: number;
  students: number;
  rating: number;
  isPro: boolean;
  progress?: number;
  emoji: string;
  tags: string[];
}

const COURSES: Course[] = [
  {
    id: '1',
    title: 'Allegro Selling Mastery',
    description: 'Complete guide to selling on Allegro from zero to first 100 sales. Covers product research, listing optimization, and logistics.',
    instructor: 'Marek Kowalski',
    level: 'beginner',
    lessons: 24,
    hours: 8,
    students: 4231,
    rating: 4.9,
    isPro: false,
    progress: 65,
    emoji: '🏪',
    tags: ['Allegro', 'Listings', 'SEO'],
  },
  {
    id: '2',
    title: 'Amazon FBA Poland Launch',
    description: 'Step-by-step process to launch your first private label product on Amazon Poland. From product selection to first sale.',
    instructor: 'Anna Wiśniewska',
    level: 'intermediate',
    lessons: 36,
    hours: 14,
    students: 2876,
    rating: 4.8,
    isPro: true,
    emoji: '📦',
    tags: ['Amazon', 'FBA', 'Private Label'],
  },
  {
    id: '3',
    title: 'Chinese Supplier Negotiation',
    description: 'Advanced strategies for finding, vetting, and negotiating with Chinese manufacturers. Get the best prices and terms.',
    instructor: 'Piotr Mazur',
    level: 'advanced',
    lessons: 18,
    hours: 6,
    students: 1543,
    rating: 4.7,
    isPro: true,
    emoji: '🤝',
    tags: ['Suppliers', 'China', 'Negotiation'],
  },
  {
    id: '4',
    title: 'Pricing Strategy for Marketplaces',
    description: 'Data-driven pricing strategies to maximize profit while staying competitive. Includes dynamic pricing models.',
    instructor: 'Katarzyna Nowak',
    level: 'intermediate',
    lessons: 15,
    hours: 5,
    students: 3102,
    rating: 4.6,
    isPro: false,
    progress: 30,
    emoji: '💰',
    tags: ['Pricing', 'Strategy', 'Analytics'],
  },
  {
    id: '5',
    title: 'Product Photography Masterclass',
    description: 'Learn how to take marketplace-ready photos at home. Covers equipment, lighting, editing, and platform requirements.',
    instructor: 'Tomasz Lewandowski',
    level: 'beginner',
    lessons: 12,
    hours: 4,
    students: 5678,
    rating: 4.9,
    isPro: false,
    emoji: '📸',
    tags: ['Photography', 'Listings', 'Conversions'],
  },
  {
    id: '6',
    title: 'Scaling to 7-Figure Revenue',
    description: 'Advanced masterclass on scaling your marketplace business. Team building, automation, and multi-channel expansion.',
    instructor: 'Robert Zieliński',
    level: 'advanced',
    lessons: 42,
    hours: 18,
    students: 987,
    rating: 4.8,
    isPro: true,
    emoji: '🚀',
    tags: ['Scaling', 'Business', 'Automation'],
  },
];

const levelColors = {
  beginner: 'text-green-700 dark:text-green-300 border-green-300 dark:border-green-800/40 bg-green-100 dark:bg-green-900/20',
  intermediate: 'text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800/40 bg-amber-100 dark:bg-amber-900/20',
  advanced: 'text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800/40 bg-purple-100 dark:bg-purple-900/20',
};

export function AcademyClient() {
  const t = useTranslations('dashboard.academy');
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(
    new Set(COURSES.filter((c) => c.progress !== undefined).map((c) => c.id))
  );

  function toggleEnroll(id: string) {
    setEnrolledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">{t('allCourses')}</TabsTrigger>
          <TabsTrigger value="beginner">{t('beginner')}</TabsTrigger>
          <TabsTrigger value="intermediate">{t('intermediate')}</TabsTrigger>
          <TabsTrigger value="advanced">{t('advanced')}</TabsTrigger>
        </TabsList>

        {(['all', 'beginner', 'intermediate', 'advanced'] as const).map((tab) => {
          const courses = tab === 'all' ? COURSES : COURSES.filter((c) => c.level === tab);
          return (
            <TabsContent key={tab} value={tab} className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {courses.map((course) => {
                  const isEnrolled = enrolledIds.has(course.id);

                  return (
                    <div
                      key={course.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden group card-hover flex flex-col"
                    >
                      {/* Course Header */}
                      <div className="relative p-5 pb-4 bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800/60 dark:to-slate-900">
                        <div className="text-4xl mb-2">{course.emoji}</div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', levelColors[course.level])}>
                            {t(course.level)}
                          </span>
                          {course.isPro && (
                            <span className="flex items-center gap-1 rounded-full border border-brand-600/40 bg-brand-600/15 px-2 py-0.5 text-[10px] font-bold text-brand-600 dark:text-brand-300">
                              <Lock className="h-2.5 w-2.5" />
                              {t('pro')}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-snug mb-1 group-hover:text-brand-600 dark:group-hover:text-brand-300 transition-colors">
                          {course.title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">by {course.instructor}</p>
                      </div>

                      {/* Course Body */}
                      <div className="p-4 flex flex-col flex-1">
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3 flex-1">
                          {course.description}
                        </p>

                        {/* Stats */}
                        <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 mb-3">
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3.5 w-3.5" />
                            {course.lessons} {t('lessons')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {course.hours} {t('hours')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                            {course.rating}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 mb-3">
                          <Users className="h-3.5 w-3.5" />
                          {course.students.toLocaleString()} {t('students')}
                        </div>

                        {/* Progress (if enrolled) */}
                        {isEnrolled && course.progress !== undefined && (
                          <div className="mb-3">
                            <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mb-1">
                              <span>Progress</span>
                              <span>{course.progress}%</span>
                            </div>
                            <Progress value={course.progress} />
                          </div>
                        )}

                        {/* Tags */}
                        <div className="flex flex-wrap gap-1 mb-3">
                          {course.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-400"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        <Button
                          size="sm"
                          variant={isEnrolled ? 'secondary' : course.isPro ? 'outline' : 'default'}
                          className="w-full h-8 text-xs"
                          onClick={() => toggleEnroll(course.id)}
                        >
                          {isEnrolled ? (
                            <>
                              <Play className="mr-1.5 h-3 w-3" />
                              Continue
                            </>
                          ) : course.isPro ? (
                            <>
                              <Lock className="mr-1.5 h-3 w-3" />
                              Upgrade to Pro
                            </>
                          ) : (
                            t('enroll')
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
