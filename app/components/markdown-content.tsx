import type { ReactNode } from "react";

export function MarkdownContent({ children }: { children: ReactNode }) {
  return <div className="
    text-foreground leading-[1.65] wrap-anywhere [&_>_*_+_*]:mt-3 *:first:mt-0
    [&_:is(h1,h2,h3,h4,h5,h6)]:my-[16px_8px] [&_:is(h1,h2,h3,h4,h5,h6)]:font-semibold [&_:is(h1,h2,h3,h4,h5,h6)]:leading-[1.3]
    [&_h1]:text-[1.6em] [&_h2]:text-[1.4em] [&_h3]:text-[1.2em]
    [&_:is(ul,ol)]:pl-6 [&_ul]:list-disc [&_ol]:list-decimal [&_li+li]:mt-1
    [&_.contains-task-list]:list-none [&_.contains-task-list]:pl-1 [&_.task-list-item_input]:mr-1.5
    [&_a]:underline [&_a]:underline-offset-[3px]
    [&_blockquote]:pl-3 [&_blockquote]:border-l-3 [&_blockquote]:border-l-input [&_blockquote]:text-muted-foreground
    [&_code]:py-0.5 [&_code]:px-1 [&_code]:rounded-sm [&_code]:bg-muted [&_code]:text-[.9em]
    [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:bg-muted [&_pre_code]:p-0
    [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse
    [&_:is(th,td)]:py-1.5 [&_:is(th,td)]:px-2.5 [&_:is(th,td)]:border [&_:is(th,td)]:border-border [&_th]:bg-muted [&_th]:font-semibold
    [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-sm [&_hr]:border-border
  ">{children}</div>;
}
