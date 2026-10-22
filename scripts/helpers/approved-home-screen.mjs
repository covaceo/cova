import assert from 'node:assert/strict';
// Reverse only this explicit additive UI mount. All prior App guards stay frozen.
export function withoutHomeScreenInstall(source){
 const lines=[
  'import { HomeScreenInstall } from "./components/HomeScreenInstall";',
  "      <HomeScreenInstall owner={authSession?.source === 'supabase' ? authSession.userId : undefined} eligible={workspaceSync.enabled && workspaceSync.phase === 'saved' && workspaceSync.hasWorkspace && workspaceSync.allowEdit && section === 'dashboard' && !mobileOpen && !authMode && !passwordRecoverySession && !pendingSupabaseSession && !toast} />",
 ];
 let restored=source.split(String.fromCharCode(13,10)).join(String.fromCharCode(10));
 for(const line of lines){assert.equal(restored.split(line).length,2,'Exact owner-bound, saved-workspace Home Screen extension');restored=restored.replace(line+String.fromCharCode(10),'');}
 return restored;
}
