import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";

type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "passport";

const COVA_DISCORD_INVITE_URL = "https://discord.gg/B83Czu3pAf";
const OA_LAYOUT = { type: "spring" as const, stiffness: 550, damping: 40 };

const communityRooms = [
  { name: "#trade-review", body: "Completed trades, screenshots, execution notes, and what you would change." },
  { name: "#risk-discipline", body: "Sizing, drawdown decisions, rule breaks, and consistency work." },
  { name: "#passport-showcase", body: "Privacy-checked Cova Passports and progress worth documenting." },
  { name: "#product-feedback", body: "Product problems, expected outcomes, and the evidence behind them." },
];

function DiscordMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <title>Discord</title>
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

export function CommunityPage({ go }: { go: (section: Section) => void }) {
  const reduceMotion = useReducedMotion();
  const openDiscord = () => {
    const discordWindow = window.open(COVA_DISCORD_INVITE_URL, "_blank", "noopener,noreferrer");
    if (discordWindow) discordWindow.opener = null;
  };

  return (
    <section className="community-oa-page">
      <div aria-hidden="true" className="community-oa-atmosphere" />
      <div className="community-oa-inner">
        <motion.header
          animate={{ opacity: 1, y: 0 }}
          className="community-oa-intro"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          transition={reduceMotion ? { duration: 0 } : OA_LAYOUT}
        >
          <div>
            <span className="community-oa-status">A real Cova community</span>
            <h1>Bring the trade. Get help working through it.</h1>
            <p>This is the real Cova Discord. Bring completed trades, screenshots, risk questions, or product problems. Ask Cova directly and work through it with the room.</p>
          </div>
        </motion.header>

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="community-oa-stage"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          transition={reduceMotion ? { duration: 0 } : { ...OA_LAYOUT, delay: 0.06 }}
        >
          <div className="community-oa-board">
            <div className="community-oa-hero">
              <div className="community-oa-join-copy">
                <div className="community-oa-brandline">
                  <DiscordMark className="community-oa-brand-mark" />
                  <div>
                    <span>COVA ON DISCORD</span>
                    <strong>THE ROOM IS OPEN</strong>
                  </div>
                </div>
                <h2>Ask for help. Share the context. Help the next trader when you can.</h2>
                <p>The invite is permanent and opens directly in <strong>#start-here</strong>.</p>
                <button className="community-oa-join" onClick={openDiscord} type="button">
                  <DiscordMark />
                  Join the Cova Discord
                  <ArrowUpRight aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="community-oa-help-flow" aria-label="How to ask for help">
              <div><span>01</span><strong>Bring the screenshot</strong><p>Use a completed trade or product problem, never a live call.</p></div>
              <div><span>02</span><strong>Add the context</strong><p>Explain what you saw, what you did, and the rule or workflow involved.</p></div>
              <div><span>03</span><strong>Ask what you need</strong><p>Request another perspective, a product answer, or help reviewing the decision.</p></div>
            </div>

            <div className="community-oa-rooms">
              <div className="community-oa-rooms-heading">
                <span>REAL ROOMS</span>
                <strong>Go where the conversation belongs.</strong>
              </div>
              <div className="community-oa-room-list">
                {communityRooms.map(room => (
                  <div className="community-oa-room" key={room.name}>
                    <strong>{room.name}</strong>
                    <p>{room.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="community-oa-boundary">
              <p>No live entry calls, paid signals, copy trading, account management, broker solicitation, or requests for private account information.</p>
              <button onClick={() => go("resources")} type="button">Read Resources</button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
