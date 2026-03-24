'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, Zap, Check, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { cn } from '@/lib/utils';

type Locale = 'ru' | 'pl' | 'ua' | 'en';

const languages: { code: Locale; flag: string; name: string }[] = [
  { code: 'ru', flag: '🇷🇺', name: 'Русский' },
  { code: 'pl', flag: '🇵🇱', name: 'Polski' },
  { code: 'ua', flag: '🇺🇦', name: 'Українська' },
  { code: 'en', flag: '🇬🇧', name: 'English' },
];

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { test: password.length >= 8, label: '8+ characters' },
    { test: /[A-Z]/.test(password), label: 'Uppercase letter' },
    { test: /[0-9]/.test(password), label: 'Number' },
    { test: /[^A-Za-z0-9]/.test(password), label: 'Special character' },
  ];

  const strength = checks.filter((c) => c.test).length;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              level <= strength
                ? strength <= 1
                  ? 'bg-red-500'
                  : strength <= 2
                  ? 'bg-amber-500'
                  : strength <= 3
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
                : 'bg-slate-200 dark:bg-slate-700'
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {checks.map((check, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <Check
              className={cn(
                'h-3 w-3 transition-colors',
                check.test ? 'text-green-400' : 'text-slate-600'
              )}
            />
            <span
              className={cn(
                'text-[10px] transition-colors',
                check.test ? 'text-slate-400' : 'text-slate-600'
              )}
            >
              {check.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const t = useTranslations('auth.register');
  const router = useRouter();
  const params = useParams();
  const locale = params['locale'] as string;
  const { setUser, setAccessToken } = useAuthStore();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    language: locale as Locale,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  function handleChange(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setUser({
        id: Date.now().toString(),
        name: form.name,
        email: form.email,
        plan: 'free',
        language: form.language,
        createdAt: new Date().toISOString(),
      });
      setAccessToken(`token-${Date.now()}`);
      router.push(`/${form.language}/analytics`);
    } catch {
      setError('Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleGoogleRegister() {
    setUser({
      id: Date.now().toString(),
      name: 'Google User',
      email: 'google@example.com',
      plan: 'free',
      language: locale as Locale,
      createdAt: new Date().toISOString(),
    });
    setAccessToken(`token-google-${Date.now()}`);
    router.push(`/${locale}/analytics`);
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex items-start sm:items-center justify-center p-4 py-6 sm:py-8">
      <div className="w-full max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href={`/${locale}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-bg">
              <Zap className="h-4 w-4 text-slate-900 dark:text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white text-lg">
              Ecom<span className="text-brand-400">Pilot</span>
            </span>
          </Link>
          <LanguageSwitcher compact />
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 sm:p-6 md:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-1">{t('title')}</h1>
            <p className="text-sm text-slate-400 dark:text-slate-500 dark:text-slate-400">{t('subtitle')}</p>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/30 p-3">
              <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Google Button */}
          <button
            onClick={handleGoogleRegister}
            className="mb-5 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-200 dark:bg-slate-700 hover:text-slate-900 dark:text-white transition-all duration-200"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {t('google')}
          </button>

          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-slate-50 dark:bg-slate-900 px-3 text-slate-400 dark:text-slate-500">{t('orContinueWith')}</span>
            </div>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="name">{t('name')}</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder={t('namePlaceholder')}
                autoComplete="name"
                required
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder={t('emailPlaceholder')}
                autoComplete="email"
                required
              />
            </div>

            {/* Language */}
            <div className="space-y-1.5">
              <Label>{t('language')}</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => handleChange('language', lang.code)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border py-2 px-1 text-xs transition-all duration-200',
                      form.language === lang.code
                        ? 'border-brand-600/60 bg-brand-600/15 text-brand-600 dark:text-brand-300'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 hover:border-slate-500 dark:hover:border-slate-600 hover:text-slate-700 dark:hover:text-slate-300'
                    )}
                  >
                    <span className="text-lg">{lang.flag}</span>
                    <span className="font-medium leading-none">{lang.code.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="password">{t('password')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  placeholder={t('passwordPlaceholder')}
                  autoComplete="new-password"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {form.password && <PasswordStrength password={form.password} />}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => handleChange('confirmPassword', e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
                className={cn(
                  form.confirmPassword &&
                    form.password !== form.confirmPassword &&
                    'border-red-600/60 focus-visible:ring-red-600'
                )}
              />
            </div>

            <Button type="submit" disabled={isLoading} className="w-full" size="lg">
              {isLoading ? t('loading') : t('submit')}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
            {t('terms')}{' '}
            <Link href="#" className="text-brand-400 hover:text-brand-300 transition-colors">
              {t('termsLink')}
            </Link>
          </p>

          <p className="mt-4 text-center text-sm text-slate-400 dark:text-slate-500">
            {t('hasAccount')}{' '}
            <Link
              href={`/${locale}/login`}
              className="text-brand-400 hover:text-brand-300 font-medium transition-colors"
            >
              {t('login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
