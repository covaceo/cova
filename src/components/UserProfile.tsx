import { ChevronDown, LogOut, Settings, UserRound, UserRoundPen, X } from "lucide-react";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createProfileRepository, type ProfileRepository } from "../lib/profileRepository";
import { normalizeUsername, validateAvatarData, validateUsername, type UserProfile } from "../lib/userProfile";

const useIdentityEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type ProfileContextValue = { identity?: string; profile: UserProfile | null; email: string; loading: boolean; error: string; editable: boolean; retry: () => void; save: (name: string, avatar: string | null) => Promise<void> };
const ProfileContext = createContext<ProfileContextValue>({ profile: null, email: "", loading: false, error: "", editable: false, retry: () => {}, save: async () => { throw new Error("Sign in to edit your profile."); } });
async function defaultRepository() {
  const { getSupabaseClient } = await import("../lib/supabaseClient");
  const client = getSupabaseClient();
  if (!client) throw new Error("Your profile could not be loaded.");
  return createProfileRepository(client);
}
export function UserProfileProvider({ userId, email = "", children, repository = defaultRepository }: { userId?: string; email?: string; children: ReactNode; repository?: () => Promise<ProfileRepository> }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const active = useRef<AbortController | null>(null);
  const currentOwner = useRef(userId); currentOwner.current = userId;
  const [loadedOwner, setLoadedOwner] = useState<string | undefined>();
  useEffect(() => {
    const controller = new AbortController(); active.current = controller;
    setProfile(null); setError(""); setLoading(Boolean(userId));
    if (userId) void repository().then(repo => repo.load(userId, controller.signal)).then(result => {
      if (!controller.signal.aborted) setProfile(result);
    }).catch(() => {
      if (!controller.signal.aborted) setError("Your profile could not be loaded. Please try again.");
    }).finally(() => { if (!controller.signal.aborted) { setLoadedOwner(userId); setLoading(false); } });
    return () => controller.abort();
  }, [userId, repository, attempt]);
  async function save(name: string, avatar: string | null) {
    const controller = active.current;
    if (!userId || currentOwner.current !== userId || loadedOwner !== userId || !controller || controller.signal.aborted || loading || error) throw new Error("Reload your profile before saving.");
    const result = await (await repository()).save(userId, name, avatar, controller.signal);
    if (controller.signal.aborted || currentOwner.current !== userId) throw new Error("Your session changed. Sign in again.");
    setProfile(result);
  }
  return <ProfileContext.Provider value={{ identity: userId, profile: profile?.user_id === userId ? profile : null, email, loading: Boolean(userId) && (loading || loadedOwner !== userId), error, editable: Boolean(userId), retry: () => setAttempt(value => value + 1), save }}>{children}</ProfileContext.Provider>;
}
function Avatar({ data, large = false }: { data: string | null; large?: boolean }) {
  return <span className={`cova-profile-avatar ${large ? "cova-profile-avatar-large" : ""}`} aria-hidden="true">{data && !validateAvatarData(data) ? <img src={data} alt="" /> : <UserRound />}</span>;
}
export async function prepareProfilePhoto(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0) throw new Error("Choose a JPG, PNG, or WebP photo under 5 MB.");
  const image = await createImageBitmap(file);
  try {
    if (!image.width || !image.height || image.width * image.height > 40000000) throw new Error("Choose a smaller photo.");
    const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 256;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Your photo could not be prepared.");
    const side = Math.min(image.width, image.height);
    context.fillStyle = "#0c121b"; context.fillRect(0, 0, 256, 256);
    context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256);
    const data = canvas.toDataURL("image/jpeg", 0.85);
    const error = validateAvatarData(data); if (error) throw new Error(error);
    return data;
  } finally { image.close(); }
}
export function ProfileMenu({ signOut, deleteAccount, mobile = false, email = "" }: { signOut: () => void; deleteAccount: () => void; mobile?: boolean; email?: string }) {
  const profile = useContext(ProfileContext);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"edit" | "settings" | null>(null);
  const [notice, setNotice] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useIdentityEffect(() => { setOpen(false); setDialog(null); setNotice(""); }, [profile.identity]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  const name = profile.profile ? `@${profile.profile.username}` : profile.loading ? "Loading profile…" : "Set username";
  return <div className={`cova-profile ${mobile ? "cova-profile-mobile" : ""}`} ref={root}>
    <div className="cova-profile-popup" role="menu" aria-label="Profile actions" hidden={!open} onKeyDown={event => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
        items[next]?.focus();
      }
    }}>
      <button type="button" role="menuitem" onClick={() => { setOpen(false); setNotice(""); setDialog("edit"); }}><UserRoundPen aria-hidden="true" />Edit profile</button>
      <button type="button" role="menuitem" onClick={() => { setOpen(false); setDialog("settings"); }}><Settings aria-hidden="true" />Settings</button>
      <button type="button" role="menuitem" aria-label="Sign out" onClick={() => { setOpen(false); signOut(); }}><LogOut aria-hidden="true" />Sign out</button>
    </div>
    <button type="button" ref={trigger} className="cova-profile-trigger" aria-label="Profile menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)} onKeyDown={event => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()); }
    }}><Avatar data={profile.profile?.avatar_data || null} /><span>{name}</span><ChevronDown aria-hidden="true" /></button>
    {notice && <span className="cova-profile-notice" role="status">{notice}</span>}
    {dialog && <ProfileDialog key={dialog} mode={dialog} email={profile.email || email} deleteAccount={deleteAccount} close={(saved = false) => { setDialog(null); if (saved) setNotice("Profile saved"); requestAnimationFrame(() => trigger.current?.focus()); }} />}
  </div>;
}
function ProfileDialog({ mode, email, deleteAccount, close }: { mode: "edit" | "settings"; email: string; deleteAccount: () => void; close: (saved?: boolean) => void }) {
  const profile = useContext(ProfileContext);
  const ref = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const [name, setName] = useState(profile.profile?.username || "");
  const [avatar, setAvatar] = useState(profile.profile?.avatar_data || null);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const locked = busy || processing;
  useEffect(() => { alive.current = true; ref.current?.showModal(); return () => { alive.current = false; }; }, []);
  useEffect(() => { setName(profile.profile?.username || ""); setAvatar(profile.profile?.avatar_data || null); }, [profile.profile]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (locked) return;
    const validation = validateUsername(name); if (validation) { setError(validation); return; }
    setBusy(true); setError("");
    try { await profile.save(name, avatar); if (alive.current) close(true); }
    catch (caught) { if (alive.current) setError(caught instanceof Error ? caught.message : "Your profile could not be saved."); }
    finally { if (alive.current) setBusy(false); }
  }
  return <dialog ref={ref} className="cova-profile-dialog" aria-labelledby="cova-profile-title" onCancel={event => { event.preventDefault(); if (!locked) close(); }}>
    <div className="cova-profile-dialog-head"><h2 id="cova-profile-title">{mode === "edit" ? "Edit profile" : "Settings"}</h2><button type="button" aria-label="Close profile editor" disabled={locked} onClick={() => close()}><X aria-hidden="true" /></button></div>
    {mode === "edit" ? <form onSubmit={save}>
      <div className="cova-profile-dialog-body">
        <div className="cova-profile-photo-row"><Avatar data={avatar} large /><div><button type="button" className="cova-profile-photo-action" disabled={locked || !profile.editable || profile.loading || Boolean(profile.error)} onClick={() => file.current?.click()}>Change photo</button>{avatar && <button className="cova-profile-remove-photo" type="button" disabled={locked} onClick={() => setAvatar(null)}>Remove photo</button>}</div></div>
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Profile photo" hidden onChange={async event => {
          const selected = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!selected) return;
          setError(""); setProcessing(true);
          try { const photo = await prepareProfilePhoto(selected); if (alive.current) setAvatar(photo); }
          catch (caught) { if (alive.current) setError(caught instanceof Error ? caught.message : "That photo could not be opened."); }
          finally { if (alive.current) setProcessing(false); }
        }} />
        <label className="cova-profile-label" htmlFor="cova-username">Username</label>
        <div className="cova-profile-input"><span aria-hidden="true">@</span><input autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false} id="cova-username" name="username" value={name} maxLength={25} aria-describedby="cova-username-help" aria-invalid={Boolean(error)} disabled={locked || profile.loading || !profile.editable || Boolean(profile.error)} onChange={event => { setName(event.target.value); setError(""); }} onBlur={() => setName(normalizeUsername(name))} /></div>
        <p className="cova-profile-help" id="cova-username-help">3–24 letters, numbers, or underscores. Each username is unique.</p>
        {profile.loading && <p className="cova-profile-help" role="status">Loading profile…</p>}
        {!profile.editable && <p className="cova-profile-help">Sign in to a Cova account to save your profile.</p>}
        {profile.error && <div className="cova-profile-error" role="alert">{profile.error} <button type="button" onClick={profile.retry}>Try again</button></div>}
        {error && <p className="cova-profile-error" role="alert">{error}</p>}
      </div>
      <div className="cova-profile-dialog-footer"><button type="button" disabled={locked} onClick={() => close()}>Cancel</button><button type="submit" className="cova-profile-save" disabled={locked || profile.loading || Boolean(profile.error) || !profile.editable}>{busy ? "Saving…" : processing ? "Preparing photo…" : "Save changes"}</button></div>
    </form> : <><div className="cova-profile-dialog-body"><p className="cova-profile-label">Email</p><p className="cova-profile-email">{email || "Demo account"}</p><p className="cova-profile-help">Your sign-in email stays the same.</p><button className="cova-profile-delete" type="button" aria-label="Delete account" onClick={() => { close(); deleteAccount(); }}>Delete account</button></div><div className="cova-profile-dialog-footer"><button type="button" onClick={() => close()}>Close</button></div></>}
  </dialog>;
}
