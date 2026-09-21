import type { ReactNode } from "react";
import { Form, Link } from "react-router";
import { Icon } from "./icon";
import { ThemeToggle } from "./theme";

export function Brand() {
  return <Link to="/" className="brand" aria-label="Kondo home"><span className="brand-mark"><Icon name="compass" width="23" height="23" /></span><span>kondo<span className="brand-dot">.</span></span></Link>;
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
            <div className="user-avatar" aria-hidden="true">{user.name.trim().slice(0, 1).toUpperCase() || "K"}</div>
            <div className="user-info"><p>{user.name}</p><span title={user.email}>{user.email}</span></div>
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
    <div className="auth-layout">
      <section className="auth-intro"><span className="eyebrow">A little planning. A world of possibility.</span><h2>Make room for<br />your next adventure.</h2><p>Bring your places, plans, and people together.<br />Your trip starts here.</p><div className="auth-route" aria-hidden="true"><Icon name="pin" /><span /><Icon name="plane" /><span /><Icon name="compass" /></div></section>
      <section className="auth-card">{children}</section>
    </div>
    <p className="auth-footer">Thoughtfully planned. Freely explored.</p>
  </main>;
}
