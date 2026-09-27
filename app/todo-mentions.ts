export type TodoMember = { id: string; name: string; email: string };

const normalize = (value: string) => value.trim().toLowerCase();
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Duplicate display names use an email mention so choosing a suggestion is unambiguous.
export function memberMention(member: TodoMember, members: TodoMember[]) {
  const name = member.name.trim();
  return `@${name && members.filter((item) => normalize(item.name) === normalize(name)).length === 1 ? name : member.email}`;
}

export function parseTodoMentions(text: string, members: TodoMember[]) {
  const aliases = new Map<string, Set<string>>();
  for (const member of members) {
    for (const alias of [member.name, member.email]) {
      const key = normalize(alias);
      if (!key) continue;
      const ids = aliases.get(key) ?? new Set<string>();
      ids.add(member.id);
      aliases.set(key, ids);
    }
  }
  const names = [...aliases.keys()].sort((a, b) => b.length - a.length);
  if (!names.length) return { title: text.trim(), ownerIds: [] as string[] };
  const pattern = new RegExp(`(^|[\\s(\\[{])@(${names.map(escapePattern).join("|")})(?=$|[\\s,;:!?\\)\\]\\}]|\\.(?=\\s|$))`, "giu");
  const ownerIds = new Set<string>();
  const title = text.replace(pattern, (match: string, prefix: string, alias: string) => {
    const ids = aliases.get(normalize(alias))!;
    if (ids.size !== 1) return match;
    ownerIds.add([...ids][0]);
    return prefix;
  });
  return { title: (ownerIds.size ? title.replace(/[ \t]{2,}/g, " ").replace(/\s+([,;:.!?])/g, "$1") : title).trim(), ownerIds: [...ownerIds] };
}

export function activeTodoMention(text: string, caret: number) {
  const match = /(?:^|[\s(\[{])@([^@\n]*)$/.exec(text.slice(0, caret));
  if (!match) return null;
  return { start: caret - match[1].length - 1, end: caret, query: match[1].toLowerCase() };
}
