export type StarPoint = {x:number;y:number;radius:number;alpha:number;phase:number;rate:number;amplitude:number;tone:number};
export function makeStarCatalog(count:number, seed=7181):StarPoint[] {
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  return Array.from({length:count},()=>({x:random(),y:random(),radius:.45+Math.pow(random(),3.7)*.85,alpha:.3+Math.pow(random(),2)*.48,phase:random()*Math.PI*2,rate:.22+random()*.55,amplitude:random()<.24?.48:.07,tone:random()}));
}
export function heroCoversViewport(top:number,bottom:number,height:number):boolean {return top<=1&&bottom>=height-1;}
export function starAlpha(star:StarPoint, seconds:number):number {
  const wave=.68*Math.sin(seconds*star.rate+star.phase)+.32*Math.sin(seconds*star.rate*.43+star.phase*2.7);
  return star.alpha*(1-star.amplitude*(.5+.5*wave));
}
