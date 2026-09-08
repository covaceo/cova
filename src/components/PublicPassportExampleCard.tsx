import { PassportHoloCard } from "./PassportHoloCard";
import { getMaterialSpec } from "../lib/passportMaterials";
import diamondMaterial from "../assets/passport-diamond-material.webp?inline";
import type { HoloPassportModel } from "../lib/passportHolo";

export const publicDiamondExample: HoloPassportModel = {
  mode: "flex", modeLabel: "Flex", identity: "Trader 6714", rank: "Diamond",
  marketLine: "NQ / ES · 25 reviewed trades", heroValue: "+$1,008", heroLabel: "Reported P&L",
  support: ["4/6 rules held"], ruleSummary: "4/6 rules held",
  provenance: "Sample data · Not account verified", sample: true,
};
const diamond = { ...getMaterialSpec("Diamond", "standard"), materialUrl: diamondMaterial };

/** The same illustrative Diamond as the approved homepage, not an earned account rank. */
export function PublicPassportExampleCard({ active = true }: { active?: boolean }) {
  return <div className="public-passport-example" data-public-passport-example="diamond">
    <div className="public-passport-example-stage">
      {active && <PassportHoloCard model={publicDiamondExample} appearance={diamond} engraved />}
    </div>
  </div>;
}
