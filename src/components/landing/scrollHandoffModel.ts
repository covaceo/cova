export type ScrollHandoffInput={heroTop:number;heroHeight:number;featureTop:number;viewportHeight:number;reduced:boolean};
const bounded=(n:number)=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
const ease=(n:number)=>n*n*(3-2*n);
export function scrollHandoffPose(input:ScrollHandoffInput) {
 if(input.reduced)return {heroY:0,heroOpacity:1,featureY:0,featureOpacity:1};
 const height=Number.isFinite(input.heroHeight)&&input.heroHeight>0?input.heroHeight:1;
 const viewport=Number.isFinite(input.viewportHeight)&&input.viewportHeight>0?input.viewportHeight:1;
 const leaving=ease(bounded(-input.heroTop/(height*.75)));
 const arriving=ease(bounded((viewport-input.featureTop)/(viewport*.7)));
 return {heroY:leaving===0?0:-32*leaving,heroOpacity:1-.45*leaving,featureY:36*(1-arriving),featureOpacity:.9+.1*arriving};
}
