import React from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }) {
  return <div className={cn('rounded-lg border border-border bg-card p-4 shadow-[0_6px_20px_rgba(10,37,64,0.06)] dark:bg-slate-900 dark:border-slate-700 dark:shadow-[0_8px_28px_rgba(2,6,23,0.45)]', className)} {...props} />;
}
