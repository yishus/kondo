export const activityCategories = {
  cafe: { label: "Café or snack", minutes: 30 },
  meal: { label: "Meal", minutes: 60 },
  museum: { label: "Museum or gallery", minutes: 90 },
  other: { label: "Other visit", minutes: 60 },
} as const;

export type ActivityCategory = keyof typeof activityCategories;

export type ActivityClassification = {
  category: ActivityCategory;
  confidence: number;
  probabilities: Record<ActivityCategory, number>;
  model: string;
};
