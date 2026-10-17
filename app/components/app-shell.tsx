import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Form, Link, useLocation } from "react-router";
import { Icon } from "./icon";
import { ThemeToggle } from "./theme";

export function Brand() {
  return <Link to="/" className="inline-flex shrink-0 text-foreground text-[19px] font-[650] tracking-[-.8px]" aria-label="Kondo home">kondo</Link>;
}

export function AppShell({ user, trip, mobileNavigation, children }: {
  user: { name: string; email: string };
  trip?: { id: string; title: string };
  mobileNavigation?: ReactNode;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDialogElement>(null);
  const menuId = useId();
  const location = useLocation();

  useEffect(() => { setMenuOpen(false); }, [location.key]);

  useEffect(() => {
    if (!menuOpen) return;
    const element = menu.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    const media = window.matchMedia("(max-width: 760px)");
    const closeOnDesktop = () => { if (!media.matches) setMenuOpen(false); };
    media.addEventListener("change", closeOnDesktop);
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      media.removeEventListener("change", closeOnDesktop);
    };
  }, [menuOpen]);

  const breadcrumb = <nav className="flex min-w-0 items-center gap-2.5 text-[12px] [&_a]:shrink-0 [&_a]:text-muted-foreground [&_svg]:shrink-0 [&_svg]:text-muted-foreground [&_a:hover]:text-foreground [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap [@media(max-width:_760px)]:order-3 [@media(max-width:_760px)]:w-full" aria-label="Breadcrumb">
    <Link to="/" aria-current={trip ? undefined : "page"}>All trips</Link>
    {trip && <><Icon name="chevron" width="13" height="13" /><span aria-current="page">{trip.title}</span></>}
  </nav>;
  const account = <div className="flex shrink-0 items-center gap-3 ml-auto [@media(max-width:_760px)]:gap-1.5">
    <ThemeToggle />
    <div className="flex items-center gap-2.25">
      <span className="max-w-30 overflow-hidden text-muted-foreground text-[12px] text-ellipsis whitespace-nowrap [@media(max-width:_760px)]:hidden" title={user.email}>{user.name}</span>
      <Form action="/sign-out" method="post"><button type="submit" className="grid w-8 h-8 place-items-center rounded-md text-muted-foreground [&:hover]:bg-muted [&:hover]:text-foreground" aria-label="Sign out" title="Sign out"><Icon name="logout" /></button></Form>
    </div>
  </div>;

  return <div className="min-h-dvh">
    <a className="fixed -top-25 left-4 z-100 py-2.5 px-4 rounded-md bg-primary text-primary-foreground focus:top-3" href="#main-content">Skip to content</a>
      <header className={`flex min-h-16 items-center gap-5.5 py-3 px-6 [@media(max-width:_760px)]:flex-wrap [@media(max-width:_760px)]:gap-[12px_16px] [@media(max-width:_760px)]:py-3.5 [@media(max-width:_760px)]:px-5 ${mobileNavigation ? "[@media(max-width:_760px)]:hidden" : ""}`}>
        <Brand />
        {breadcrumb}
        {account}
      </header>
      {mobileNavigation && <>
        <header className="hidden min-h-16 items-center gap-3 border-b border-border px-5 [@media(max-width:_760px)]:flex">
          <button type="button" className="grid size-11 place-items-center rounded-md text-secondary-foreground hover:bg-muted" aria-label="Open trip menu" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls={menuId} onClick={() => setMenuOpen(true)}><Icon name="menu" /></button>
          <Brand />
        </header>
        <dialog ref={menu} id={menuId} aria-label="Trip menu" className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-none w-80 max-w-[calc(100%-2rem)] overflow-y-auto border-0 border-r border-border bg-surface p-5 text-foreground shadow-xl backdrop:bg-black/30"
          onCancel={(event) => { event.preventDefault(); setMenuOpen(false); }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const rect = event.currentTarget.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setMenuOpen(false);
          }}>
          <div className="flex min-h-full flex-col gap-5">
            <div className="flex items-center justify-between gap-3"><Brand /><button type="button" className="grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Close trip menu" onClick={() => setMenuOpen(false)} autoFocus><Icon name="close" /></button></div>
            <div>{breadcrumb}</div>
            <div>{mobileNavigation}</div>
            <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4 [&_button]:min-h-11 [&_button]:min-w-11">{account}</div>
          </div>
        </dialog>
      </>}
      <main id="main-content" className="p-[22px_32px_40px] [@media(max-width:_760px)]:p-5" tabIndex={-1}>{children}</main>
  </div>;
}

export function AuthShell({ children }: { children: ReactNode }) {
  return <main className="flex min-h-dvh flex-col py-4.5 px-6 [@media(max-width:_760px)]:py-4.5 [@media(max-width:_760px)]:px-5.5">
    <header className="flex items-center justify-between gap-5"><Brand /><ThemeToggle /></header>
    <section className="w-full max-w-90 m-auto p-[60px_0]">{children}</section>
  </main>;
}
