import { data, Form, Link, redirect, useNavigation } from "react-router";

import type { Route } from "./+types/sign-in";
import { authError, runAuthEndpoint, safeReturnTo } from "../auth-forms.server";
import { getOptionalUser } from "../auth.server";

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
    <main className="grid min-h-screen place-items-center bg-[#f4f6f8] px-5 py-12 font-sans text-[#172b4d]">
      <section className="w-full max-w-md rounded-2xl border border-[#dcdfe4] bg-white p-7 shadow-[0_8px_28px_rgb(9_30_66_/_12%)] sm:p-9">
        <p className="text-xs font-bold tracking-[0.12em] text-[#0c66e4] uppercase">Kondo trip planner</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em]">Welcome back</h1>
        <p className="mt-2 text-sm text-[#626f86]">Sign in to see the trips you own.</p>
        <Form method="post" className="mt-7 grid gap-4">
          <input type="hidden" name="returnTo" value={loaderData.returnTo} />
          <label className="grid gap-1.5 text-sm font-bold">
            Email
            <input className="h-11 rounded-[10px] border border-[#b6beca] px-3 font-normal outline-none focus:border-[#0c66e4] focus:ring-2 focus:ring-[#0c66e4]/20" name="email" type="email" autoComplete="email" required />
          </label>
          <label className="grid gap-1.5 text-sm font-bold">
            Password
            <input className="h-11 rounded-[10px] border border-[#b6beca] px-3 font-normal outline-none focus:border-[#0c66e4] focus:ring-2 focus:ring-[#0c66e4]/20" name="password" type="password" autoComplete="current-password" required />
          </label>
          {actionData?.error && <p role="alert" className="rounded-lg bg-[#ffebe6] px-3 py-2 text-sm font-medium text-[#ae2a19]">{actionData.error}</p>}
          <button className="h-11 rounded-[10px] bg-[#0c66e4] px-5 text-sm font-bold text-white transition hover:bg-[#0055cc] disabled:cursor-wait disabled:opacity-60" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </Form>
        <p className="mt-6 text-center text-sm text-[#626f86]">New to Kondo? <Link className="font-bold text-[#0c66e4] hover:text-[#0055cc]" to={`/sign-up?${new URLSearchParams({ returnTo: loaderData.returnTo })}`}>Create an account</Link></p>
      </section>
    </main>
  );
}
