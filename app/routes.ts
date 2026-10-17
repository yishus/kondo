import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("sign-in", "routes/sign-in.tsx"),
  route("sign-up", "routes/sign-up.tsx"),
  route("sign-out", "routes/sign-out.ts"),
  route("api/auth/*", "routes/auth-api.ts"),
  route("trips/:tripId/live", "routes/trip-live-layout.tsx", [
    index("routes/trip-live.tsx"),
    route("journal", "routes/trip-journal.tsx"),
  ]),
  route("trips/:tripId/live/itinerary", "routes/trip-live-itinerary-redirect.ts"),
  route("trips/:tripId/live/chat", "routes/trip-live-chat.ts"),
  route("trips/:tripId/live/journal/:entryId/images/:imageId", "routes/journal-image.ts"),
  route("trips/:tripId", "routes/trip-layout.tsx", [
    index("routes/trip.tsx"),
    route("map", "routes/trip-map.tsx"),
    route("accommodations", "routes/accommodations.tsx"),
    route("notes", "routes/notes.tsx"),
    route("settings", "routes/trip-settings.tsx"),
    route("owners", "routes/trip-owners.ts"),
  ]),
  route("trips/:tripId/accommodations/:accommodationId/documents/:documentId", "routes/accommodation-document.ts"),
  route("trips/:tripId/attachments/:attachmentId", "routes/trip-attachment.ts"),
  route("trips/:tripId/places", "routes/place-search.ts"),
  route("trips/:tripId/card-search", "routes/card-search.ts"),
  route("trips/:tripId/chat", "routes/trip-chat.ts"),
  route("trips/:tripId/cards/:cardId/chat", "routes/card-chat.ts"),
  route("trips/:tripId/cards/:cardId/place-photo", "routes/place-photo.ts"),
  route("trips/:tripId/cards/:cardId/attachments/:attachmentId", "routes/attachment.ts"),
  route("trips/:tripId/cards/:cardId/attachments/:attachmentId/preview-v1.svg", "routes/hike-preview.ts"),
] satisfies RouteConfig;
