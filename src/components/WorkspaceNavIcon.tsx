import type { Section } from '../lib/appRoutes';
export function WorkspaceNavIcon({section}:{section:Section}) {
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {section==='dashboard'?<><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9h17M8.5 9v10.5M11.5 16l2-2 2 1 2.5-3"/></>:section==='rules'?<path d="M4 5.5h16M4 18.5h16M7 9v6M12 8v8M17 10v4"/>:section==='coach'?<><path d="M4 18.5h16M5 15l4-4 4 2 6-7M15.5 6H19v3.5"/><circle cx="9" cy="11" r="1.5" fill="#080d14"/></>:section==='passport'?<><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8 3.5v17M11 15.5h5M11 18h3"/><circle cx="13.5" cy="9" r="2.5"/><path d="M11 9h5"/></>:<><path d="M7 4.5h11.5a2 2 0 0 1 2 2v9"/><rect x="3.5" y="8" width="13.5" height="11.5" rx="2"/><path d="M7 12h6.5M7 15.5h3.5"/></>}
 </svg>;
}
