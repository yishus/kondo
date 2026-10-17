import { resolveTripId } from "../trip-url.server";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { useEffect, useRef, useState } from "react";
import { data, useFetcher } from "react-router";
import { v7 as uuidv7 } from "uuid";
import type { Route } from "./+types/notes";
import { requireTripOwner } from "../auth.server";
import { getDb } from "../db.server";
import { getNotesPage } from "../trip-page.server";
import { tripNotes, tripOwners, tripTodos } from "../db/schema";
import { listTripOwners } from "../trip-owners.server";
import { parseTodoMentions } from "../todo-mentions";
import { TodoMentionInput } from "../components/todo-mention-input";
import { TodoPerson } from "../components/todo-person";
import { MarkdownEditor } from "../components/markdown-editor";
import { TripFiles } from "../components/trip-files";
import { removeTripAttachment, uploadTripAttachments } from "../trip-attachments.server";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { tripId, notes, todos, owners, attachments } = await getNotesPage(context, request, params.tripId);
  return { tripId, notes, todos, owners, attachments };
}

export async function action({ params, request }: Route.ActionArgs) {
  const fail = (error: string, status = 400) => data({ ok: false as const, error }, { status });
  const db = getDb(env.DB);
  const tripId = await resolveTripId(db, params.tripId);
  await requireTripOwner(request, db, tripId);
  try {
    const form = await request.formData();
    const get = (key: string) => typeof form.get(key) === "string" ? form.get(key) as string : "";
    const intent = get("intent");
    const ownerId = get("ownerId") || null;
    if ((intent === "add-todo" || intent === "tag-todo") && ownerId) {
      const [owner] = await db.select({ userId: tripOwners.userId }).from(tripOwners)
        .where(and(eq(tripOwners.tripId, tripId), eq(tripOwners.userId, ownerId))).limit(1);
      if (!owner) return fail("Choose an owner of this trip.");
    }

    if (intent === "upload-files") {
      return await uploadTripAttachments(db, env.ATTACHMENTS, tripId, form);
    } else if (intent === "remove-file") {
      return await removeTripAttachment(db, env.ATTACHMENTS, tripId, get("attachmentId"));
    } else if (intent === "save-notes") {
      const body = get("notes");
      if (body.length > 50000) return fail("Keep your notes under 50,000 characters.");
      await db.insert(tripNotes).values({ tripId: tripId, body })
        .onConflictDoUpdate({ target: tripNotes.tripId, set: { body } });
    } else if (intent === "add-todo") {
      const { title, ownerIds } = parseTodoMentions(get("title"), await listTripOwners(db, tripId));
      if (ownerIds.length > 1) return fail("Tag one person per to-do. Remove the extra mentions and try again.");
      if (!title || title.length > 500) return fail("Enter a to-do (up to 500 characters).");
      await db.insert(tripTodos).values({ id: uuidv7(), tripId: tripId, title, ownerId: ownerIds[0] ?? ownerId });
    } else if (intent === "tag-todo") {
      const changed = await db.update(tripTodos).set({ ownerId })
        .where(and(eq(tripTodos.id, get("todoId")), eq(tripTodos.tripId, tripId)))
        .returning({ id: tripTodos.id });
      if (!changed.length) return fail("That to-do no longer exists.", 404);
    } else if (intent === "toggle-todo" || intent === "delete-todo") {
      const condition = and(eq(tripTodos.id, get("todoId")), eq(tripTodos.tripId, tripId));
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

const button = "inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed";
const primary = "inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-primary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-primary-hover [&:hover:not(:disabled)]:text-primary-foreground disabled:opacity-[.45] disabled:cursor-not-allowed bg-primary";
const panel = "min-w-0";

type Owners = Route.ComponentProps["loaderData"]["owners"];

function TodoItem({ todo, owners }: { todo: Route.ComponentProps["loaderData"]["todos"][number]; owners: Owners }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const completed = busy && fetcher.formData?.get("intent") === "toggle-todo"
    ? fetcher.formData.get("completed") === "true" : todo.completed;
  const ownerId = busy && fetcher.formData?.get("intent") === "tag-todo"
    ? String(fetcher.formData.get("ownerId") ?? "") : todo.ownerId ?? "";
  return <li className="p-[12px_0] border-b border-b-border">
    <div className="flex items-start gap-2">
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 py-2">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={completed} disabled={busy} onChange={(event) => fetcher.submit({ intent: "toggle-todo", todoId: todo.id, completed: String(event.target.checked) }, { method: "post", flushSync: true })} />
        <span className={`min-w-0 text-sm wrap-break-word ${completed ? "text-muted-foreground line-through" : "text-foreground"}`}>{todo.title}</span>
      </label>
      <TodoPerson members={owners} ownerId={ownerId} title={todo.title} disabled={busy}
        onChange={(ownerId) => fetcher.submit({ intent: "tag-todo", todoId: todo.id, ownerId }, { method: "post", flushSync: true })} />
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="delete-todo" />
        <input type="hidden" name="todoId" value={todo.id} />
        <button type="submit" disabled={busy} aria-label={`Delete ${todo.title}`} className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 border border-transparent rounded-md text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 disabled:opacity-[.45] disabled:cursor-not-allowed px-2 text-destructive hover:bg-destructive-soft">Delete</button>
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
    <h2 id="notes-heading" className="text-[15px] font-medium tracking-[-.02em]">Trip notes</h2>
    <p className="mt-1.5 text-muted-foreground text-[12px] leading-[1.6]">Keep ideas, reminders, and useful details together.</p>
    <fetcher.Form method="post" className="mt-5 grid gap-3">
      <input type="hidden" name="intent" value="save-notes" />
      <label htmlFor="trip-notes" className="text-secondary-foreground text-[12px] font-medium">Notes</label>
      <MarkdownEditor
        id="trip-notes"
        name="notes"
        label="Notes"
        value={draft}
        onChange={setDraft}
        disabled={busy}
        maxLength={50000}
        placeholder="Packing ideas, places to explore, things to remember…"
        emptyMessage="No notes yet. Add ideas, reminders, and useful details for your trip."
        saveHint="Save notes to keep your changes."
      />
      {fetcher.data?.error && <p role="alert" className="text-sm text-destructive">{fetcher.data.error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted-foreground">{busy ? "Saving…" : draft !== notes ? "Unsaved changes" : fetcher.data?.ok ? "Notes saved." : ""}</p>
        <button className={primary} type="submit" disabled={busy || draft === notes}>{busy ? "Saving…" : "Save notes"}</button>
      </div>
    </fetcher.Form>
  </section>;
}

export default function Notes({ loaderData: { tripId, notes, todos, owners, attachments } }: Route.ComponentProps) {
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
      <h2 id="todos-heading" className="text-[15px] font-medium tracking-[-.02em]">To-do list</h2>
      <p className="mt-1.5 text-muted-foreground text-[12px] leading-[1.6]">{todos.length ? `${todos.filter((todo) => todo.completed).length} of ${todos.length} completed` : "A few small steps toward your next trip."}</p>
      <fetcher.Form ref={form} method="post" className="mt-5 flex flex-wrap items-end gap-2" onSubmit={() => { submitted.current = true; }}>
        <input type="hidden" name="intent" value="add-todo" />
        <TodoMentionInput members={owners} disabled={fetcher.state !== "idle"} />
        <button type="submit" className={primary} disabled={fetcher.state !== "idle"}>{fetcher.state === "idle" ? "Add to-do" : "Adding…"}</button>
      </fetcher.Form>
      {fetcher.data?.error && <p role="alert" className="mt-3 text-sm text-destructive">{fetcher.data.error}</p>}
      {todos.length ? <ul className="mt-5 grid">{todos.map((todo) => <TodoItem key={todo.id} todo={todo} owners={owners} />)}</ul> : <p className="p-[18px_0] text-muted-foreground text-[12px] mt-5">No to-dos yet. Add your first task above.</p>}
    </section>
    <div className="grid min-w-0 gap-10">
      <NotesEditor key={tripId} notes={notes} />
      <TripFiles key={`files:${tripId}`} tripId={tripId} attachments={attachments} />
    </div>
  </div>;
}
