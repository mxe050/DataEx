/* In-memory presentation cache only. The full input is compared; no extraction is skipped. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.DataExPresentationCache=api.create();})(typeof window==='undefined'?null:window,()=>{
 'use strict';
 function create(){const cache=new WeakMap();let hits=0,misses=0;
  return Object.freeze({
   get(study,context,build){const key=JSON.stringify([study,context]),entry=cache.get(study);if(entry?.key===key){hits++;return structuredClone(entry.value);}misses++;const value=build();cache.set(study,{key,value:structuredClone(value)});return value;},
   metrics:()=>({hits,misses})
  });
 }
 return Object.freeze({create});
});
