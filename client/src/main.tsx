import { trpc } from "@/lib/trpc";
import { getStoredToken, clearTokenAndRedirect } from "@/lib/authToken";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
// Tokens da Excambia ANTES dos demais estilos (paleta neutra #FAF9F6 + tema
// noturno automático via prefers-color-scheme).
import "./excambia-tokens.css";
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

/**
 * Erros que chegam do PROXY (nginx), não da API: o corpo é HTML e o parse de
 * JSON estourava com o críptico "The string did not match the expected
 * pattern" (Safari). Traduz o status para uma mensagem acionável.
 */
function mensagemHttpProxy(status: number): string {
  if (status === 413) {
    return "O arquivo é maior do que o servidor aceita (HTTP 413). " +
      "Ajuste no nginx: client_max_body_size 25m.";
  }
  if (status === 502 || status === 503 || status === 504) {
    return `O servidor demorou além do tempo limite do proxy (HTTP ${status}). ` +
      "Ajuste no nginx: proxy_read_timeout 300s. Arquivos grandes podem levar minutos para extrair.";
  }
  return `O servidor respondeu com um erro inesperado (HTTP ${status}).`;
}

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async fetch(input, init) {
        // Add Authorization header if token exists in localStorage (Safari iOS fallback)
        const token = getStoredToken();
        const headers = new Headers(init?.headers);
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }

        const res = await globalThis.fetch(input, {
          ...(init ?? {}),
          headers,
          credentials: "include",
        });
        if (!res.ok && !(res.headers.get("content-type") ?? "").includes("json")) {
          throw new Error(mensagemHttpProxy(res.status));
        }
        return res;
      },
    }),
  ],
});

// Remove apenas badges/links do Manus quando eles forem inseridos.
// Evita varrer document.querySelectorAll("*") a cada mutação do React, o que
// causava trabalho O(n) contínuo e podia gerar jank durante chat/streaming.
const hideManusBadge = (root: ParentNode) => {
  const candidates: Element[] = [];

  if (root instanceof Element) {
    candidates.push(root);
  }

  candidates.push(
    ...Array.from(
      root.querySelectorAll?.('a[href*="manus.im"], a[href*="manus.app"]') ?? []
    )
  );

  for (const el of candidates) {
    const href = (el as HTMLAnchorElement).href ?? "";
    const text = el.textContent ?? "";
    if (
      href.includes("manus.im") ||
      href.includes("manus.app") ||
      text.includes("Made with Manus") ||
      text.includes("Made with manus")
    ) {
      (el as HTMLElement).style.display = "none";
    }
  }
};

hideManusBadge(document);

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of Array.from(mutation.addedNodes)) {
      if (node instanceof Element) {
        hideManusBadge(node);
      }
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
