import { Menu } from 'lucide-react';

export default function ScreenHeader({ title, subtitle, onOpenMenu, right }) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      <div className="mt-1 flex shrink-0 items-center gap-2">
        {right}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/80 text-foreground shadow-sm dark:bg-slate-800"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
