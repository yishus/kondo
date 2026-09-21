import type { ReactNode } from "react";
import { Form, Link } from "react-router";
import { Icon } from "./icon";
import { ThemeToggle } from "./theme";

export function Brand() {
  return <Link to="/" className="brand" aria-label="Kondo home">kondo</Link>;
}

export function AppShell({ user, trip, children }: {
  user: { name: string; email: string };
  trip?: { id: string; title: string };
  children: ReactNode;
}) {
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="workspace-bar">
        <Brand />
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to="/" aria-current={trip ? undefined : "page"}>All trips</Link>
          {trip && <><Icon name="chevron" width="13" height="13" /><span aria-current="page">{trip.title}</span></>}
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <div className="header-account">
            <span className="user-name" title={user.email}>{user.name}</span>
            <Form action="/sign-out" method="post"><button type="submit" className="icon-button" aria-label="Sign out" title="Sign out"><Icon name="logout" /></button></Form>
          </div>
        </div>
      </header>
      <main id="main-content" className="workspace-content" tabIndex={-1}>{children}</main>
  </div>;
}

export function AuthShell({ children }: { children: ReactNode }) {
  return <main className="auth-shell">
    <header className="auth-header"><Brand /><ThemeToggle /></header>
    <section className="auth-card">{children}</section>
  </main>;
}
