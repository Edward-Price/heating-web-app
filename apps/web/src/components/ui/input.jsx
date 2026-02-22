import React from 'react';
import { cn } from '../../lib/utils';

export function Input({ className, ...props }) {
  return (
    <input
      className={cn('h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none ring-accent/30 transition focus:border-accent focus:ring dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700', className)}
      {...props}
    />
  );
}
