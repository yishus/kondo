import type { Route } from "./+types/trip-chat";
import { loadChat, sendChat } from "../trip-chat-route.server";

export const loader = (args: Route.LoaderArgs) => loadChat(args);
export const action = (args: Route.ActionArgs) => sendChat(args);
