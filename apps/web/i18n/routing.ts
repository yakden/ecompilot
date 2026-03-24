import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['ru', 'pl', 'ua', 'en'],
  defaultLocale: 'ru',
  localePrefix: 'always',
});
