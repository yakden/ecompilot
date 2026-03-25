'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, Zap, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const params = useParams();
  const locale = params['locale'] as string;
  const { setUser, setAccessToken } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    setError('');

    try {
      // Simulate login API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (email === 'test@test.com' && password === 'password') {
        setUser({
          id: '00000000-0000-0000-0000-000000000001',
          name: 'Test User',
          email,
          plan: 'pro',
          language: locale as 'ru' | 'pl' | 'ua' | 'en',
          createdAt: new Date().toISOString(),
        });
        setAccessToken('mock-token-12345');
        router.push(`/${locale}/analytics`);
      } else {
        setError('Invalid email or password. Try test@test.com / password');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleGoogleLogin() {
    setUser({
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Google User',
      email: 'google@example.com',
      plan: 'free',
      language: locale as 'ru' | 'pl' | 'ua' | 'en',
      createdAt: new Date().toISOString(),
    });
    setAccessToken('mock-google-token');
    router.push(`/${locale}/analytics`);
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col md:flex-row">
      {/* Left Panel - Form */}
      <div className="flex w-full md:max-w-md flex-col justify-center px-4 py-8 sm:px-8 sm:py-12 md:flex-none">
        <div className="w-full max-w-sm mx-auto md:mx-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-10">
            <Link href={`/${locale}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-bg">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-slate-900 dark:text-white text-lg">
                Ecom<span className="text-brand-400">Pilot</span>
              </span>
            </Link>
            <LanguageSwitcher compact />
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">{t('title')}</h1>
            <p className="text-slate-500 dark:text-slate-400">{t('subtitle')}</p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/30 p-3">
              <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Google OAuth Button */}
          <button
            onClick={handleGoogleLogin}
            className="mb-6 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-all duration-200"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {t('google')}
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white dark:bg-slate-950 px-3 text-slate-400 dark:text-slate-500">{t('orContinueWith')}</span>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t('password')}</Label>
                <Link
                  href="#"
                  className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                >
                  {t('forgotPassword')}
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('passwordPlaceholder')}
                  autoComplete="current-password"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full"
              size="lg"
            >
              {isLoading ? t('loading') : t('submit')}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {t('noAccount')}{' '}
            <Link
              href={`/${locale}/register`}
              className="text-brand-400 hover:text-brand-300 font-medium transition-colors"
            >
              {t('register')}
            </Link>
          </p>

          {/* Demo hint */}
          <div className="mt-6 rounded-lg bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-3">
            <p className="text-xs text-slate-500 text-center">
              Demo: <span className="text-slate-400 font-mono">test@test.com</span> /{' '}
              <span className="text-slate-400 font-mono">password</span>
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel - Visual */}
      <div className="hidden md:flex flex-1 items-center justify-center relative overflow-hidden bg-slate-50 border-l border-slate-200 dark:bg-slate-900 dark:border-slate-800">
        <div className="absolute inset-0">
          <div className="absolute top-20 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-brand-600/15 blur-3xl" />
          <div className="absolute bottom-20 right-20 h-64 w-64 rounded-full bg-accent-500/10 blur-3xl" />
        </div>

        <div className="relative z-10 text-center px-12 max-w-md">
          <div className="mb-8 flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl gradient-bg glow-brand">
              <Zap className="h-10 w-10 text-white" />
            </div>
          </div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-4">
            Your marketplace{' '}
            <span className="gradient-text">command center</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
            Access all 12 modules: niche analysis, AI assistant, supplier search,
            margin calculator and more in one unified platform.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 text-left">
            {[
              { icon: '📊', text: 'Real-time niche analytics' },
              { icon: '🤖', text: 'GPT-4 AI consultant' },
              { icon: '🏭', text: '50,000+ verified suppliers' },
              { icon: '📈', text: 'Profit optimization tools' },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 dark:bg-slate-800/50 dark:border-slate-700 px-3 py-2">
                <span className="text-lg">{item.icon}</span>
                <span className="text-xs text-slate-600 dark:text-slate-300">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
