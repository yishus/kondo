import { useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";

import type { Route } from "./+types/sign-up";
import { runAuthEndpoint, safeReturnTo } from "../auth-forms.server";
import { getOptionalUser, getTurnstileSiteKey } from "../auth.server";
import { Turnstile } from "../components/turnstile";
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
    <main className="grid min-h-screen place-items-center bg-[#f4f6f8] px-5 py-12 font-sans text-[#172b4d]">
      <section className="w-full max-w-md rounded-2xl border border-[#dcdfe4] bg-white p-7 shadow-[0_8px_28px_rgb(9_30_66_/_12%)] sm:p-9">
        <p className="text-xs font-bold tracking-[0.12em] text-[#0c66e4] uppercase">Kondo trip planner</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em]">Create your account</h1>
        <p className="mt-2 text-sm text-[#626f86]">Kondo is in closed beta. Create an account with an allowlisted email.</p>
        <Form method="post" className="mt-7 grid gap-4">
          <input type="hidden" name="returnTo" value={loaderData.returnTo} />
          <label className="grid gap-1.5 text-sm font-bold">
            Name
            <input className="h-11 rounded-[10px] border border-[#b6beca] px-3 font-normal outline-none focus:border-[#0c66e4] focus:ring-2 focus:ring-[#0c66e4]/20" name="name" autoComplete="name" maxLength={100} required />
          </label>
          <label className="grid gap-1.5 text-sm font-bold">
            Email
            <input className="h-11 rounded-[10px] border border-[#b6beca] px-3 font-normal outline-none focus:border-[#0c66e4] focus:ring-2 focus:ring-[#0c66e4]/20" name="email" type="email" autoComplete="email" required />
          </label>
          <div className="grid gap-1.5 text-sm">
            <label className="font-bold" htmlFor="sign-up-password">Password</label>
            <input id="sign-up-password" aria-describedby="password-help" className="h-11 rounded-[10px] border border-[#b6beca] px-3 font-normal outline-none focus:border-[#0c66e4] focus:ring-2 focus:ring-[#0c66e4]/20" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
            <span id="password-help" className="text-[#626f86]">At least 8 characters.</span>
          </div>
          {loaderData.turnstileSiteKey ? (
            <Turnstile
              navigationState={navigation.state}
              onReadyChange={setTurnstileReady}
              siteKey={loaderData.turnstileSiteKey}
            />
          ) : (
            <p role="alert" className="rounded-lg bg-[#ffebe6] px-3 py-2 text-sm font-medium text-[#ae2a19]">
              Account creation is temporarily unavailable.
            </p>
          )}
          {actionData?.error && <p role="alert" className="rounded-lg bg-[#ffebe6] px-3 py-2 text-sm font-medium text-[#ae2a19]">{actionData.error}</p>}
          <button className="h-11 rounded-[10px] bg-[#0c66e4] px-5 text-sm font-bold text-white transition hover:bg-[#0055cc] disabled:cursor-wait disabled:opacity-60" type="submit" disabled={busy || !loaderData.turnstileSiteKey || !turnstileReady}>{busy ? "Creating account…" : "Create account"}</button>
        </Form>
        <p className="mt-6 text-center text-sm text-[#626f86]">Already have an account? <Link className="font-bold text-[#0c66e4] hover:text-[#0055cc]" to={`/sign-in?${new URLSearchParams({ returnTo: loaderData.returnTo })}`}>Sign in</Link></p>
      </section>
    </main>
  );
}
