/**
 * Skeleton loader for quick actions
 * Shows animated placeholder for action buttons while loading
 */

export function QuickActionsSkeleton() {
  return (
    <div className="px-4 pb-2">
      <div className="max-w-3xl mx-auto">
        <div className="text-xs text-muted-foreground mb-2 h-3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-20" />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-xl bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
