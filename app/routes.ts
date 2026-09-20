import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("sign-in", "routes/sign-in.tsx"),
  route("sign-up", "routes/sign-up.tsx"),
  route("sign-out", "routes/sign-out.ts"),
  route("api/auth/*", "routes/auth-api.ts"),
  route("trips/:tripId", "routes/trip-layout.tsx", [
    index("routes/trip.tsx"),
    route("accommodations", "routes/accommodations.tsx"),
    route("notes", "routes/notes.tsx"),
    route("owners", "routes/trip-owners.ts"),
  ]),
  route("trips/:tripId/accommodations/:accommodationId/documents/:documentId", "routes/accommodation-document.ts"),
  route("trips/:tripId/places", "routes/place-search.ts"),
  route("trips/:tripId/cards/:cardId/place-photo", "routes/place-photo.ts"),
  route("trips/:tripId/cards/:cardId/attachments/:attachmentId", "routes/attachment.ts"),
] satisfies RouteConfig;
