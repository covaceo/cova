import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";

type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "passport";
type AuthMode = "login" | "signup";

const OA_LAYOUT = { type: "spring" as const, stiffness: 550, damping: 40 };

export function ResourcesPage({ go }: { go: (section: Section) => void; openAuth: (mode: AuthMode) => void }) {
  const reduceMotion = useReducedMotion();
  const quickStartSteps = [
    {
      number: "01",
      title: "Export your trades",
      body: "Download completed trades or fills from the platform you already use.",
      action: "Open import paths",
      onClick: () => go("import"),
    },
    {
      number: "02",
      title: "Upload and check the file",
      body: "Cova maps columns and flags rows that need attention before anything is imported.",
      action: "Upload CSV",
      onClick: () => go("import"),
    },
    {
      number: "03",
      title: "Review the account",
      body: "Read P&L, drawdown context, and the highest-priority behavior warning together.",
      action: "Review account",
      onClick: () => go("dashboard"),
    },
    {
      number: "04",
      title: "Set your limits",
      body: "Compare imported history with your own loss, size, streak, and consistency thresholds.",
      action: "Open limits",
      onClick: () => go("rules"),
    },
    {
      number: "05",
      title: "Export your Passport",
      body: "Choose privacy settings and share only the gains and discipline proof you want visible.",
      action: "Open Passport",
      onClick: () => go("passport"),
    },
  ];

  const reveal = reduceMotion
    ? { duration: 0 }
    : OA_LAYOUT;

  return (
    <section className="resources-oa-page">
      <div aria-hidden="true" className="resources-oa-atmosphere" />
      <div className="resources-oa-inner">
        <motion.header
          animate={{ opacity: 1, y: 0 }}
          className="resources-oa-intro"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          transition={reveal}
        >
          <div>
            <h1>Start with the trades you already have.</h1>
            <p>Upload your history. Cova checks the file, builds the review, and shows what needs attention.</p>
          </div>
          <button className="resources-oa-primary" onClick={() => go("import")} type="button">
            Upload CSV
            <ArrowUpRight aria-hidden="true" />
          </button>
        </motion.header>

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="resources-oa-stage"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          transition={reduceMotion ? { duration: 0 } : { ...OA_LAYOUT, delay: 0.06 }}
        >
          <div className="resources-oa-board">
            <div className="resources-oa-board-header">
              <div>
                <span>Quick start</span>
                <strong>From export to proof</strong>
              </div>
              <span>5 steps · completed history only</span>
            </div>

            <div className="resources-oa-content">
              <ol className="resources-oa-steps">
                {quickStartSteps.map((step, index) => (
                  <motion.li
                    animate={{ opacity: 1, x: 0 }}
                    className="resources-oa-step"
                    initial={reduceMotion ? false : { opacity: 0, x: -10 }}
                    key={step.number}
                    transition={reduceMotion ? { duration: 0 } : { ...OA_LAYOUT, delay: 0.08 + index * 0.04 }}
                  >
                    <span className="resources-oa-step-number">{step.number}</span>
                    <div>
                      <h2>{step.title}</h2>
                      <p>{step.body}</p>
                    </div>
                    <button onClick={step.onClick} type="button">
                      {step.action}
                      <ArrowUpRight aria-hidden="true" />
                    </button>
                  </motion.li>
                ))}
              </ol>

              <aside className="resources-oa-sample" aria-label="Sample CSV file check">
                <div className="resources-oa-sample-header">
                  <span>SAMPLE FILE CHECK</span>
                  <strong>READY TO REVIEW</strong>
                </div>
                <div className="resources-oa-file">
                  <span>trades_august.csv</span>
                  <strong>CSV</strong>
                </div>
                <dl className="resources-oa-file-stats">
                  <div>
                    <dt>Rows found</dt>
                    <dd>128</dd>
                  </div>
                  <div>
                    <dt>Mapped</dt>
                    <dd>7 columns</dd>
                  </div>
                  <div>
                    <dt>Review</dt>
                    <dd>2 warnings</dd>
                  </div>
                </dl>
                <div className="resources-oa-mapping">
                  <div><span>Date</span><strong>Trade date</strong></div>
                  <div><span>Market</span><strong>Symbol</strong></div>
                  <div><span>P&amp;L</span><strong>Reported P&amp;L</strong></div>
                </div>
                <div className="resources-oa-notice" role="status">
                  <span>2 rows need review</span>
                  <p>Nothing imports until the member confirms the file.</p>
                </div>
                <button className="resources-oa-secondary" onClick={() => go("import")} type="button">
                  Open CSV import
                  <ArrowUpRight aria-hidden="true" />
                </button>
              </aside>
            </div>

            <div className="resources-oa-boundary">
              <strong>Cova reviews completed history.</strong>
              <span>No orders. No money movement.</span>
            </div>
          </div>
        </motion.div>

        <div className="resources-oa-utility" aria-label="More help">
          <div>
            <span>Optional connections</span>
            <p>Supported account sources appear only when they are configured and available.</p>
            <button onClick={() => go("import")} type="button">View account sources</button>
          </div>
          <div>
            <span>Need help?</span>
            <p>Send the file issue or workflow question directly to Cova support.</p>
            <a href="mailto:support@covadesk.com">support@covadesk.com</a>
          </div>
          <div>
            <span>Ask other traders</span>
            <p>Use the real Cova working room for completed-trade review and product questions.</p>
            <button onClick={() => go("community")} type="button">Open Community</button>
          </div>
        </div>
      </div>
    </section>
  );
}
