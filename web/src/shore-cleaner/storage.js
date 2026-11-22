export const SHORE_SAVE_KEY='marineguarder.shore-cleaner.v1';
const numericRunFields=['money','collected','recycled','ascensions','shards','lifetime','ascendProgress','eggs','zoneCollected'];
function safe(value,depth=0) {
  if(depth>12)return false;
  if(value===null||typeof value==='boolean')return true;
  if(typeof value==='number')return Number.isFinite(value)&&Math.abs(value)<=1e15;
  if(typeof value==='string')return value.length<=500&&!/[<>]/.test(value);
  if(Array.isArray(value))return value.length<=1000&&value.every(item=>safe(item,depth+1));
  if(value&&typeof value==='object')return Object.keys(value).length<=1000&&Object.entries(value).every(([key,item])=>
    !['__proto__','prototype','constructor'].includes(key)&&safe(key,depth+1)&&safe(item,depth+1));
  return false;
}
function valid(value) {
  return value&&typeof value==='object'&&!Array.isArray(value)&&safe(value)&&
    (!value.run||(typeof value.run==='object'&&!Array.isArray(value.run)&&numericRunFields.every(key=>value.run[key]===undefined||
      (Number.isFinite(value.run[key])&&value.run[key]>=0))));
}
export function readShoreSave(storage) {
  try{const value=JSON.parse(storage?.getItem(SHORE_SAVE_KEY)??'{}');return valid(value)?value:{};}catch{return {};}
}
export function writeShoreSave(storage,value) {
  try{if(!storage?.setItem||!valid(value))return false;storage.setItem(SHORE_SAVE_KEY,JSON.stringify(value));return true;}catch{return false;}
}
