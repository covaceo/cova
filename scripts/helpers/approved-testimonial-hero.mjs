import {restoreApprovedHeroCtaSource} from './approved-hero-cta.mjs';
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
const baseline=JSON.parse(readFileSync(new URL("../fixtures/landing-testimonials-baseline.json",import.meta.url),"utf8"));
const importLine='import { TraderTestimonials } from "./landing/TraderTestimonials";';
const approvedSlot='          <TraderTestimonials reviews={followerReviews} />';
export function restoreApprovedTestimonialSource(source) {
 source=restoreApprovedHeroCtaSource("src/components/MarketingHero.tsx",source);
 const crlf=source.includes("\r\n");const lf=source.replaceAll("\r\n","\n");
 if(!lf.includes(importLine)) return source;
 assert.equal(lf.split(importLine).length-1,1,"Only the approved testimonial import may be added");
 assert.equal(lf.split(approvedSlot).length-1,1,"Exactly one approved testimonial presentation slot is required");
 const restored=lf.replace(importLine+"\n","").replace(approvedSlot,baseline.old_review_block);
 assert.equal(createHash("sha256").update(restored).digest("hex"),"83ad1f5e4ff78c5df233b32a0b9d21c07cf45c8504dd69503d8058d8686659d8","All non-testimonial Hero source must remain exact");
 return crlf?restored.replaceAll("\n","\r\n"):restored;
}
