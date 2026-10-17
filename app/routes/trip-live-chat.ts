import type { Route } from "./+types/trip-live-chat";
import { loadChat, sendChat } from "../trip-chat-route.server";

export const loader = (args: Route.LoaderArgs) => loadChat(args, true);
export const action = (args: Route.ActionArgs) => sendChat(args, true);
