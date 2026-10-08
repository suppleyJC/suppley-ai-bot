/** Exibição apenas: corrige UTF-8 interpretado como Windows-1252/Latin-1. */
const cp1252: Record&lt;string, number&gt; = {
  "€":128,"‚":130,"ƒ":131,"„":132,"…":133,"†":134,"‡":135,"ˆ":136,
  "‰":137,"Š":138,"‹":139,"Œ":140,"Ž":142,"‘":145,"’":146,
  "“":147,"”":148,"•":149,"–":150,"—":151,"˜":152,"™":153,
  "š":154,"›":155,"œ":156,"ž":158,"Ÿ":159,
};
function byte(c: string): number | undefined {
  const n=c.charCodeAt(0);
  return n&lt;=255?n:cp1252[c];
}
function once(s: string): string {
  let out="";
  for(let i=0;i&lt;s.length;){
    const b=byte(s[i]);
    const size=b===undefined?0:b&gt;=194&amp;&amp;b&lt;=223?2:b&gt;=224&amp;&amp;b&lt;=239?3:b&gt;=240&amp;&amp;b&lt;=244?4:0;
    const arr: number[]=[];
    if(size&amp;&amp;i+size&lt;=s.length){
      arr.push(b!);
      for(let j=1;j&lt;size;j++){
        const v=byte(s[i+j]);
        if(v===undefined||v&lt;128||v&gt;191)break;
        arr.push(v);
      }
      if(arr.length===size){
        try{
          out+=decodeURIComponent(arr.map(v=&gt;"%"+v.toString(16).padStart(2,"0")).join(""));
          i+=size;continue;
        }catch{ /* preserve invalid bytes */ }
      }
    }
    out+=s[i++];
  }
  return out;
}
export function corrigirMojibake(s: string | null | undefined): string {
  if(!s)return s??"";
  for(let k=0;k&lt;4;k++){
    const next=once(s);
    if(next===s)break;
    s=next;
  }
  return s;
}
