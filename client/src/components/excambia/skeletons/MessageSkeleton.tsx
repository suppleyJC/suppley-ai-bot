/**
 * Skeleton loader for chat message
 * Shows animated placeholder while message is loading
 */

export function MessageSkeleton() {
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[75%] rounded-2xl px-4 py-3 shadow-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <div className="space-y-2">
          {/* Content skeleton: 3 lines */}
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" style={{ width: "95%" }} />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" style={{ width: "100%" }} />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" style={{ width: "50%" }} />

          {/* Timestamp skeleton */}
          <div className="pt-2">
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" style={{ width: "40%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
