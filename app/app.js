const SB="https://ojxhqbtozjxurzztqxpb.supabase.co";
const KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qeGhxYnRvemp4dXJ6enRxeHBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5ODU1NTAsImV4cCI6MjEwNzU2MTU1MH0.PV-pHhxknw5Vy_J2UuXkY8PS4dNHVLiaPL3a8PSfZd4";
const H={"apikey":KEY,"Authorization":"Bearer "+KEY,"Content-Type":"application/json"};
async function rest(method,path,body){
  const o={method,headers:Object.assign({},H)};
  if(body){o.body=JSON.stringify(body);o.headers["Prefer"]="return=representation";}
  const r=await fetch(SB+path,o);
  const t=await r.text();
  if(!r.ok)throw new Error(t.slice(0,200));
  return t?JSON.parse(t):null;
}
const PLANS={casual:{name:"Casual",mo:0},plus:{name:"Plus",mo:4.99},pro:{name:"Pro",mo:9.99}};
function tierFee(a){if(a<=25)return 1;if(a<=50)return 2;if(a<=100)return 3;if(a<=250)return 5;if(a<=500)return 8;if(a<=1000)return 12;return 15}
function feeFor(a,plan){plan=plan||"casual";if(plan==="plus")return 1;if(plan==="pro")return a<=500?0:tierFee(a)/2;return tierFee(a)}
function money(f){return "$"+(Number.isInteger(f)?f:f.toFixed(2))}
function curPlan(){return localStorage.getItem("ta_plan")||"casual"}
function setPlan(p){localStorage.setItem("ta_plan",p);localStorage.setItem("ta_plan_at",new Date().toISOString());render()}
function cardPlan(id,fallback){return localStorage.getItem("ta_plan_"+id)||fallback||"casual"}
let VIEW="dash",CARDS=[],CHARGES=[],ERR="",LAST=null;
function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
async function load(){
  try{CARDS=await rest("GET","/rest/v1/cards?select=*&order=created_at.desc");CHARGES=await rest("GET","/rest/v1/charges?select=*&order=created_at.desc");ERR="";}
  catch(e){ERR="Could not reach the card store: "+e.message}
  render();
}
function chargesOf(id){return CHARGES.filter(c=>c.card_id===id)}
function feeRowOf(id){const cs=chargesOf(id);for(const c of cs){if(c.decline_reason&&c.decline_reason.startsWith("Trial Armor fee"))return c}return null}
function go(v){VIEW=v;render()}
function genCard(){
  let n="4242";for(let i=0;i<12;i++){n+=Math.floor(Math.random()*10);if((i+1)%4===0&&i<11)n+=" ";}
  return{num:n,mm:String(1+Math.floor(Math.random()*12)).padStart(2,"0"),yy:String(28+Math.floor(Math.random()*3)),cvv:String(100+Math.floor(Math.random()*900)).slice(0,3)};
}
function render(){
  document.getElementById("tab-dash").className=VIEW==="dash"?"on":"";
  document.getElementById("tab-new").className=VIEW==="new"?"on":"";
  document.getElementById("tab-plans").className=VIEW==="plans"?"on":"";
  const v=document.getElementById("view");
  if(VIEW==="dash")v.innerHTML=viewDash();else if(VIEW==="new")v.innerHTML=viewNew();else v.innerHTML=viewPlans();
}
function viewDash(){
  const act=CARDS.filter(c=>c.status==="active").length,dead=CARDS.length-act;
  let s='<div class="page"><div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap"><div><h2 style="font-size:19px">Your Cards</h2><div class="sub">Single-use cards that close after one charge — no more surprise subscription fees.</div></div><button class="btn spacer" onclick="go(\'new\')">+ New Card</button></div>';
  s+='<div class="tiles"><div class="tile slate"><div class="l">Total Cards</div><div class="v">'+CARDS.length+'</div></div><div class="tile green"><div class="l">Active</div><div class="v">'+act+'</div></div><div class="tile red"><div class="l">Auto-Closed</div><div class="v">'+dead+'</div></div></div></div>';
  if(ERR)s+='<div class="msg err">'+esc(ERR)+'</div>';
  if(!CARDS.length){s+='<div class="empty">Create your first single-use card to protect against unwanted subscription charges during free trials.</div>'}
  CARDS.forEach(c=>{
    const fr=feeRowOf(c.id),plan=cardPlan(c.id,fr?parsePlan(fr):"casual");
    const amt=fr?parseAmt(fr):null,fee=fr?fr.amount:null;
    const liveFee=amt!=null?feeFor(amt,plan):null;
    s+='<div class="card"><div class="crow"><div><div class="cname">'+esc(c.merchant_name)+'</div><div class="cnum">'+esc(mask(c.card_number))+' · created '+fmt(c.created_at)+'</div></div>';
    s+='<span class="pill '+(c.status==="active"?"on":"off")+'">'+(c.status==="active"?"● Active — first charge closes the card":"Closed — single-use card spent")+'</span>';
    if(liveFee!=null)s+='<span class="feebadge">Trial Armor fee: '+money(liveFee)+'</span>';
    s+='<span class="planbadge">Plan: '+PLANS[plan].name+'</span>';
    s+='<div class="spacer" style="display:flex;gap:8px"><button class="btn ghost small" onclick="toggle('+JSON.stringify(c.id)+')">History</button><button class="btn ghost small" onclick="delCard(\''+c.id+'\')">Delete</button></div></div>';
    s+='<div id="h_'+c.id+'" style="display:none" class="hist">'+histHTML(c,amt,plan)+'</div></div>';
  });
  if(LAST&&VIEW==="dash")s+='<div class="msg ok">'+LAST+'</div>';
  return s+'</div>';
}
function parsePlan(fr){const m=/plan (\w+)/i.exec(fr.decline_reason||"");return m?m[1].toLowerCase():"casual"}
function parseAmt(fr){const m=/card \$([\d.]+)/i.exec(fr.decline_reason||"");return m?parseFloat(m[1]):null}
function mask(n){const p=String(n).split(" ");return p.slice(0,p.length-1).map(()=>"••••").join(" ")+" "+p[p.length-1]}
function fmt(d){const x=new Date(d);return x.toLocaleDateString("en-CA",{month:"short",day:"numeric"})+", "+x.toLocaleTimeString("en-CA",{hour:"numeric",minute:"2-digit"})}
function histHTML(c,amt,plan){
  const cs=chargesOf(c.id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  let s=cs.length?"":"<div style='color:var(--faint);font-size:12.5px'>No transactions yet.</div>";
  cs.forEach(ch=>{
    const isFee=ch.decline_reason&&ch.decline_reason.startsWith("Trial Armor fee");
    let label=isFee?"<b style='color:#fbbf24'>Trial Armor fee</b>":(ch.status==="succeeded"?"<b>Merchant charge</b>":"Declined — "+esc(ch.decline_reason||"unknown"));
    s+='<div class="h"><span>'+label+'</span><span><b>'+money(ch.amount)+'</b> · '+fmt(ch.created_at)+'</span></div>';
  });
  if(c.status==="active"){
    s+='<div class="chargetest"><input id="ca_'+c.id+'" type="number" step="0.01" min="0.01" placeholder="Charge amount'+(amt!=null?' (e.g. '+amt.toFixed(2)+')':'')+'" style="width:210px"><button class="btn small" onclick="charge(\''+c.id+'\')">Run test charge</button></div>';
  }
  return s;
}
function toggle(id){const el=document.getElementById("h_"+id);el.style.display=el.style.display==="none"?"block":"none"}
async function delCard(id){
  if(!confirm("Delete this card and its history?"))return;
  try{await rest("DELETE","/rest/v1/cards?id=eq."+id);await rest("DELETE","/rest/v1/charges?card_id=eq."+id);}catch(e){alert("Delete failed: "+e.message)}
  load();
}
async function charge(id){
  const inp=document.getElementById("ca_"+id);const a=parseFloat(inp.value);
  if(!(a>0)){alert("Enter a positive amount.");return}
  try{
    const r=await fetch(SB+"/functions/v1/charge-card",{method:"POST",headers:{Authorization:"Bearer "+KEY,"Content-Type":"application/json"},body:JSON.stringify({cardId:id,amount:a})});
    const j=await r.json().catch(()=>({}));
    LAST="Test charge of "+money(a)+": "+(j.status==="succeeded"||r.ok?"APPROVED — card auto-closed (single-use). This was the only charge it will ever approve.":"DECLINED — "+(j.reason||j.decline_reason||"card closed"));
    await load();
  }catch(e){alert("Charge call failed: "+e.message)}
}
let DRAFT={num:null};
function feePreview(){
  const a=parseFloat(document.getElementById("nc_amt").value);
  const plan=curPlan(),f=isNaN(a)||a<=0?null:feeFor(a,plan);
  let s='<div class="feeline">Trial Armor fee: '+(f==null?"—":'<b>'+money(f)+'</b>')+' &nbsp;·&nbsp; Your plan: <b>'+PLANS[plan].name+'</b>';
  if(plan==="plus")s+=' <span style="color:var(--dim)">(flat $1 per card, any amount)</span>';
  if(plan==="pro")s+=' <span style="color:var(--dim)">(no fee up to $500, half fee above)</span>';
  return s+'</div>';
}
function newPreview(){
  document.getElementById("nc_fee").innerHTML=feePreview();
}
async function createCard(){
  const m=document.getElementById("nc_mer").value.trim();
  const a=parseFloat(document.getElementById("nc_amt").value);
  if(!m){alert("Merchant name is required.");return}
  if(!(a>0)){alert("Enter the trial charge amount.");return}
  const g=genCard(),plan=curPlan(),fee=feeFor(a,plan);
  try{
    const cards=await rest("POST","/rest/v1/cards",{merchant_name:m,card_number:g.num,card_expiry_month:g.mm,card_expiry_year:g.yy,card_cvv:g.cvv,status:"active"});
    const c=cards[0];
    localStorage.setItem("ta_plan_"+c.id,plan);
    await rest("POST","/rest/v1/charges",{card_id:c.id,amount:fee,status:"succeeded",decline_reason:"Trial Armor fee — card $"+a.toFixed(2)+", plan "+PLANS[plan].name});
    LAST="Card created for "+esc(m)+". Trial Armor fee "+money(fee)+" charged. Ready — the first merchant charge closes it.";
    go("dash");load();
  }catch(e){alert("Create failed: "+e.message)}
}
function viewNew(){
  return '<div class="page"><h2 style="font-size:19px">New Single-Use Card</h2><div class="sub">One card, one charge. It closes itself the moment the first charge goes through.</div>'+
  '<div class="form"><label>Merchant / trial name</label><input id="nc_mer" placeholder="e.g. Netflix, Adobe, HelloFresh" style="width:100%">'+
  '<label>Trial charge amount (USD)</label><input id="nc_amt" type="number" step="0.01" min="0.01" placeholder="e.g. 9.99" oninput="newPreview()" style="width:100%">'+
  '<div id="nc_fee">'+feePreview()+'</div>'+
  '<div style="margin-top:16px;display:flex;gap:10px"><button class="btn" onclick="createCard()">Create card</button><button class="btn ghost" onclick="go(\'dash\')">Cancel</button></div>'+
  '<div style="margin-top:14px;color:var(--faint);font-size:12px">A single-use Mastercard-style number is generated on the spot. Fee is charged when the card is created.</div></div></div>';
}
function viewPlans(){
  const cur=curPlan();
  const tiles=[
    {id:"casual",n:"Casual",p:"No plan",u:"",feats:["Pay per card: $1–$15 by trial size","No monthly cost","Perfect for one-off trials"]},
    {id:"plus",n:"Plus",p:"$4.99",u:"/month",feats:["Flat $1 per card at any amount","No monthly fee per card","Best if you run trials often"]},
    {id:"pro",n:"Pro",p:"$9.99",u:"/month",feats:["No per-card fee up to $500","Half the tiered fee above $500","Unlimited single-use cards"]}];
  let s='<div class="page"><h2 style="font-size:19px">Plans</h2><div class="sub">Pick how you pay the Trial Armor fee. Your plan applies to every card you create.</div><div class="plans">';
  tiles.forEach(t=>{
    s+='<div class="plan'+(cur===t.id?" cur":"")+'">'+(cur===t.id?'<div class="tag">CURRENT</div>':"")+'<h3>'+t.n+'</h3><div class="price">'+t.p+'<span>'+t.u+'</span></div><ul>'+t.feats.map(f=>"<li>"+f+"</li>").join("")+'</ul><button class="btn'+(cur===t.id?" ghost":"")+'" style="width:100%" '+(cur===t.id?"disabled":"")+' onclick="setPlan(\''+t.id+'\')">'+(cur===t.id?"Current plan":"Switch to "+t.n)+'</button></div>';
  });
  s+='</div><div class="tiers"><b style="font-size:14px">Per-card fee by trial size</b><table>';
  [[0,25,1],[26,50,2],[51,100,3],[101,250,5],[251,500,8],[501,1000,12],[1001,null,15]].forEach(r=>{
    const range=r[1]==null?"Over $"+r[0]:"$"+r[0]+" – $"+r[1];
    const f=cur==="plus"?"$1 flat":(cur==="pro"?(r[0]<=500?"$0":"$"+(r[2]/2).toFixed(2).replace(/\.00$/,"")):"$"+r[2]);
    const hl=cur==="casual";
    s+='<tr class="'+(hl?"hl":"")+'"><td>'+range+'</td><td>'+f+'</td></tr>';
  });
  return s+'</table><div style="color:var(--faint);font-size:11.5px;margin-top:8px">Fees shown for your current plan ('+PLANS[cur].name+'). Fee is charged once, when the card is created.</div></div></div>';
}
load();
