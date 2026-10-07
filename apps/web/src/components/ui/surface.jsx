import { cn } from '../../lib/utils';

export function SectionCard({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/70 bg-white/90 p-4 shadow-[0_6px_20px_rgba(10,37,64,0.05)] dark:border-slate-700 dark:bg-slate-900',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function IconBadge({ icon: Icon, tone = 'orange', className }) {
  const toneClass = tone === 'orange'
    ? 'bg-orange-50 text-orange-500 dark:bg-orange-500/15'
    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  return (
    <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-full', toneClass, className)}>
      <Icon className="h-5 w-5" />
    </span>
  );
}

// Pill-shaped segmented control used for zone pickers and range toggles.
export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cn('inline-flex rounded-full bg-slate-200/60 p-1 dark:bg-slate-800', className)}>
      {options.map((option) => {
        const selected = String(option.value) === String(value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            className={cn(
              'relative whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition',
              selected
                ? 'bg-white text-orange-600 shadow-sm dark:bg-slate-700 dark:text-orange-400'
                : 'text-slate-500 dark:text-slate-400'
            )}
          >
            {option.label}
            {option.badge ? <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-orange-500" /> : null}
          </button>
        );
      })}
    </div>
  );
}
