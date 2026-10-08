/** Decodificação de texto legado apenas para exibição (sem alterar os registros). */
const special: { [key: string]: number } = {
  "€":128,"‚":130,"ƒ":131,"„":132,"…":133,"†":134,"‡":135,"ˆ":136,
  "‰":137,"Š":138,"‹":139,"Œ":140,"Ž":142,"‘":145,"’":146,
  "“":147,"”":148,"•":149,"–":150,"—":151,"˜":152,"™":153,
  "š":154,"›":155,"œ":156,"ž":158,"Ÿ":159,
};
function byte(c: string): number | undefined {
  const n=c.charCodeAt(0);
  return (n>>>8)===0?n:special[c];
}
function once(s: string): string {
  let out="";
  let i=0;
  while(i!==s.length){
    const b=byte(s[i]);
    const size=b===undefined?0:(b>>>5)===6?2:(b>>>4)===14?3:(b>>>3)===30?4:0;
    let hex="";
    if(size!==0){
      for(let j=0;j!==size;j++){
        const x=byte(s[i+j]???"");
        if(x===undefined || (j!==0 && (x>>>6)!==2)){hex="";break;}
        hex+="%"+x.toString(16).padStart(2,"0");
      }
    }
    if(hex){
      try{
        out+=decodeURIComponent(hex);
        i+=size;
        continue;
      }catch{ /* manter sequência inválida */ }
    }
    out+=s[i];
    i++;
  }
  return out;
}
export function corrigirMojibake(s: string | null | undefined): string {
  if(!s)return s??"";
  for(let pass=0;pass!==4;pass++){
    const next=once(s);
    if(next===s)break;
    s=next;
  }
  return s;
}
