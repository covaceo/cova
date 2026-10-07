import type {ReactNode} from "react";
import "../styles/publicNavbarHover.css";
// Independent implementation of the public capsule/hover preview, not Aceternity's gated source.
// A fragment in the workspace preserves its original DOM, styling and navigation authority.
export function PublicNavbarSurface({enabled,open,children}:{enabled:boolean;open:boolean;children:ReactNode}) {
 return enabled ? <div className="cova-public-nav-shell" data-mobile-open={open}>{children}</div> : <>{children}</>;
}
