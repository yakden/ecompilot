// ─────────────────────────────────────────────────────────────────────────────
// Country code → flag emoji + display name helper
// ISO 3166-1 alpha-2 codes used by the suppliers-service
// ─────────────────────────────────────────────────────────────────────────────

interface CountryInfo {
  flag: string;
  name: string;
  nameRu: string;
}

const COUNTRY_MAP: Record<string, CountryInfo> = {
  cn: { flag: '🇨🇳', name: 'China', nameRu: 'Китай' },
  pl: { flag: '🇵🇱', name: 'Poland', nameRu: 'Польша' },
  tr: { flag: '🇹🇷', name: 'Turkey', nameRu: 'Турция' },
  de: { flag: '🇩🇪', name: 'Germany', nameRu: 'Германия' },
  tw: { flag: '🇹🇼', name: 'Taiwan', nameRu: 'Тайвань' },
  it: { flag: '🇮🇹', name: 'Italy', nameRu: 'Италия' },
  es: { flag: '🇪🇸', name: 'Spain', nameRu: 'Испания' },
  fr: { flag: '🇫🇷', name: 'France', nameRu: 'Франция' },
  nl: { flag: '🇳🇱', name: 'Netherlands', nameRu: 'Нидерланды' },
  cz: { flag: '🇨🇿', name: 'Czechia', nameRu: 'Чехия' },
  hu: { flag: '🇭🇺', name: 'Hungary', nameRu: 'Венгрия' },
  ro: { flag: '🇷🇴', name: 'Romania', nameRu: 'Румыния' },
  in: { flag: '🇮🇳', name: 'India', nameRu: 'Индия' },
  vn: { flag: '🇻🇳', name: 'Vietnam', nameRu: 'Вьетнам' },
  bd: { flag: '🇧🇩', name: 'Bangladesh', nameRu: 'Бангладеш' },
  pk: { flag: '🇵🇰', name: 'Pakistan', nameRu: 'Пакистан' },
  id: { flag: '🇮🇩', name: 'Indonesia', nameRu: 'Индонезия' },
  th: { flag: '🇹🇭', name: 'Thailand', nameRu: 'Таиланд' },
  kr: { flag: '🇰🇷', name: 'South Korea', nameRu: 'Южная Корея' },
  jp: { flag: '🇯🇵', name: 'Japan', nameRu: 'Япония' },
  ua: { flag: '🇺🇦', name: 'Ukraine', nameRu: 'Украина' },
  by: { flag: '🇧🇾', name: 'Belarus', nameRu: 'Беларусь' },
  ru: { flag: '🇷🇺', name: 'Russia', nameRu: 'Россия' },
  us: { flag: '🇺🇸', name: 'USA', nameRu: 'США' },
  gb: { flag: '🇬🇧', name: 'UK', nameRu: 'Великобритания' },
  pt: { flag: '🇵🇹', name: 'Portugal', nameRu: 'Португалия' },
  at: { flag: '🇦🇹', name: 'Austria', nameRu: 'Австрия' },
  be: { flag: '🇧🇪', name: 'Belgium', nameRu: 'Бельгия' },
  sk: { flag: '🇸🇰', name: 'Slovakia', nameRu: 'Словакия' },
  bg: { flag: '🇧🇬', name: 'Bulgaria', nameRu: 'Болгария' },
  hr: { flag: '🇭🇷', name: 'Croatia', nameRu: 'Хорватия' },
  lt: { flag: '🇱🇹', name: 'Lithuania', nameRu: 'Литва' },
  lv: { flag: '🇱🇻', name: 'Latvia', nameRu: 'Латвия' },
  ee: { flag: '🇪🇪', name: 'Estonia', nameRu: 'Эстония' },
  hk: { flag: '🇭🇰', name: 'Hong Kong', nameRu: 'Гонконг' },
};

export function getCountryFlag(code: string | null | undefined): string {
  if (!code) return '';
  return COUNTRY_MAP[code.toLowerCase()]?.flag ?? '';
}

export function getCountryName(
  code: string | null | undefined,
  locale: 'ru' | 'en' = 'ru',
): string {
  if (!code) return '';
  const info = COUNTRY_MAP[code.toLowerCase()];
  if (!info) return code.toUpperCase();
  return locale === 'ru' ? info.nameRu : info.name;
}

export function getCountryInfo(
  code: string | null | undefined,
): CountryInfo | null {
  if (!code) return null;
  return COUNTRY_MAP[code.toLowerCase()] ?? null;
}

/** Returns all country codes that appear in a supplier list */
export function extractCountryCodes(items: Array<{ country: string | null }>): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    if (item.country) seen.add(item.country.toLowerCase());
  }
  return Array.from(seen).sort();
}
