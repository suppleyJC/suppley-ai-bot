/**
 * Skeleton loader for input area
 * Shows animated placeholder while input is loading
 */

export function InputAreaSkeleton() {
  return (
    <div className="p-4 border-t bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm">
      <div className="max-w-3xl mx-auto">
        <div className="flex gap-2 items-end">
          {/* Upload button skeleton */}
          <div className="h-10 w-10 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse" />

          {/* Input skeleton */}
          <div className="flex-1">
            <div className="h-10 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
          </div>

          {/* Send button skeleton */}
          <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-[#311260]/30 to-[#682ABA]/30 animate-pulse" />
        </div>

        {/* Help text skeleton */}
        <div className="mt-2">
          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" style={{ width: "60%" }} />
        </div>
      </div>
    </div>
  );
}
