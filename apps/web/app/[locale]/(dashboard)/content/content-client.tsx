'use client';

import { useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Image as ImageIcon,
  FileText,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Sparkles,
  Copy,
  Check,
  X,
  Barcode,
  Search,
  Tag,
  Layers,
  Wheat,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/stores/auth.store';
import { ApiClientError } from '@/lib/api';
import { useBarcodeLookup, type BarcodeLookupResult, type Nutriments } from '@/hooks/use-product-lookup';

type ContentTab = 'thumbnail' | 'description' | 'barcode';

interface ThumbnailJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  imageUrl?: string;
  error?: string;
}

interface DescriptionResult {
  title: string;
  description: string;
  bulletPoints: string[];
  tags: string[];
}

// ---- Thumbnail Generator ----
function ThumbnailGenerator() {
  const { user, accessToken } = useAuthStore();
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [job, setJob] = useState<ThumbnailJob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file (JPG, PNG, WEBP)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File too large. Maximum 10MB.');
      return;
    }
    setSelectedFile(file);
    setUploadError(null);
    setJob(null);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function startPolling(jobId: string) {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const headers: Record<string, string> = {};
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
        if (user?.id) headers['x-user-id'] = user.id;

        const response = await fetch(`/api/v1/content/thumbnails/status/${jobId}`, { headers });
        if (!response.ok) return;

        const data = await response.json() as ThumbnailJob;
        setJob(data);

        if (data.status === 'completed' || data.status === 'failed') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        }
      } catch {
        // polling errors are silent
      }
    }, 2000);
  }

  async function handleGenerate() {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('image', selectedFile);

      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      if (user?.id) headers['x-user-id'] = user.id;

      const response = await fetch('/api/v1/content/thumbnails/generate', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP Error ${response.status}` })) as { message?: string };
        throw new ApiClientError(response.status, errorData.message ?? 'Upload failed');
      }

      const data = await response.json() as { jobId: string };
      setJob({ jobId: data.jobId, status: 'pending' });
      startPolling(data.jobId);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function handleReset() {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setSelectedFile(null);
    setPreviewUrl(null);
    setJob(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const isProcessing = job?.status === 'pending' || job?.status === 'processing';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Upload Panel */}
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-5">
          <div className="flex items-center gap-2 mb-4">
            <ImageIcon className="h-4 w-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Product Image</h3>
          </div>

          {!selectedFile ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 md:p-10 cursor-pointer transition-all',
                dragOver
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800/50'
              )}
            >
              <Upload className="h-8 w-8 text-slate-400 dark:text-slate-500 mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                Drop image here or <span className="text-brand-400">click to upload</span>
              </p>
              <p className="text-xs text-slate-600 mt-1">JPG, PNG, WEBP up to 10MB</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl ?? ''}
                  alt="Preview"
                  className="w-full h-48 object-cover"
                />
                <button
                  onClick={handleReset}
                  className="absolute top-2 right-2 rounded-full bg-slate-900/80 p-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{selectedFile.name}</p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {uploadError && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {uploadError}
            </div>
          )}

          <Button
            onClick={() => void handleGenerate()}
            className="w-full mt-4"
            disabled={!selectedFile || uploading || isProcessing}
          >
            {uploading || isProcessing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {uploading ? 'Uploading...' : 'Generating...'}
              </>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" />Generate Thumbnail</>
            )}
          </Button>
        </div>
      </div>

      {/* Result Panel */}
      <div className="space-y-4">
        {job && (
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-5">
            <div className="flex items-center gap-2 mb-4">
              {job.status === 'completed'
                ? <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                : job.status === 'failed'
                  ? <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  : <Loader2 className="h-4 w-4 text-brand-400 animate-spin" />
              }
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {job.status === 'completed' ? 'Thumbnail Ready'
                  : job.status === 'failed' ? 'Generation Failed'
                    : job.status === 'processing' ? 'Processing...'
                      : 'In Queue...'}
              </h3>
            </div>

            {job.status === 'completed' && job.imageUrl && (
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={job.imageUrl}
                  alt="Generated thumbnail"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700"
                />
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 gap-2" asChild>
                    <a href={job.imageUrl} download="thumbnail.jpg">
                      <Upload className="h-3.5 w-3.5" />
                      Download
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleReset} className="gap-2">
                    <RefreshCw className="h-3.5 w-3.5" />
                    New
                  </Button>
                </div>
              </div>
            )}

            {job.status === 'failed' && (
              <div className="text-sm text-red-600 dark:text-red-400">
                {job.error ?? 'Generation failed. Please try again.'}
              </div>
            )}

            {isProcessing && (
              <div className="space-y-2">
                <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-brand-600 animate-pulse w-2/3" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">AI is processing your image...</p>
              </div>
            )}
          </div>
        )}

        {!job && !selectedFile && (
          <div className="flex flex-col items-center justify-center h-64 text-center rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/50">
            <ImageIcon className="h-12 w-12 text-slate-700 mb-3" />
            <p className="text-slate-400 dark:text-slate-500 text-sm">Upload a product image</p>
            <p className="text-slate-600 text-xs mt-1">to generate a professional thumbnail</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Description Generator ----
function DescriptionGenerator() {
  const { user, accessToken } = useAuthStore();
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('');
  const [keywords, setKeywords] = useState('');
  const [targetPlatform, setTargetPlatform] = useState('allegro');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<DescriptionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = useCallback(async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  async function handleGenerate() {
    if (!productName.trim()) return;
    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      if (user?.id) headers['x-user-id'] = user.id;
      if (user?.plan) headers['x-user-plan'] = user.plan;

      const response = await fetch('/api/v1/content/descriptions/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          productName: productName.trim(),
          category: category.trim() || undefined,
          keywords: keywords.trim() ? keywords.split(',').map((k) => k.trim()).filter(Boolean) : undefined,
          platform: targetPlatform,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP Error ${response.status}` })) as { message?: string };
        throw new ApiClientError(response.status, errorData.message ?? 'Generation failed');
      }

      const data = await response.json() as DescriptionResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Input Form */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-5">
        <div className="flex items-center gap-2 mb-5">
          <FileText className="h-4 w-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Product Details</h3>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="productName">Product Name *</Label>
            <Input
              id="productName"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Wireless Bluetooth Headphones"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Electronics, Audio"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="keywords">Keywords (comma-separated)</Label>
            <Input
              id="keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="wireless, noise-canceling, 30h battery"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Target Platform</Label>
            <div className="grid grid-cols-3 gap-2">
              {['allegro', 'amazon', 'olx'].map((p) => (
                <button
                  key={p}
                  onClick={() => setTargetPlatform(p)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-all',
                    targetPlatform === p
                      ? 'border-brand-600/60 bg-brand-600/15 text-brand-600 dark:text-brand-300'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={() => void handleGenerate()}
            className="w-full"
            disabled={generating || !productName.trim()}
          >
            {generating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" />Generate Description</>
            )}
          </Button>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {result && (
          <>
            {/* Title */}
            <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Title</span>
                <button
                  onClick={() => void copyToClipboard(result.title, 'title')}
                  className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  {copiedField === 'title' ? (
                    <Check className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <p className="text-sm text-slate-900 dark:text-white font-medium">{result.title}</p>
            </div>

            {/* Description */}
            <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Description</span>
                <button
                  onClick={() => void copyToClipboard(result.description, 'description')}
                  className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  {copiedField === 'description' ? (
                    <Check className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{result.description}</p>
            </div>

            {/* Bullet Points */}
            {result.bulletPoints.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Bullet Points</span>
                  <button
                    onClick={() => void copyToClipboard(result.bulletPoints.join('\n'), 'bullets')}
                    className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  >
                    {copiedField === 'bullets' ? (
                      <Check className="h-3.5 w-3.5 text-green-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <ul className="space-y-1">
                  {result.bulletPoints.map((point, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tags */}
            {result.tags.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {result.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-brand-200 bg-brand-50 dark:border-brand-700/40 dark:bg-brand-950/30 px-2 py-0.5 text-[11px] text-brand-600 dark:text-brand-300">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!result && !error && (
          <div className="flex flex-col items-center justify-center h-64 text-center rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/50">
            <FileText className="h-12 w-12 text-slate-700 mb-3" />
            <p className="text-slate-400 dark:text-slate-500 text-sm">Fill in product details</p>
            <p className="text-slate-600 text-xs mt-1">to generate optimized content</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Nutri-Score Badge
// ─────────────────────────────────────────────────────────────────────────────

const NUTRI_SCORE_COLORS: Record<string, string> = {
  A: 'bg-green-600 text-white',
  B: 'bg-lime-500 text-white',
  C: 'bg-yellow-400 text-slate-900',
  D: 'bg-orange-500 text-white',
  E: 'bg-red-600 text-white',
};

function NutriScoreBadge({ score }: { score: string }) {
  const color = NUTRI_SCORE_COLORS[score.toUpperCase()] ?? 'bg-slate-400 text-white';
  return (
    <span className={cn('inline-flex items-center rounded-md px-2.5 py-0.5 text-sm font-black', color)}>
      {score.toUpperCase()}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Nutrients Table
// ─────────────────────────────────────────────────────────────────────────────

function NutrientsTable({ nutriments }: { nutriments: Nutriments }) {
  const tNut = useTranslations('dashboard.nutrients');

  const rows = [
    { key: 'energy', label: tNut('energy'), value: nutriments.energyKcal, unit: 'kcal' },
    { key: 'fat', label: tNut('fat'), value: nutriments.fat, unit: 'g' },
    { key: 'saturated', label: tNut('saturatedFat'), value: nutriments.saturatedFat, unit: 'g' },
    { key: 'carbs', label: tNut('carbs'), value: nutriments.carbohydrates, unit: 'g' },
    { key: 'sugars', label: tNut('sugars'), value: nutriments.sugars, unit: 'g' },
    { key: 'fiber', label: tNut('fiber'), value: nutriments.fiber, unit: 'g' },
    { key: 'protein', label: tNut('protein'), value: nutriments.proteins, unit: 'g' },
    { key: 'salt', label: tNut('salt'), value: nutriments.salt, unit: 'g' },
  ].filter((r) => r.value !== undefined && r.value !== null);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
        <Wheat className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
          {tNut('title')}
        </span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1">/100g</span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((row) => (
          <div key={row.key} className="flex justify-between px-3 py-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">{row.label}</span>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
              {typeof row.value === 'number' ? row.value.toFixed(1) : row.value} {row.unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Source Badge
// ─────────────────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  icecat: { label: 'Icecat', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  upcitemdb: { label: 'UPCitemdb', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  openfoodfacts: { label: 'Open Food Facts', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  combined: { label: 'Combined', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
};

function SourceBadge({ source }: { source: string }) {
  const cfg = SOURCE_LABELS[source] ?? { label: source, color: 'bg-slate-100 text-slate-600' };
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold', cfg.color)}>
      {cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProductCard
// ─────────────────────────────────────────────────────────────────────────────

interface ProductCardProps {
  product: BarcodeLookupResult;
  onUseForListing?: (product: BarcodeLookupResult) => void;
}

function ProductCard({ product, onUseForListing }: ProductCardProps) {
  const t = useTranslations('dashboard.barcode');
  const isFood = product.source === 'openfoodfacts';

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden space-y-0">
      {/* Image */}
      {product.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageUrl}
          alt={product.name ?? 'Product'}
          className="w-full h-40 object-contain bg-slate-50 dark:bg-slate-800/40"
        />
      )}

      <div className="p-4 space-y-3">
        {/* Title + source */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">
              {product.name ?? '—'}
            </p>
            {product.brand && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{product.brand}</p>
            )}
          </div>
          <SourceBadge source={product.source} />
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
          {product.category && (
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {product.category}
            </span>
          )}
          {product.weight && (
            <span className="flex items-center gap-1">
              <Tag className="h-3 w-3" />
              {product.weight}
            </span>
          )}
        </div>

        {/* Nutri-Score for food */}
        {isFood && product.nutriScore && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('nutriScore')}:</span>
            <NutriScoreBadge score={product.nutriScore} />
          </div>
        )}

        {/* Nutriments table */}
        {isFood && product.nutriments && (
          <NutrientsTable nutriments={product.nutriments} />
        )}

        {/* Allergens */}
        {isFood && product.allergens && product.allergens.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {product.allergens.map((a) => (
              <span key={a} className="rounded-full border border-orange-200 bg-orange-50 dark:border-orange-700/40 dark:bg-orange-950/30 px-2 py-0.5 text-[10px] text-orange-700 dark:text-orange-300">
                {a}
              </span>
            ))}
          </div>
        )}

        {/* Use for listing */}
        {onUseForListing && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onUseForListing(product)}
            className="w-full gap-2 border-brand-600/40 text-brand-600 dark:text-brand-300 hover:bg-brand-600/10"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t('useForListing')}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BarcodeLookupTab
// ─────────────────────────────────────────────────────────────────────────────

function BarcodeLookupTab() {
  const t = useTranslations('dashboard.barcode');
  const [inputValue, setInputValue] = useState('');
  const [activeBarcode, setActiveBarcode] = useState('');

  const { data: product, isFetching, isError, error } = useBarcodeLookup(activeBarcode);

  function handleSearch() {
    const cleaned = inputValue.replace(/\D/g, '');
    if (cleaned.length >= 8) {
      setActiveBarcode(cleaned);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Search panel */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-5">
        <div className="flex items-center gap-2 mb-5">
          <Barcode className="h-4 w-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('title')}</h3>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="barcodeInput">{t('input')}</Label>
            <div className="flex gap-2">
              <Input
                id="barcodeInput"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value.replace(/\D/g, ''))}
                placeholder="5901234123457"
                inputMode="numeric"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="font-mono tracking-wider flex-1"
              />
              <Button
                onClick={handleSearch}
                disabled={isFetching || inputValue.replace(/\D/g, '').length < 8}
                className="shrink-0"
              >
                {isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="ml-2 hidden sm:inline">{t('search')}</span>
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              EAN-13, EAN-8, UPC-A, UPC-E — 8–14 digits. Sources: Open Food Facts, UPCitemdb, Icecat.
            </p>
          </div>
        </div>
      </div>

      {/* Result panel */}
      <div className="space-y-4">
        {isFetching && (
          <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
            <Loader2 className="h-8 w-8 animate-spin text-brand-400 mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('search')}...</p>
          </div>
        )}

        {isError && !isFetching && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">
              {(error as Error | undefined)?.message ?? t('notFound')}
            </p>
          </div>
        )}

        {!isFetching && product && (
          <ProductCard product={product} />
        )}

        {!isFetching && !product && !isError && (
          <div className="flex flex-col items-center justify-center h-48 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <Barcode className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-slate-400 dark:text-slate-500 text-sm">{t('input')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Main Component ----
const TABS: Array<{ id: ContentTab; labelKey: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'thumbnail', labelKey: 'thumbnailGenerator', icon: ImageIcon },
  { id: 'description', labelKey: 'descriptionGenerator', icon: FileText },
  { id: 'barcode', labelKey: 'barcodeTab', icon: Barcode },
];

export function ContentClient() {
  const t = useTranslations('dashboard.content');
  const [activeTab, setActiveTab] = useState<ContentTab>('thumbnail');

  const TAB_LABELS: Record<ContentTab, string> = {
    thumbnail: t('thumbnailGenerator'),
    description: t('descriptionGenerator'),
    barcode: t('barcodeTab'),
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 p-1 w-full sm:w-fit overflow-x-auto scrollbar-none">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex flex-1 sm:flex-none shrink-0 items-center justify-center sm:justify-start gap-2 rounded-lg px-3 md:px-4 py-2 text-xs sm:text-sm font-medium transition-all whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-brand-600/20 text-brand-600 dark:text-brand-300 border border-brand-600/30'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              )}
            >
              <Icon className="h-4 w-4" />
              {TAB_LABELS[tab.id]}
            </button>
          );
        })}
      </div>

      {activeTab === 'thumbnail' && <ThumbnailGenerator />}
      {activeTab === 'description' && <DescriptionGenerator />}
      {activeTab === 'barcode' && <BarcodeLookupTab />}
    </div>
  );
}
