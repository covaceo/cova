export type UserProfile = { user_id: string; username: string; avatar_data: string | null };
export const MAX_AVATAR_DATA_LENGTH = 100000;
export function validateAvatarData(data: string | null): string | null {
  return data === null || (data.length <= MAX_AVATAR_DATA_LENGTH && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data))
    ? null : "Choose a JPG, PNG, or WebP photo under 5 MB.";
}
export function profileErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "23505") return "That username is already taken. Try another.";
  return "Your profile could not be saved. Please try again.";
}
export function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase();
}
export function validateUsername(value: string): string | null {
  return /^[a-z0-9_]{3,24}$/.test(normalizeUsername(value)) ? null : "Use 3–24 letters, numbers, or underscores.";
}
