import { redirect } from "react-router";

import type { Route } from "./+types/sign-out";
import { runAuthEndpoint } from "../auth-forms.server";

export async function action({ request }: Route.ActionArgs) {
  const response = await runAuthEndpoint(request, "sign-out");
  return redirect("/sign-in", { headers: response.headers });
}
