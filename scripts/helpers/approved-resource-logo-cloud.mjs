import assert from 'node:assert/strict';
const importLine='import { ResourceLogoCloud } from "./landing/ResourceLogoCloud";\n';
const returnLine='  if (compact) return <ResourceLogoCloud ninjaTraderHref={NINJATRADER_LINK} kinetickHref={KINETICK_LINK} />;\n';
export function restoreApprovedResourceCloudSource(source){
 source=source.replaceAll('\r\n','\n');
 for(const line of [importLine,returnLine]){assert.equal(source.split(line).length,2,'Exact approved logo-cloud insertion occurs once');source=source.replace(line,'');}
 return Buffer.from(source.replaceAll('\n','\r\n'));
}
