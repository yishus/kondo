import { data, Form, Link, redirect, useNavigation } from "react-router";

import type { Route } from "./+types/sign-in";
import { authError, runAuthEndpoint, safeReturnTo } from "../auth-forms.server";
import { getOptionalUser } from "../auth.server";
import { AuthShell } from "../components/app-shell";

export async function loader({ request }: Route.LoaderArgs) {
  if (await getOptionalUser(request)) return redirect("/");
  return { returnTo: safeReturnTo(new URL(request.url).searchParams.get("returnTo")) };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const returnTo = safeReturnTo(form.get("returnTo"));
  const response = await runAuthEndpoint(request, "sign-in/email", {
    email,
    password,
  });

  if (!response.ok) {
    return data(
      { error: await authError(response, "Email or password is incorrect.") },
      { status: response.status, headers: response.headers },
    );
  }

  return redirect(returnTo, { headers: response.headers });
}

export function meta() {
  return [{ title: "Sign in · Kondo" }];
}

export default function SignIn({ actionData, loaderData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  return (
    <AuthShell>
        <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to see the trips you own.</p>
        <Form method="post" className="mt-7 grid gap-4">
          <input type="hidden" name="returnTo" value={loaderData.returnTo} />
          <label className="grid min-w-0 gap-1.5 text-secondary-foreground text-[12px] font-medium">
            Email
            <input className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer" name="email" type="email" autoComplete="email" required />
          </label>
          <label className="grid min-w-0 gap-1.5 text-secondary-foreground text-[12px] font-medium">
            Password
            <input className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer" name="password" type="password" autoComplete="current-password" required />
          </label>
          {actionData?.error && <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">{actionData.error}</p>}
          <button className="h-11 rounded-[10px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:cursor-wait disabled:opacity-60" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </Form>
        <p className="mt-6 text-center text-sm text-muted-foreground">New to Kondo? <Link className="font-semibold text-primary hover:text-primary-hover" to={`/sign-up?${new URLSearchParams({ returnTo: loaderData.returnTo })}`}>Create an account</Link></p>
    </AuthShell>
  );
}
