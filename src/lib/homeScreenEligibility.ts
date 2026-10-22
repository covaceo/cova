// Saved workspace data and unsaved browser drafts have different lifetimes.
// Installation must not steer someone away from a draft that cannot follow them.
export function hasHomeScreenDraft(owner:string,stores:Pick<Storage,'length'|'key'|'getItem'>[]):boolean {
  try {
    const suffix=':'+encodeURIComponent(owner.trim().toLowerCase());
    for(const storage of stores)for(let index=0;index<storage.length;index++){
      const key=storage.key(index);
      if(key?.startsWith('cova-journal-draft-v1:')&&key.endsWith(suffix)){
        const value=storage.getItem(key);if(value&&value!=='null')return true;
      }
    }
    return false;
  }catch{return true;}
}
