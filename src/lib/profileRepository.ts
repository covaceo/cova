import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeUsername, profileErrorMessage, validateAvatarData, validateUsername, type UserProfile } from "./userProfile";
export type ProfileRepository = {
  load: (owner: string, signal?: AbortSignal) => Promise<UserProfile | null>;
  save: (owner: string, username: string, avatar: string | null, signal?: AbortSignal) => Promise<UserProfile>;
};
export function createProfileRepository(client: SupabaseClient): ProfileRepository {
  async function requireOwner(owner: string) {
    const { data } = await client.auth.getSession();
    if (!owner || data.session?.user.id !== owner) throw new Error("Your session changed. Sign in again.");
  }
  function checked(data: UserProfile | null, owner: string) {
    if (data && (data.user_id !== owner || validateUsername(data.username) || validateAvatarData(data.avatar_data) || !Number.isFinite(Date.parse(data.username_changed_at)))) throw new Error("Your profile could not be loaded.");
    return data;
  }
  return {
    async load(owner, signal) {
      await requireOwner(owner);
      const { data, error } = await client.from("user_profiles").select("user_id,username,avatar_data,username_changed_at").eq("user_id", owner).abortSignal(AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(10000)])).maybeSingle();
      if (error) throw new Error("Your profile could not be loaded. Please try again.");
      await requireOwner(owner);
      return checked(data, owner);
    },
    async save(owner, username, avatar, signal) {
      const validation = validateUsername(username) || validateAvatarData(avatar);
      if (validation) throw new Error(validation);
      await requireOwner(owner);
      const { data, error } = await client.from("user_profiles").upsert({ user_id: owner, username: normalizeUsername(username), avatar_data: avatar }, { onConflict: "user_id" }).select("user_id,username,avatar_data,username_changed_at").abortSignal(AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(10000)])).single();
      if (error) throw new Error(profileErrorMessage(error));
      await requireOwner(owner);
      const profile = checked(data, owner);
      if (!profile) throw new Error("Your profile could not be saved. Please try again.");
      return profile;
    },
  };
}
