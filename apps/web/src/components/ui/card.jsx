import React from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }) {
  return <div className={cn('rounded-lg border border-border bg-card p-4 shadow-[0_6px_20px_rgba(10,37,64,0.06)]', className)} {...props} />;
}
