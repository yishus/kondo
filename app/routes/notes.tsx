import { env } from "cloudflare:workers";
import { and, asc, eq } from "drizzle-orm";
import { useEffect, useRef, useState } from "react";
import { data, useFetcher } from "react-router";
import { v7 as uuidv7 } from "uuid";
import type { Route } from "./+types/notes";
import { requireTripOwner } from "../auth.server";
import { getDb } from "../db.server";
import { tripNotes, tripTodos, trips } from "../db/schema";

export async function loader({ params, request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  await requireTripOwner(request, db, params.tripId);
  const [[trip], [notes], todos] = await Promise.all([
    db.select({ id: trips.id }).from(trips).where(eq(trips.id, params.tripId)).limit(1),
    db.select().from(tripNotes).where(eq(tripNotes.tripId, params.tripId)).limit(1),
    db.select().from(tripTodos).where(eq(tripTodos.tripId, params.tripId)).orderBy(asc(tripTodos.id)),
  ]);
  if (!trip) throw new Response("Trip not found", { status: 404 });
  return { tripId: trip.id, notes: notes?.body ?? "", todos };
}

export async function action({ params, request }: Route.ActionArgs) {
  const fail = (error: string, status = 400) => data({ ok: false as const, error }, { status });
  const db = getDb(env.DB);
  await requireTripOwner(request, db, params.tripId);
  try {
    const [trip] = await db.select({ id: trips.id }).from(trips).where(eq(trips.id, params.tripId)).limit(1);
    if (!trip) return fail("That trip no longer exists.", 404);
    const form = await request.formData();
    const get = (key: string) => typeof form.get(key) === "string" ? form.get(key) as string : "";
    const intent = get("intent");

    if (intent === "save-notes") {
      const body = get("notes");
      if (body.length > 50000) return fail("Keep your notes under 50,000 characters.");
      await db.insert(tripNotes).values({ tripId: trip.id, body })
        .onConflictDoUpdate({ target: tripNotes.tripId, set: { body } });
    } else if (intent === "add-todo") {
      const title = get("title").trim();
      if (!title || title.length > 500) return fail("Enter a to-do (up to 500 characters).");
      await db.insert(tripTodos).values({ id: uuidv7(), tripId: trip.id, title });
    } else if (intent === "toggle-todo" || intent === "delete-todo") {
      const condition = and(eq(tripTodos.id, get("todoId")), eq(tripTodos.tripId, trip.id));
      if (intent === "toggle-todo" && !["true", "false"].includes(get("completed"))) return fail("Choose whether this to-do is complete.");
      const changed = intent === "delete-todo"
        ? await db.delete(tripTodos).where(condition).returning({ id: tripTodos.id })
        : await db.update(tripTodos).set({ completed: get("completed") === "true" }).where(condition).returning({ id: tripTodos.id });
      if (!changed.length) return fail("That to-do no longer exists.", 404);
    } else {
      return fail("Unknown notes action.");
    }
    return { ok: true as const, error: null };
  } catch {
    return fail("Could not save your changes. Please try again.", 500);
  }
}

export function meta() { return [{ title: "Notes · Kondo" }]; }

const input = "ui-input";
const button = "ui-button";
const primary = "ui-button ui-button-primary";
const panel = "notes-panel";

function TodoItem({ todo }: { todo: Route.ComponentProps["loaderData"]["todos"][number] }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const completed = busy && fetcher.formData?.get("intent") === "toggle-todo"
    ? fetcher.formData.get("completed") === "true" : todo.completed;
  return <li className="ui-saved-item">
    <div className="flex items-start gap-2">
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 py-2">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={completed} disabled={busy} onChange={(event) => fetcher.submit({ intent: "toggle-todo", todoId: todo.id, completed: String(event.target.checked) }, { method: "post", flushSync: true })} />
        <span className={`min-w-0 text-sm break-words ${completed ? "text-muted-foreground line-through" : "text-foreground"}`}>{todo.title}</span>
      </label>
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="delete-todo" />
        <input type="hidden" name="todoId" value={todo.id} />
        <button type="submit" disabled={busy} aria-label={`Delete ${todo.title}`} className={`${button} px-2 text-destructive hover:bg-destructive-soft`}>Delete</button>
      </fetcher.Form>
    </div>
    {fetcher.data?.error && <p role="alert" className="mt-2 text-sm text-destructive">{fetcher.data.error}</p>}
  </li>;
}

function NotesEditor({ notes }: { notes: string }) {
  const fetcher = useFetcher<typeof action>();
  const [draft, setDraft] = useState(notes);
  const busy = fetcher.state !== "idle";
  return <section className={panel} aria-labelledby="notes-heading">
    <h2 id="notes-heading" className="section-heading">Trip notes</h2>
    <p className="section-description">Keep ideas, reminders, and useful details together.</p>
    <fetcher.Form method="post" className="mt-5 grid gap-3">
      <input type="hidden" name="intent" value="save-notes" />
      <label htmlFor="trip-notes" className="ui-label">Notes</label>
      <textarea id="trip-notes" name="notes" className={`${input} min-h-80 resize-y leading-relaxed`} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={busy} maxLength={50000} placeholder="Packing ideas, places to explore, things to remember…" />
      {fetcher.data?.error && <p role="alert" className="text-sm text-destructive">{fetcher.data.error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted-foreground">{busy ? "Saving…" : draft !== notes ? "Unsaved changes" : fetcher.data?.ok ? "Notes saved." : ""}</p>
        <button className={primary} type="submit" disabled={busy || draft === notes}>{busy ? "Saving…" : "Save notes"}</button>
      </div>
    </fetcher.Form>
  </section>;
}

export default function Notes({ loaderData: { tripId, notes, todos } }: Route.ComponentProps) {
  const fetcher = useFetcher<typeof action>();
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);
  useEffect(() => {
    if (fetcher.state === "idle" && submitted.current) {
      submitted.current = false;
      if (fetcher.data?.ok) form.current?.reset();
    }
  }, [fetcher.state, fetcher.data]);
  return <div className="grid items-start gap-10 lg:grid-cols-2">
    <section className={panel} aria-labelledby="todos-heading">
      <h2 id="todos-heading" className="section-heading">To-do list</h2>
      <p className="section-description">{todos.length ? `${todos.filter((todo) => todo.completed).length} of ${todos.length} completed` : "A few small steps toward your next trip."}</p>
      <fetcher.Form ref={form} method="post" className="mt-5 flex flex-wrap items-end gap-2" onSubmit={() => { submitted.current = true; }}>
        <input type="hidden" name="intent" value="add-todo" />
        <label className="ui-field flex-1 basis-48">New to-do<input className={input} name="title" required maxLength={500} disabled={fetcher.state !== "idle"} placeholder="e.g. Check passport expiry" /></label>
        <button type="submit" className={primary} disabled={fetcher.state !== "idle"}>{fetcher.state === "idle" ? "Add to-do" : "Adding…"}</button>
      </fetcher.Form>
      {fetcher.data?.error && <p role="alert" className="mt-3 text-sm text-destructive">{fetcher.data.error}</p>}
      {todos.length ? <ul className="mt-5 grid">{todos.map((todo) => <TodoItem key={todo.id} todo={todo} />)}</ul> : <p className="empty-state mt-5">No to-dos yet. Add your first task above.</p>}
    </section>
    <NotesEditor key={tripId} notes={notes} />
  </div>;
}
