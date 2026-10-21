import { useEffect, useRef } from 'react';
import { ArrowRightLeft, ChevronRight, LogOut, Moon, ScanLine, Sun, X } from 'lucide-react';
import { Button } from '../ui/button';

export default function AppMenuDrawer({
  menuOpen,
  setMenuOpen,
  toggleTheme,
  debugLayoutEnabled,
  toggleDebugLayout,
  theme,
  onLogout,
  onChangeSystem
}) {
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const previousFocus = document.activeElement;
    drawerRef.current?.querySelector('button')?.focus({ preventScroll: true });
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
      if (event.key !== 'Tab') return;
      const buttons = drawerRef.current?.querySelectorAll('button:not(:disabled)');
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [menuOpen, setMenuOpen]);

  const rowClass = 'h-auto min-h-14 w-full justify-start gap-3 rounded-xl px-3 py-3 text-left font-medium';

  return (
    <div
      aria-hidden={!menuOpen}
      {...(!menuOpen ? { inert: '' } : {})}
      className={`fixed inset-0 z-50 transition-[visibility] duration-0 motion-reduce:delay-0 ${menuOpen ? 'visible delay-0' : 'invisible delay-200'}`}
    >
      <div
        className={`absolute inset-0 bg-slate-950/35 backdrop-blur-[2px] transition-opacity duration-200 ease-out motion-reduce:transition-none ${menuOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => setMenuOpen(false)}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="App settings"
        className={`absolute inset-y-0 left-0 flex w-[85vw] max-w-xs flex-col overflow-y-auto rounded-r-3xl border-r border-border bg-card px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+1rem)] text-foreground shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="mb-5 flex justify-end">
          <Button size="icon" variant="ghost" className="rounded-full" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="space-y-1">
          <Button variant="ghost" className={rowClass} onClick={toggleTheme}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-500/10">
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </span>
            <span className="flex-1">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </Button>
          <Button variant="ghost" className={rowClass} onClick={onChangeSystem}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"><ArrowRightLeft className="h-5 w-5" /></span>
            <span className="flex-1">Change system</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
          </Button>
          <Button variant="ghost" className={rowClass} onClick={toggleDebugLayout} aria-pressed={debugLayoutEnabled}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"><ScanLine className="h-5 w-5" /></span>
            <span className="flex-1">Debug layout</span>
            <span className={`rounded-full px-2 py-1 text-xs ${debugLayoutEnabled ? 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400' : 'bg-slate-100 text-muted dark:bg-slate-800'}`}>{debugLayoutEnabled ? 'On' : 'Off'}</span>
          </Button>
        </div>
        <div className="mt-auto pt-8">
          <div className="border-t border-border pt-3 dark:border-slate-700">
            <Button variant="ghost" className={`${rowClass} text-rose-600 dark:text-rose-400`} onClick={onLogout}>
              <span className="grid h-9 w-9 shrink-0 place-items-center"><LogOut className="h-5 w-5" /></span>
              Log out
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
