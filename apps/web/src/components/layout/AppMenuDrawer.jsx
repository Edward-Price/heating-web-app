import { Moon, Sun, X } from 'lucide-react';
import { Button } from '../ui/button';

export default function AppMenuDrawer({
  menuOpen,
  setMenuOpen,
  toggleTheme,
  debugLayoutEnabled,
  toggleDebugLayout,
  theme,
  onLogout
}) {
  if (!menuOpen) return null;

  return (
    <>
      <div
        className="fixed inset-x-0 top-0 z-40 h-[var(--app-height)] bg-black/30"
        onClick={() => setMenuOpen(false)}
      />
      <aside className="fixed left-0 top-0 z-50 h-[var(--app-height)] w-[85vw] max-w-xs overflow-y-auto border-r border-border bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+0.5rem)] text-foreground shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <div className="mb-4 flex items-center justify-between">
          <strong>Menu</strong>
          <Button size="icon" variant="ghost" onClick={() => setMenuOpen(false)}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-2">
          <Button variant="outline" className="w-full justify-start" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </Button>
          <Button variant="outline" className="w-full justify-start" onClick={toggleDebugLayout}>
            {`Debug layout: ${debugLayoutEnabled ? 'On' : 'Off'}`}
          </Button>
          <Button variant="outline" className="w-full justify-start" onClick={onLogout}>Log out</Button>
        </div>
      </aside>
    </>
  );
}
