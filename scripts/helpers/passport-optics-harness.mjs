// Deterministic DOM/GPU lifecycle harness. Pixel correctness is tested in real Chrome.
export function createOpticsHarness(mount) {
  const names=['window','document','Image','ResizeObserver','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame'];
  const original=Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const frames=new Map(); let next=0,time=0,resizeCallback,intersectionCallback,painted=false,generation=0,invalidDeletes=0;
  const media=Object.assign(new EventTarget(),{matches:false});
  const document=Object.assign(new EventTarget(),{hidden:false});
  const window=Object.assign(new EventTarget(),{matchMedia:()=>media,devicePixelRatio:1});
  const face=Object.assign(new EventTarget(),{dataset:{},style:{},clientWidth:1000,setPointerCapture(){},parentElement:{getBoundingClientRect:()=>({left:0,top:0,width:1000,height:560})}});
  const uniforms = {};
  const gpu=new Proxy({
    isContextLost:()=>false,createShader:()=>({generation}),createProgram:()=>({generation}),createBuffer:()=>({generation}),createTexture:()=>({generation}),
    ...Object.fromEntries(["deleteShader","deleteProgram","deleteBuffer","deleteTexture"].map(name=>[name,object=>{if(object.generation!==generation)invalidDeletes++;}])),
    getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:(_,name)=>name,uniform1f:(name,value)=>{uniforms[name]=value;},uniform2f:(name,...values)=>{uniforms[name]=values;},uniform4f:(name,...values)=>{uniforms[name]=values;},drawArrays:()=>{painted=true;}
  },{get:(object,key)=>key in object?object[key]:String(key).toUpperCase()===key?0:()=>{}});
  let width=300,height=150;
  const canvas=Object.assign(new EventTarget(),{getContext:()=>gpu,toDataURL:()=>painted?'drawn-material':'cleared-material'});
  Object.defineProperties(canvas,{width:{get:()=>width,set:value=>{width=value;painted=false;}},height:{get:()=>height,set:value=>{height=value;painted=false;}}});
  Object.assign(globalThis,{
    window,document,
    Image:class {naturalWidth=1672;naturalHeight=941;set src(value){this.url=value;this.onload?.();}get src(){return this.url;}},
    ResizeObserver:class {constructor(callback){resizeCallback=callback;}observe(){}disconnect(){}},
    IntersectionObserver:class {constructor(callback){intersectionCallback=callback;}observe(){}disconnect(){}},
    requestAnimationFrame:callback=>{frames.set(++next,callback);return next;},cancelAnimationFrame:id=>frames.delete(id)
  });
  const dispose=mount(face,canvas,'sample-material');
  function step(ms=16){const batch=[...frames.values()];frames.clear();time+=ms;batch.forEach(callback=>callback(time));}
  function settle(){for(let i=0;frames.size && i<120;i++){const batch=[...frames.values()];frames.clear();time+=16;batch.forEach(callback=>callback(time));}if(frames.size)throw new Error('Optics did not settle');}
  function pointer(type,id,x=800,primary=true){const event=new Event(type);Object.assign(event,{pointerType:'touch',pointerId:id,isPrimary:primary,button:0,clientX:x,clientY:280});face.dispatchEvent(event);}
  return {face,canvas,media,uniforms,settle,step,pending:()=>frames.size,visibility:hidden=>{document.hidden=hidden;document.dispatchEvent(new Event("visibilitychange"));},pointer,painted:()=>painted,invalidDeletes:()=>invalidDeletes,loseRestore:()=>{for(const key of Object.keys(uniforms))delete uniforms[key];generation++;canvas.dispatchEvent(new Event("webglcontextlost",{cancelable:true}));canvas.dispatchEvent(new Event("webglcontextrestored"));},intersect:visible=>intersectionCallback([{isIntersecting:visible}]),resize:value=>{face.clientWidth=value;resizeCallback();},
    close(){dispose();for(const name of names){if(original[name])Object.defineProperty(globalThis,name,original[name]);else delete globalThis[name];}}
  };
}
