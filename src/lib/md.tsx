import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
export function MD({ children }: { children: string }) {
  return <div className="prose-invert text-sm leading-relaxed break-words">
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}>{children}</ReactMarkdown>
  </div>
}
