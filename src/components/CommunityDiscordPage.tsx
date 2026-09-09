import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Instagram } from "lucide-react";

type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "passport";

const COVA_DISCORD_INVITE_URL = "https://discord.gg/B83Czu3pAf";

function XMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.835L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

function DiscordMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <title>Discord</title>
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

const socialDestinations = [
  { name: "Instagram", handle: "@covadesk", action: "Follow on Instagram", href: "https://www.instagram.com/covadesk/", Mark: Instagram },
  { name: "Discord", handle: "Cova", action: "Join Discord", href: COVA_DISCORD_INVITE_URL, Mark: DiscordMark },
  { name: "X", handle: "@covadesk", action: "Follow on X", href: "https://x.com/covadesk", Mark: XMark },
];

export function CommunityPage({ go }: { go: (section: Section) => void }) {
  const reduceMotion = useReducedMotion();

  return (
    <section className="community-oa-page">
      <div className="community-oa-inner">
        <header className="community-oa-intro">
          <h1>Find us.</h1>
        </header>
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="community-oa-stage"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
        >
          <nav aria-label="Find Cova" className="community-social-links">
            {socialDestinations.map(({ name, handle, action, href, Mark }) => (
              <a className="community-social-link" href={href} key={name} rel="noopener noreferrer" target="_blank">
                <Mark aria-hidden="true" className="community-social-mark" />
                <div className="community-social-identity">
                  <h2>{name}</h2>
                  <span className="community-social-handle">{handle}</span>
                </div>
                <span className="community-social-action">{action}<ArrowUpRight aria-hidden="true" /></span>
              </a>
            ))}
          </nav>
          <div className="community-oa-boundary">
            <p>No live entry calls, paid signals, copy trading, account management, broker solicitation, or requests for private account information.</p>
            <button onClick={() => go("resources")} type="button">Read Resources</button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
