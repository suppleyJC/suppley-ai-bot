/**
 * MessageContent — renderizador de Markdown do chat e das análises.
 *
 * Usa react-markdown + remark-gfm (tabelas, listas, links). A estilização é
 * própria (componentes customizados abaixo), no espírito ChatGPT/Claude:
 * títulos proporcionais, tabelas com cabeçalho e divisórias, listas com bom
 * espaçamento, código legível. NÃO depende mais das classes `prose` — assim a
 * formatação fica idêntica em todas as telas (chat, análises, assistentes).
 */
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  // Links sempre abrem em nova aba, com segurança.
  a: ({ node, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noreferrer noopener"
      className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
    />
  ),

  h1: ({ node, ...props }) => (
    <h1
      {...props}
      className="mt-5 mb-2 text-[18px] font-semibold leading-snug tracking-tight text-slate-900 first:mt-0 dark:text-slate-100"
    />
  ),
  h2: ({ node, ...props }) => (
    <h2
      {...props}
      className="mt-5 mb-2 text-[16px] font-semibold leading-snug tracking-tight text-slate-900 first:mt-0 dark:text-slate-100"
    />
  ),
  h3: ({ node, ...props }) => (
    <h3
      {...props}
      className="mt-4 mb-1.5 text-[14px] font-semibold leading-snug tracking-tight text-slate-900 first:mt-0 dark:text-slate-100"
    />
  ),
  h4: ({ node, ...props }) => (
    <h4
      {...props}
      className="mt-3 mb-1 text-[13px] font-semibold uppercase tracking-wide text-slate-500 first:mt-0 dark:text-slate-400"
    />
  ),

  p: ({ node, ...props }) => (
    <p
      {...props}
      className="my-2 text-[14px] leading-relaxed text-slate-700 first:mt-0 last:mb-0 dark:text-slate-300"
    />
  ),
  strong: ({ node, ...props }) => (
    <strong {...props} className="font-semibold text-slate-900 dark:text-slate-100" />
  ),
  em: ({ node, ...props }) => <em {...props} className="italic" />,

  ul: ({ node, ...props }) => (
    <ul
      {...props}
      className="my-2 list-disc space-y-1 pl-5 text-[14px] marker:text-slate-400 first:mt-0 last:mb-0 dark:marker:text-slate-500"
    />
  ),
  ol: ({ node, ...props }) => (
    <ol
      {...props}
      className="my-2 list-decimal space-y-1 pl-5 text-[14px] marker:text-slate-400 first:mt-0 last:mb-0 dark:marker:text-slate-500"
    />
  ),
  li: ({ node, ...props }) => (
    <li {...props} className="leading-relaxed text-slate-700 dark:text-slate-300" />
  ),

  blockquote: ({ node, ...props }) => (
    <blockquote
      {...props}
      className="my-3 border-l-2 border-violet-300 pl-3 text-[14px] italic text-slate-600 dark:border-violet-700 dark:text-slate-400"
    />
  ),
  hr: ({ node, ...props }) => (
    <hr {...props} className="my-4 border-slate-200 dark:border-slate-700" />
  ),

  // Tabelas — contêiner rolável e arredondado, cabeçalho destacado, zebra leve.
  table: ({ node, ...props }) => (
    <div className="my-3 w-full overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table {...props} className="w-full border-collapse text-[13px]" />
    </div>
  ),
  thead: ({ node, ...props }) => (
    <thead {...props} className="bg-slate-50 dark:bg-slate-800/60" />
  ),
  th: ({ node, ...props }) => (
    <th
      {...props}
      className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
    />
  ),
  td: ({ node, ...props }) => (
    <td
      {...props}
      className="border-b border-slate-100 px-3 py-2 align-top text-slate-700 last:border-0 dark:border-slate-800 dark:text-slate-300"
    />
  ),
  tr: ({ node, ...props }) => (
    <tr
      {...props}
      className="even:bg-slate-50/50 dark:even:bg-slate-800/30"
    />
  ),

  // Código: inline x bloco. Bloco vem com className "language-*".
  code: ({ node, className, children, ...props }) => {
    const isBlock = !!className && /language-/.test(className);
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.85em] font-medium text-violet-700 dark:bg-slate-800 dark:text-violet-300"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ node, ...props }) => (
    <pre
      {...props}
      className="my-3 overflow-x-auto rounded-xl bg-slate-900 p-3 text-[13px] leading-relaxed text-slate-100 dark:bg-slate-950"
    />
  ),
};

export function MessageContent({ children }: { children?: string | null }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children ?? ""}
    </ReactMarkdown>
  );
}

// Compat: alguns lugares importavam { Streamdown }. Mantém o mesmo nome de uso.
export default MessageContent;
