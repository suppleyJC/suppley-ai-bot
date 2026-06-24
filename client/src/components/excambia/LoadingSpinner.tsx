/**
 * Reusable animated loading spinner component
 * Eliminates duplication of spinner code in ChatTab
 */

interface LoadingSpinnerProps {
  status?: string;
}

export function LoadingSpinner({ status = "Excambia está pensando..." }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        <span
          className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <span className="text-sm text-muted-foreground">{status}</span>
    </div>
  );
}
