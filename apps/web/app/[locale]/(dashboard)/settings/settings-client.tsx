'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  User,
  Bell,
  Shield,
  CreditCard,
  Trash2,
  Check,
  Globe,
  Zap,
  Sparkles,
  Building2,
  LogOut,
  KeyRound,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  useIntegrations,
  useSaveIntegration,
  useDeleteIntegration,
  useTestIntegration,
  useAllegroAuthorize,
  type ServiceName,
  type IntegrationKeys,
} from '@/hooks/use-integrations';

type Locale = 'ru' | 'pl' | 'ua' | 'en';

const languages: { code: Locale; flag: string; name: string }[] = [
  { code: 'ru', flag: '🇷🇺', name: 'Русский' },
  { code: 'pl', flag: '🇵🇱', name: 'Polski' },
  { code: 'ua', flag: '🇺🇦', name: 'Українська' },
  { code: 'en', flag: '🇬🇧', name: 'English' },
];

const NOTIFICATION_KEYS = [
  { id: 'email_reports', labelKey: 'notifWeeklyReports', descKey: 'notifWeeklyReportsDesc' },
  { id: 'price_alerts', labelKey: 'notifPriceAlerts', descKey: 'notifPriceAlertsDesc' },
  { id: 'new_suppliers', labelKey: 'notifNewSuppliers', descKey: 'notifNewSuppliersDesc' },
  { id: 'community', labelKey: 'notifCommunity', descKey: 'notifCommunityDesc' },
  { id: 'platform_updates', labelKey: 'notifPlatformUpdates', descKey: 'notifPlatformUpdatesDesc' },
] as const;

type SettingsTab = 'profile' | 'integrations';

// ─────────────────────────────────────────────────────────────────────────────
// IntegrationsTab
// ─────────────────────────────────────────────────────────────────────────────

function IntegrationsTab() {
  const t = useTranslations('dashboard.integrations');
  const { data: integrations, isLoading } = useIntegrations();

  const findIntegration = (service: ServiceName) =>
    integrations?.find((i) => i.service === service) ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AllegroCard integration={findIntegration('allegro')} />
      <GoogleSearchCard integration={findIntegration('google_search')} />
      <OpenAiCard integration={findIntegration('openai')} />
      <StripeCard integration={findIntegration('stripe')} />

      {/* Security note */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
        <Lock className="h-3.5 w-3.5 shrink-0 text-green-500" />
        <span>{t('keysEncrypted')}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status indicator
// ─────────────────────────────────────────────────────────────────────────────

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full shrink-0',
        connected ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600',
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card wrapper
// ─────────────────────────────────────────────────────────────────────────────

function IntegrationCard({
  title,
  icon,
  connected,
  maskedKey,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  connected: boolean;
  maskedKey?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('dashboard.integrations');

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          {icon}
          <span className="font-semibold text-slate-900 dark:text-white text-sm">{title}</span>
          <StatusDot connected={connected} />
          <span className={cn('text-xs', connected ? 'text-green-500' : 'text-slate-400 dark:text-slate-500')}>
            {connected ? t('connected') : t('notConnected')}
          </span>
        </div>
        {maskedKey && connected && (
          <code className="text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded">
            {maskedKey}
          </code>
        )}
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test result inline
// ─────────────────────────────────────────────────────────────────────────────

function TestResult({ working, error }: { working: boolean; error?: string }) {
  const t = useTranslations('dashboard.integrations');
  if (working) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-500">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t('testSuccess')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-500">
      <XCircle className="h-3.5 w-3.5" />
      {t('testFailed')}{error ? `: ${error}` : ''}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Allegro card
// ─────────────────────────────────────────────────────────────────────────────

function AllegroCard({ integration }: { integration: ReturnType<typeof Array.prototype.find> | null }) {
  const t = useTranslations('dashboard.integrations');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ working: boolean; error?: string } | null>(null);

  const saveKeys = useSaveIntegration('allegro');
  const deleteInt = useDeleteIntegration('allegro');
  const authorize = useAllegroAuthorize();
  const testInt = useTestIntegration('allegro');

  const connected = !!integration?.isActive;
  const sellerName = integration?.metadata?.displayName ?? integration?.metadata?.connectedEmail;
  const expiresAt = integration?.metadata?.expiresAt;

  async function handleSaveCredentials() {
    if (!clientId && !clientSecret) return;
    const keys: IntegrationKeys = {};
    if (clientId) keys.clientId = clientId;
    if (clientSecret) keys.clientSecret = clientSecret;
    await saveKeys.mutateAsync(keys);
    setSaveFeedback(t('save'));
    setTimeout(() => setSaveFeedback(null), 2500);
  }

  async function handleConnect() {
    const result = await authorize.mutateAsync();
    window.open(result.authUrl, '_blank', 'noopener,noreferrer');
  }

  async function handleTest() {
    const result = await testInt.mutateAsync();
    setTestResult({ working: result.working, error: result.error });
  }

  async function handleDisconnect() {
    await deleteInt.mutateAsync();
  }

  return (
    <IntegrationCard
      title={t('allegro')}
      icon={<span className="text-base">🛒</span>}
      connected={connected}
      maskedKey={integration?.maskedKey}
    >
      <div className="space-y-3">
        {connected && sellerName ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <Badge variant="outline" className="border-green-500/40 text-green-600 dark:text-green-400 w-fit">
              {t('connectedAs')}: {sellerName}
            </Badge>
            {expiresAt && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                exp: {new Date(expiresAt).toLocaleDateString()}
              </span>
            )}
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('allegro')} Client ID</Label>
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="allegro-app-client-id"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('allegro')} Client Secret</Label>
            <Input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="••••••••••••••••"
              className="h-8 text-sm font-mono"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleSaveCredentials()}
            disabled={saveKeys.isPending}
          >
            {saveKeys.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
            {t('save')}
          </Button>

          <Button
            size="sm"
            onClick={() => void handleConnect()}
            disabled={authorize.isPending}
            className="gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {connected ? t('allegro') : t('connectAllegro')}
          </Button>

          {connected && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void handleTest()}
                disabled={testInt.isPending}
              >
                {testInt.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                {t('test')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => void handleDisconnect()}
                disabled={deleteInt.isPending}
              >
                {t('disconnect')}
              </Button>
            </>
          )}

          {saveFeedback && (
            <span className="text-xs text-green-500 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {saveFeedback}
            </span>
          )}
          {testResult && <TestResult working={testResult.working} error={testResult.error} />}
        </div>
      </div>
    </IntegrationCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Search card
// ─────────────────────────────────────────────────────────────────────────────

function GoogleSearchCard({ integration }: { integration: ReturnType<typeof Array.prototype.find> | null }) {
  const t = useTranslations('dashboard.integrations');
  const [apiKey, setApiKey] = useState('');
  const [cx, setCx] = useState('');
  const [testResult, setTestResult] = useState<{ working: boolean; error?: string } | null>(null);
  const [saveFeedback, setSaveFeedback] = useState(false);

  const saveKeys = useSaveIntegration('google_search');
  const deleteInt = useDeleteIntegration('google_search');
  const testInt = useTestIntegration('google_search');

  const connected = !!integration?.isActive;

  async function handleSave() {
    if (!apiKey) return;
    const keys: IntegrationKeys = { apiKey };
    if (cx) keys.searchEngineId = cx;
    await saveKeys.mutateAsync(keys);
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 2500);
  }

  async function handleTest() {
    const result = await testInt.mutateAsync();
    setTestResult({ working: result.working, error: result.error });
  }

  return (
    <IntegrationCard
      title={t('googleSearch')}
      icon={<span className="text-base">🔍</span>}
      connected={connected}
      maskedKey={integration?.maskedKey}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('apiKey')} (SerpAPI or Google CSE)</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="••••••••••••••••"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('searchEngineId')} (CX) — optional</Label>
            <Input
              value={cx}
              onChange={(e) => setCx(e.target.value)}
              placeholder="017576662512468239146:omuauf_lfve"
              className="h-8 text-sm font-mono"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void handleSave()} disabled={saveKeys.isPending || !apiKey}>
            {saveKeys.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
            {t('save')}
          </Button>
          {connected && (
            <>
              <Button size="sm" variant="outline" onClick={() => void handleTest()} disabled={testInt.isPending}>
                {testInt.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                {t('test')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => void deleteInt.mutateAsync()}
                disabled={deleteInt.isPending}
              >
                {t('disconnect')}
              </Button>
            </>
          )}
          {saveFeedback && (
            <span className="text-xs text-green-500 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('save')}
            </span>
          )}
          {testResult && <TestResult working={testResult.working} error={testResult.error} />}
        </div>
      </div>
    </IntegrationCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI card
// ─────────────────────────────────────────────────────────────────────────────

function OpenAiCard({ integration }: { integration: ReturnType<typeof Array.prototype.find> | null }) {
  const t = useTranslations('dashboard.integrations');
  const [apiKey, setApiKey] = useState('');
  const [testResult, setTestResult] = useState<{ working: boolean; error?: string } | null>(null);
  const [saveFeedback, setSaveFeedback] = useState(false);

  const saveKeys = useSaveIntegration('openai');
  const deleteInt = useDeleteIntegration('openai');
  const testInt = useTestIntegration('openai');

  const connected = !!integration?.isActive;

  async function handleSave() {
    if (!apiKey) return;
    await saveKeys.mutateAsync({ apiKey });
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 2500);
  }

  async function handleTest() {
    const result = await testInt.mutateAsync();
    setTestResult({ working: result.working, error: result.error });
  }

  return (
    <IntegrationCard
      title={t('openai')}
      icon={<span className="text-base">🤖</span>}
      connected={connected}
      maskedKey={integration?.maskedKey}
    >
      <div className="space-y-3">
        <div className="space-y-1.5 max-w-sm">
          <Label className="text-xs">{t('apiKey')} (sk-...)</Label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-••••••••••••••••••••••••••••••••"
            className="h-8 text-sm font-mono"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void handleSave()} disabled={saveKeys.isPending || !apiKey}>
            {saveKeys.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
            {t('save')}
          </Button>
          {connected && (
            <>
              <Button size="sm" variant="outline" onClick={() => void handleTest()} disabled={testInt.isPending}>
                {testInt.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                {t('test')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => void deleteInt.mutateAsync()}
                disabled={deleteInt.isPending}
              >
                {t('disconnect')}
              </Button>
            </>
          )}
          {saveFeedback && (
            <span className="text-xs text-green-500 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('save')}
            </span>
          )}
          {testResult && <TestResult working={testResult.working} error={testResult.error} />}
        </div>
      </div>
    </IntegrationCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe card
// ─────────────────────────────────────────────────────────────────────────────

function StripeCard({ integration }: { integration: ReturnType<typeof Array.prototype.find> | null }) {
  const t = useTranslations('dashboard.integrations');
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [testResult, setTestResult] = useState<{ working: boolean; error?: string } | null>(null);
  const [saveFeedback, setSaveFeedback] = useState(false);

  const saveKeys = useSaveIntegration('stripe');
  const deleteInt = useDeleteIntegration('stripe');
  const testInt = useTestIntegration('stripe');

  const connected = !!integration?.isActive;

  async function handleSave() {
    if (!secretKey) return;
    const keys: IntegrationKeys = { apiKey: secretKey };
    if (webhookSecret) keys.webhookSecret = webhookSecret;
    await saveKeys.mutateAsync(keys);
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 2500);
  }

  async function handleTest() {
    const result = await testInt.mutateAsync();
    setTestResult({ working: result.working, error: result.error });
  }

  return (
    <IntegrationCard
      title={t('stripe')}
      icon={<span className="text-base">💳</span>}
      connected={connected}
      maskedKey={integration?.maskedKey}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('secretKey')} (sk_test_... / sk_live_...)</Label>
            <Input
              type="password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder="sk_test_••••••••••••••••"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('webhookSecret')} (whsec_...)</Label>
            <Input
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="whsec_••••••••••••••••"
              className="h-8 text-sm font-mono"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void handleSave()} disabled={saveKeys.isPending || !secretKey}>
            {saveKeys.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
            {t('save')}
          </Button>
          {connected && (
            <>
              <Button size="sm" variant="outline" onClick={() => void handleTest()} disabled={testInt.isPending}>
                {testInt.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                {t('test')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => void deleteInt.mutateAsync()}
                disabled={deleteInt.isPending}
              >
                {t('disconnect')}
              </Button>
            </>
          )}
          {saveFeedback && (
            <span className="text-xs text-green-500 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('save')}
            </span>
          )}
          {testResult && <TestResult working={testResult.working} error={testResult.error} />}
        </div>
      </div>
    </IntegrationCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main SettingsClient
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsClient() {
  const t = useTranslations('dashboard.settings');
  const tIntegrations = useTranslations('dashboard.integrations');
  const locale = useLocale();
  const router = useRouter();
  const { user, setUser, updateLanguage, logout } = useAuthStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [selectedLang, setSelectedLang] = useState<Locale>((user?.language ?? locale) as Locale);
  const [enabledNotifs, setEnabledNotifs] = useState<Set<string>>(
    new Set(['email_reports', 'price_alerts', 'platform_updates'])
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setSelectedLang((user.language ?? locale) as Locale);
    }
  }, [user, locale]);

  function handleSave() {
    if (!user) return;
    setUser({ ...user, name, email, language: selectedLang });
    updateLanguage(selectedLang);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);

    if (selectedLang !== locale) {
      router.push(`/${selectedLang}/settings`);
    }
  }

  function toggleNotif(id: string) {
    setEnabledNotifs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const planConfig = {
    free: { icon: <Zap className="h-4 w-4" />, color: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-200 dark:bg-slate-800' },
    pro: { icon: <Sparkles className="h-4 w-4 text-brand-400" />, color: 'text-brand-600 dark:text-brand-300', bg: 'bg-brand-600/15 border border-brand-600/30' },
    business: { icon: <Building2 className="h-4 w-4 text-amber-400" />, color: 'text-amber-600 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700/30' },
  };

  const plan = user?.plan ?? 'free';
  const planInfo = planConfig[plan];

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: t('title'), icon: <User className="h-4 w-4" /> },
    { id: 'integrations', label: tIntegrations('title'), icon: <KeyRound className="h-4 w-4" /> },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-4 md:space-y-6">
      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 flex-1 justify-center rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200',
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'integrations' ? (
        <IntegrationsTab />
      ) : (
        <>
          {/* Profile Section */}
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-200 dark:border-slate-700 dark:bg-slate-900 p-6">
            <div className="flex items-center gap-2 mb-5">
              <User className="h-4 w-4 text-brand-400" />
              <h2 className="font-semibold text-slate-900 dark:text-white">{t('profile')}</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">{t('name')}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">{t('email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                />
              </div>

              {/* Language */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 dark:text-slate-400" />
                  <Label>{t('language')}</Label>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setSelectedLang(lang.code)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs transition-all duration-200',
                        selectedLang === lang.code
                          ? 'border-brand-600/60 bg-brand-600/15 text-brand-600 dark:text-brand-300'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 hover:border-slate-500 dark:hover:border-slate-600 hover:text-slate-800 dark:hover:text-slate-200'
                      )}
                    >
                      <span className="text-xl">{lang.flag}</span>
                      <span className="font-medium">{lang.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <Button onClick={handleSave}>
                {saved ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    {t('saved')}
                  </>
                ) : (
                  t('save')
                )}
              </Button>
              {saved && (
                <span className="text-sm text-green-400 animate-fade-in">{t('savedSuccess')}</span>
              )}
            </div>
          </div>

          {/* Current Plan */}
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-200 dark:border-slate-700 dark:bg-slate-900 p-6">
            <div className="flex items-center gap-2 mb-5">
              <CreditCard className="h-4 w-4 text-brand-400" />
              <h2 className="font-semibold text-slate-900 dark:text-white">{t('plan')}</h2>
            </div>

            <div className={cn('flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl p-4 mb-4', planInfo.bg)}>
              <div className="flex items-center gap-3">
                {planInfo.icon}
                <div>
                  <p className={cn('font-bold text-sm', planInfo.color)}>
                    {plan.toUpperCase()} Plan
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {plan === 'free' && t('planFreeDesc')}
                    {plan === 'pro' && t('planProDesc')}
                    {plan === 'business' && t('planBusinessDesc')}
                  </p>
                </div>
              </div>
              {plan === 'free' && (
                <Button size="sm" className="shrink-0">
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  {t('upgradePlan')}
                </Button>
              )}
            </div>
          </div>

          {/* Notifications */}
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-200 dark:border-slate-700 dark:bg-slate-900 p-6">
            <div className="flex items-center gap-2 mb-5">
              <Bell className="h-4 w-4 text-brand-400" />
              <h2 className="font-semibold text-slate-900 dark:text-white">{t('notifications')}</h2>
            </div>

            <div className="space-y-1">
              {NOTIFICATION_KEYS.map((notif) => (
                <div
                  key={notif.id}
                  className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 dark:border-slate-100 dark:border-slate-800 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t(notif.labelKey)}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t(notif.descKey)}</p>
                  </div>
                  <button
                    onClick={() => toggleNotif(notif.id)}
                    className={cn(
                      'relative h-5 w-9 rounded-full transition-colors duration-200 shrink-0 ml-4',
                      enabledNotifs.has(notif.id) ? 'bg-brand-600' : 'bg-slate-700'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
                        enabledNotifs.has(notif.id) ? 'translate-x-4' : 'translate-x-0.5'
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Security */}
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-200 dark:border-slate-700 dark:bg-slate-900 p-6">
            <div className="flex items-center gap-2 mb-5">
              <Shield className="h-4 w-4 text-brand-400" />
              <h2 className="font-semibold text-slate-900 dark:text-white">{t('security')}</h2>
            </div>

            <div className="space-y-3">
              <Button variant="outline" className="w-full justify-start">
                <Shield className="mr-2 h-4 w-4 text-slate-400 dark:text-slate-500 dark:text-slate-400" />
                {t('changePassword')}
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-300"
                onClick={() => {
                  logout();
                  router.push(`/${locale}`);
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t('signOutAll')}
              </Button>
              <Separator className="my-2" />
              <Button
                variant="ghost"
                className="w-full justify-start text-red-500 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('deleteAccount')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
