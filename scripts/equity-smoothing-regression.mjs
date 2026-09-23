import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
const {buildEquityGeometry}=load('src/lib/dashboardPresentation.ts');
const data=values=>values.map((value,i)=>({label:String(i),value}));
test('equity path smoothly interpolates every observation and its fill uses the same boundary',()=>{
 const input=data([0,-100,120,80,410,340]),chart=buildEquityGeometry(input);
 assert.equal((chart.line.match(/C/g)||[]).length,input.length-1,'Each real interval must have a curved segment');
 assert.deepEqual(chart.points.map(p=>p.value),input.map(p=>p.value));
 assert(chart.area.startsWith(chart.line+' L'),'Fill exactly follows the smoothed line');
});

function segments(chart){return [...chart.line.matchAll(/C([^CML]+)/g)].map(m=>m[1].trim().split(/[ ,]+/).map(Number));}
const cubic=(a,b,c,d,t)=>(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d;
test('smoothed paths have no overshoot, new extrema, backtracking or broken tangents',()=>{
 let seed=913;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 const fixtures=[[0,0,0,0],[0,100,100,100,-50],[0,1000,-1000,1000,0],[0,.01,-.01,0],[0,1,2,10000,10001],[0,10000,10001,10002],[0,-1,-2,-10000,-10001],[1e12,.01,-1e12,0]];
 for(let i=0;i<120;i++)fixtures.push(Array.from({length:3+i%24},()=>Math.round((random()-.5)*100000)/100));
 for(const values of fixtures)for(const width of [324,680,1200]){
  const chart=buildEquityGeometry(data(values),width),curves=segments(chart);assert.equal(curves.length,values.length-1);
  assert(!/NaN|Infinity/.test(chart.line+chart.area));
  curves.forEach(([x1,y1,x2,y2,x3,y3],i)=>{
   const a=chart.points[i],b=chart.points[i+1];assert.equal(x3,b.x);assert.equal(y3,b.y);assert(a.x<x1&&x1<x2&&x2<x3);
   let previousX=a.x,previousY=a.y;
   for(let step=0;step<=100;step++){
    const t=step/100,x=cubic(a.x,x1,x2,x3,t),y=cubic(a.y,y1,y2,y3,t);
    assert(x>=previousX-1e-9);assert(y>=Math.min(a.y,b.y)-1e-9&&y<=Math.max(a.y,b.y)+1e-9);
    assert((b.y>=a.y?y-previousY:previousY-y)>=-1e-9);previousX=x;previousY=y;
   }
   if(i){const prior=curves[i-1],incoming=(a.y-prior[3])/(a.x-prior[2]),outgoing=(y1-a.y)/(x1-a.x);assert(Math.abs(incoming-outgoing)<1e-8,'Continuous tangent through every observation');}
  });
 }
});
test('empty, single and two-point plots never invent intermediate observations',()=>{
 for(const input of [[],data([.01]),data([0,-10])]){
  const chart=buildEquityGeometry(input);assert(!/C|NaN|Infinity/.test(chart.line));assert.equal(chart.points.length,input.length||1);assert.equal((chart.line.match(/L/g)||[]).length,input.length===2?1:0);
 }
});
