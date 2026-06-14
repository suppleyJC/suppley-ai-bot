import { trpc } from "@/lib/trpc";
import { getStoredToken, clearTokenAndRedirect } from "@/lib/authToken";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  clearTokenAndRedirect();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        // Add Authorization header if token exists in localStorage (Safari iOS fallback)
        const token = getStoredToken();
        const headers = new Headers(init?.headers);
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        
        return globalThis.fetch(input, {
          ...(init ?? {}),
          headers,
          credentials: "include",
        });
      },
    }),
  ],
});

// Remove Manus badge/watermark dynamically
const removeManusBadge = () => {
  // Find and remove any element containing "Made with Manus"
  const allElements = document.querySelectorAll('*');
  allElements.forEach(el => {
    if (el.textContent?.includes('Made with Manus') || 
        el.textContent?.includes('Made with manus') ||
        (el as HTMLAnchorElement).href?.includes('manus.im') ||
        (el as HTMLAnchorElement).href?.includes('manus.app')) {
      (el as HTMLElement).style.display = 'none';
      (el as HTMLElement).style.visibility = 'hidden';
      (el as HTMLElement).style.opacity = '0';
      (el as HTMLElement).style.pointerEvents = 'none';
      (el as HTMLElement).style.position = 'absolute';
      (el as HTMLElement).style.left = '-9999px';
    }
  });
};

// Run on load and observe for dynamic additions
setTimeout(removeManusBadge, 100);
setTimeout(removeManusBadge, 500);
setTimeout(removeManusBadge, 1000);
setTimeout(removeManusBadge, 2000);

// MutationObserver to catch dynamically added badges
const observer = new MutationObserver(() => {
  removeManusBadge();
});
observer.observe(document.body, { childList: true, subtree: true });

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
