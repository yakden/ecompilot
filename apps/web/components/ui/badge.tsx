import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-brand-600/20 text-brand-600 dark:text-brand-300 border-brand-600/30',
        secondary:
          'border-transparent bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
        destructive:
          'border-transparent bg-red-900/30 text-red-400 border-red-800/30',
        outline: 'text-slate-300 border-slate-700',
        success:
          'border-transparent bg-green-900/30 text-green-400 border-green-800/30',
        warning:
          'border-transparent bg-amber-900/30 text-amber-400 border-amber-800/30',
        info:
          'border-transparent bg-blue-900/30 text-blue-400 border-blue-800/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
