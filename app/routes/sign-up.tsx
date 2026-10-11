import { useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";

import type { Route } from "./+types/sign-up";
import { runAuthEndpoint, safeReturnTo } from "../auth-forms.server";
import { getOptionalUser, getTurnstileSiteKey } from "../auth.server";
import { Turnstile } from "../components/turnstile";
import { AuthShell } from "../components/app-shell";
import {
  GENERIC_SIGNUP_ERROR,
  genericSignupErrorResponse,
} from "../signup-errors";

export async function loader({ request }: Route.LoaderArgs) {
  if (await getOptionalUser(request)) return redirect("/");
  return {
    returnTo: safeReturnTo(new URL(request.url).searchParams.get("returnTo")),
    turnstileSiteKey: getTurnstileSiteKey(),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const turnstileResponse = String(
    form.get("cf-turnstile-response") ?? "",
  );
  const returnTo = safeReturnTo(form.get("returnTo"));
  const response = await runAuthEndpoint(request, "sign-up/email", {
    name,
    email,
    password,
  }, {
    "x-captcha-response": turnstileResponse,
  });

  if (!response.ok) {
    const genericResponse = genericSignupErrorResponse(response);
    return data(
      { error: GENERIC_SIGNUP_ERROR },
      { status: genericResponse.status, headers: genericResponse.headers },
    );
  }

  return redirect(returnTo, { headers: response.headers });
}

export function meta() {
  return [{ title: "Create account · Kondo" }];
}

export default function SignUp({ actionData, loaderData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const [turnstileReady, setTurnstileReady] = useState(false);
  return (
    <AuthShell>
        <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-2 text-sm text-muted-foreground">Kondo is in closed beta. Create an account with an allowlisted email.</p>
        <Form method="post" className="mt-7 grid gap-4">
          <input type="hidden" name="returnTo" value={loaderData.returnTo} />
          <label className="grid min-w-0 gap-1.5 text-secondary-foreground text-[12px] font-medium">
            Name
            <input className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer" name="name" autoComplete="name" maxLength={100} required />
          </label>
          <label className="grid min-w-0 gap-1.5 text-secondary-foreground text-[12px] font-medium">
            Email
            <input className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer" name="email" type="email" autoComplete="email" required />
          </label>
          <div className="grid gap-1.5 text-sm">
            <label className="font-semibold" htmlFor="sign-up-password">Password</label>
            <input id="sign-up-password" aria-describedby="password-help" className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
            <span id="password-help" className="text-muted-foreground">At least 8 characters.</span>
          </div>
          {loaderData.turnstileSiteKey ? (
            <Turnstile
              navigationState={navigation.state}
              onReadyChange={setTurnstileReady}
              siteKey={loaderData.turnstileSiteKey}
            />
          ) : (
            <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">
              Account creation is temporarily unavailable.
            </p>
          )}
          {actionData?.error && <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">{actionData.error}</p>}
          <button className="h-11 rounded-[10px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:cursor-wait disabled:opacity-60" type="submit" disabled={busy || !loaderData.turnstileSiteKey || !turnstileReady}>{busy ? "Creating account…" : "Create account"}</button>
        </Form>
        <p className="mt-6 text-center text-sm text-muted-foreground">Already have an account? <Link className="font-semibold text-primary hover:text-primary-hover" to={`/sign-in?${new URLSearchParams({ returnTo: loaderData.returnTo })}`}>Sign in</Link></p>
    </AuthShell>
  );
}
