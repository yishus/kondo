import type { ReactNode } from "react";
import { Form, Link } from "react-router";
import { Icon } from "./icon";
import { ThemeToggle } from "./theme";

export function Brand() {
  return <Link to="/" className="inline-flex shrink-0 text-foreground text-[19px] font-[650] tracking-[-.8px]" aria-label="Kondo home">kondo</Link>;
}

export function AppShell({ user, trip, children }: {
  user: { name: string; email: string };
  trip?: { id: string; title: string };
  children: ReactNode;
}) {
  return <div className="min-h-dvh">
    <a className="fixed -top-25 left-4 z-100 py-2.5 px-4 rounded-md bg-primary text-primary-foreground focus:top-3" href="#main-content">Skip to content</a>
      <header className="flex min-h-16 items-center gap-5.5 py-3 px-6 [@media(max-width:_760px)]:flex-wrap [@media(max-width:_760px)]:gap-[12px_16px] [@media(max-width:_760px)]:py-3.5 [@media(max-width:_760px)]:px-5">
        <Brand />
        <nav className="flex min-w-0 items-center gap-2.5 text-[12px] [&_a]:shrink-0 [&_a]:text-muted-foreground [&_svg]:shrink-0 [&_svg]:text-muted-foreground [&_a:hover]:text-foreground [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap [@media(max-width:_760px)]:order-3 [@media(max-width:_760px)]:w-full" aria-label="Breadcrumb">
          <Link to="/" aria-current={trip ? undefined : "page"}>All trips</Link>
          {trip && <><Icon name="chevron" width="13" height="13" /><span aria-current="page">{trip.title}</span></>}
        </nav>
        <div className="flex shrink-0 items-center gap-3 ml-auto [@media(max-width:_760px)]:gap-1.5">
          <ThemeToggle />
          <div className="flex items-center gap-2.25">
            <span className="max-w-30 overflow-hidden text-muted-foreground text-[12px] text-ellipsis whitespace-nowrap [@media(max-width:_760px)]:hidden" title={user.email}>{user.name}</span>
            <Form action="/sign-out" method="post"><button type="submit" className="grid w-8 h-8 place-items-center rounded-md text-muted-foreground [&:hover]:bg-muted [&:hover]:text-foreground" aria-label="Sign out" title="Sign out"><Icon name="logout" /></button></Form>
          </div>
        </div>
      </header>
      <main id="main-content" className="p-[22px_32px_40px] [@media(max-width:_760px)]:p-5" tabIndex={-1}>{children}</main>
  </div>;
}

export function AuthShell({ children }: { children: ReactNode }) {
  return <main className="flex min-h-dvh flex-col py-4.5 px-6 [@media(max-width:_760px)]:py-4.5 [@media(max-width:_760px)]:px-5.5">
    <header className="flex items-center justify-between gap-5"><Brand /><ThemeToggle /></header>
    <section className="w-full max-w-90 m-auto p-[60px_0]">{children}</section>
  </main>;
}
