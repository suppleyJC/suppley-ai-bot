/**
 * MessageContent — renderizador de Markdown LEVE para o chat e análises.
 *
 * Substitui o Streamdown (que embutia o shiki com TODAS as linguagens, ~9,5 MB).
 * Usa react-markdown + remark-gfm (tabelas, listas, links) — o que o chat de fato
 * usa — sem realce de sintaxe pesado. Blocos de código caem em <pre><code>
 * simples e estilizados, suficiente para o nosso uso.
 *
 * A estilização vem das classes `prose` aplicadas pelo componente que o envolve.
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MessageContent({ children }: { children?: string | null }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Links sempre abrem em nova aba, com segurança.
        a: ({ node, ...props }) => (
          <a {...props} target="_blank" rel="noreferrer noopener" />
        ),
      }}
    >
      {children ?? ""}
    </ReactMarkdown>
  );
}

// Compat: alguns lugares importavam { Streamdown }. Mantém o mesmo nome de uso.
export default MessageContent;
