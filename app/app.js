// Trial Armor app logic (branch improvements-nov7)
// Accounts + row-level security aware. Demo data is read-only for visitors.
// Card numbers are stored as last-4 only; CVVs are never stored.
const SB="https://ojxhqbtozjxurzztqxpb.supabase.co";
const KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qeGhxYnRvemp4dXJ6enRxeHBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5ODU1NTAsImV4cCI6MjEwNzU2MTU1MH0.PV-pHhxknw5Vy_J2UuXkY8PS4dNHVLiaPL3a8PSfZd4";
const CORE=window.TACore;
const tierFee=CORE.tierFee,feeFor=CORE.feeFor,money=CORE.money,mask=CORE.mask,parsePlan=CORE.parsePlan,parseAmt=CORE.parseAmt;
const ISS=window.TAIssuing; // sandbox issuing adapter; no real issuer is contacted

const PLANS={casual:{name:"Casual",mo:0},plus:{name:"Plus",mo:4.99},pro:{name:"Pro",mo:9.99}};

/* ---------- auth ---------- */
const AUTH_KEY="ta_session";
function session(){try{return JSON.parse(localStorage.getItem(AUTH_KEY)||"null")}catch(e){return null}}
function saveSession(j){
  if(j&&j.access_token)localStorage.setItem(AUTH_KEY,JSON.stringify({access_token:j.access_token,refresh_token:j.refresh_token,expires_at:Date.now()+(j.expires_in||3600)*1000,user:j.user}));
  else localStorage.removeItem(AUTH_KEY);
  USER=session()?session().user:null;
}
let USER=session()?session().user:null;
async function ensureToken(){
  const s=session();if(!s)return null;
  if(s.expires_at-60000<Date.now()){
    try{
      const r=await fetch(SB+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{"apikey":KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:s.refresh_token})});
      const j=await r.json();
      if(!r.ok||!j.access_token)throw new Error(j.error_description||"session expired");
      saveSession(j);
    }catch(e){saveSession(null);return null}
  }
  return session();
}
async function signUp(email,pass){
  const r=await fetch(SB+"/auth/v1/signup",{method:"POST",headers:{"apikey":KEY,"Content-Type":"application/json"},body:JSON.stringify({email,password:pass})});
  const j=await r.json();
  if(!r.ok)throw new Error(j.msg||j.error_description||j.error||"Sign up failed");
  saveSession(j);return j;
}
async function signIn(email,pass){
  const r=await fetch(SB+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"apikey":KEY,"Content-Type":"application/json"},body:JSON.stringify({email,password:pass})});
  const j=await r.json();
  if(!r.ok)throw new Error(j.error_description||j.msg||"Sign in failed");
  saveSession(j);return j;
}
async function signOut(){
  const s=session();
  if(s){try{await fetch(SB+"/auth/v1/logout",{method:"POST",headers:{"apikey":KEY,"Authorization":"Bearer "+s.access_token,"Content-Type":"application/json"}})}catch(e){}}
  saveSession(null);go("dash");load();
}

/* ---------- data ---------- */
let VIEW="dash",CARDS=[],CHARGES=[],ERR="",LAST=null,LOADING=true;
async function rest(method,path,body){
  const s=await ensureToken();
  const h={"apikey":KEY,"Content-Type":"application/json","Authorization":"Bearer "+(s?s.access_token:KEY)};
  const o={method,headers:h};
  if(body){o.body=JSON.stringify(body);o.headers["Prefer"]="return=representation";}
  const r=await fetch(SB+path,o);
  const t=await r.text();
  if(!r.ok){let m=t;try{m=JSON.parse(t).message||t}catch(e){}throw new Error(m.slice(0,200));}
  return t?JSON.parse(t):null;
}
// Insert with ownership. If the schema migration has not run yet (no `owner`
// column), fall back to the old shape so the app keeps working during rollout.
async function insertRow(table,row){
  const s=session();
  if(!s)return rest("POST","/rest/v1/"+table,row);
  try{return await rest("POST","/rest/v1/"+table,Object.assign({owner:s.user.id},row))}
  catch(e){if(/owner|PGRST204|42703/i.test(String(e.message)))return rest("POST","/rest/v1/"+table,row);throw e}
}
async function load(){
  LOADING=true;render();
  try{
    CARDS=await rest("GET","/rest/v1/cards?select=*&order=created_at.desc");
    CHARGES=await rest("GET","/rest/v1/charges?select=*&order=created_at.desc");
    ERR="";
  }catch(e){ERR="Could not reach the card store: "+e.message}
  LOADING=false;render();
}
function chargesOf(id){return CHARGES.filter(c=>c.card_id===id)}
function feeRowOf(id){const cs=chargesOf(id);for(const c of cs){if(c.decline_reason&&c.decline_reason.startsWith("Trial Armor fee"))return c}return null}
function go(v){VIEW=v;render()}
function curPlan(){return localStorage.getItem("ta_plan")||"casual"}
function setPlan(p){localStorage.setItem("ta_plan",p);localStorage.setItem("ta_plan_at",new Date().toISOString());render()}
function cardPlan(id,fallback){return localStorage.getItem("ta_plan_"+id)||fallback||"casual"}
function fmt(d){const x=new Date(d);return x.toLocaleDateString("en-CA",{month:"short",day:"numeric"})+", "+x.toLocaleTimeString("en-CA",{hour:"numeric",minute:"2-digit"})}

/* ---------- card creation (sandbox: simulated number, stored as last-4 only) ---------- */
function genCard(){
  let n="4242";for(let i=0;i<12;i++){n+=Math.floor(Math.random()*10);if((i+1)%4===0&&i<11)n+=" ";}
  return{num:n,mm:String(1+Math.floor(Math.random()*12)).padStart(2,"0"),yy:String(new Date().getFullYear()+1+Math.floor(Math.random()*2)),cvv:String(100+Math.floor(Math.random()*900)).slice(0,3)};
}

/* ---------- render ---------- */
function render(){
  document.getElementById("tab-dash").className=VIEW==="dash"?"on":"";
  document.getElementById("tab-new").className=VIEW==="new"?"on":"";
  document.getElementById("tab-plans").className=VIEW==="plans"?"on":"";
  document.getElementById("tab-account").className=VIEW==="account"?"on":"";
  const v=document.getElementById("view");
  if(VIEW==="dash")v.innerHTML=viewDash();
  else if(VIEW==="new")v.innerHTML=viewNew();
  else if(VIEW==="plans")v.innerHTML=viewPlans();
  else v.innerHTML=viewAccount();
}
function viewDash(){
  const demo=!USER;
  const act=CARDS.filter(c=>c.status==="active").length,dead=CARDS.length-act;
  let s='<div class="page">';
  if(demo)s+='<div class="banner" role="note"><b>You are viewing the public demo.</b> Demo cards are read-only and contain no real card data. Create a free account (Account tab) to make your own single-use cards.</div>';
  s+='<div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap"><div><h2 style="font-size:19px">'+(demo?"Demo Cards":"Your Cards")+'</h2><div class="sub">Single-use cards that close after one charge — no more surprise subscription fees.</div></div>';
  if(!demo)s+='<button class="btn spacer" onclick="go(\'new\')" aria-label="Create a new single-use card">+ New Card</button>';
  s+='</div>';
  s+='<div class="tiles"><div class="tile slate"><div class="l">Total Cards</div><div class="v">'+CARDS.length+'</div></div><div class="tile green"><div class="l">Active</div><div class="v">'+act+'</div></div><div class="tile red"><div class="l">Auto-Closed</div><div class="v">'+dead+'</div></div></div>';
  if(ERR)s+='<div class="msg err" role="alert">'+esc(ERR)+' <button class="btn ghost small" onclick="load()" aria-label="Retry loading your cards">Retry</button></div>';
  else if(LOADING&&!CARDS.length)s+='<div class="empty" role="status"><span class="spin" aria-hidden="true"></span>Loading your cards…</div>';
  else if(!CARDS.length){s+='<div class="empty">Create your first single-use card to protect against unwanted subscription charges during free trials.'+(demo?" Sign in from the Account tab to get started.":"")+'</div>';}
  CARDS.forEach(c=>{
    const fr=feeRowOf(c.id),plan=cardPlan(c.id,fr?parsePlan(fr):"casual");
    const amt=fr?parseAmt(fr):null,fee=fr?fr.amount:null;
    const liveFee=amt!=null?feeFor(amt,plan):null;
    const mine=!demo;
    s+='<div class="card"><div class="crow"><div><div class="cname">'+esc(c.merchant_name)+'</div><div class="cnum">'+esc(mask(c.card_number))+' · created '+fmt(c.created_at)+(c.is_demo?' · <span style="color:var(--faint)">demo card</span>':'')+'</div></div>';
    s+='<span class="pill '+(c.status==="active"?"on":"off")+'">'+(c.status==="active"?"● Active — first charge closes the card":"Closed — single-use card spent")+'</span>';
    if(liveFee!=null)s+='<span class="feebadge">Trial Armor fee: '+money(liveFee)+'</span>';
    s+='<span class="planbadge">Plan: '+PLANS[plan].name+'</span>';
    s+='<div class="spacer" style="display:flex;gap:8px"><button class="btn ghost small" onclick="toggle('+JSON.stringify(c.id)+')" aria-label="Show transaction history for '+esc(c.merchant_name)+'">History</button>';
    if(mine)s+='<button class="btn ghost small" onclick="delCard(\''+c.id+'\')" aria-label="Delete card '+esc(c.merchant_name)+'">Delete</button>';
    s+='</div></div>';
    s+='<div id="h_'+c.id+'" style="display:none" class="hist">'+histHTML(c,amt,plan,mine)+'</div></div>';
  });
  if(LAST&&VIEW==="dash")s+='<div class="msg ok" role="status">'+LAST+'</div>';
  return s+'</div>';
}
function histHTML(c,amt,plan,mine){
  const cs=chargesOf(c.id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  let s=cs.length?"":"<div style='color:var(--faint);font-size:12.5px'>No transactions yet.</div>";
  cs.forEach(ch=>{
    const isFee=ch.decline_reason&&ch.decline_reason.startsWith("Trial Armor fee");
    let label=isFee?"<b style='color:#fbbf24'>Trial Armor fee</b>":(ch.status==="succeeded"?"<b>Merchant charge</b>":"Declined — "+esc(ch.decline_reason||"unknown"));
    s+='<div class="h"><span>'+label+'</span><span><b>'+money(ch.amount)+'</b> · '+fmt(ch.created_at)+'</span></div>';
  });
  if(mine&&c.status==="active"){
    s+='<div class="chargetest"><label for="ca_'+c.id+'" style="position:absolute;left:-9999px">Charge amount</label><input id="ca_'+c.id+'" type="number" step="0.01" min="0.01" placeholder="Charge amount'+(amt!=null?' (e.g. '+amt.toFixed(2)+')':'')+'" style="width:210px"><button class="btn small" onclick="charge(\''+c.id+'\')" aria-label="Run a test charge on this card">Run test charge</button></div>';
  }
  if(mine)s+="<div style='color:var(--faint);font-size:11.5px;margin-top:6px'>Simulated processor. No real charge ever runs in this build.</div>";
  return s;
}
function toggle(id){const el=document.getElementById("h_"+id);el.style.display=el.style.display==="none"?"block":"none"}
async function delCard(id){
  if(!USER)return;
  if(!confirm("Delete this card and its history?"))return;
  try{
    await rest("DELETE","/rest/v1/charges?card_id=eq."+id);
    await rest("DELETE","/rest/v1/cards?id=eq."+id);
    LAST="Card deleted.";
  }catch(e){alert("Delete failed: "+e.message)}
  load();
}
async function charge(id){
  if(!USER){go("account");return}
  const inp=document.getElementById("ca_"+id);const a=parseFloat(inp.value);
  if(!(a>0)){alert("Enter a positive amount.");return}
  const s=await ensureToken();
  try{
    const r=await fetch(SB+"/functions/v1/charge-card",{method:"POST",headers:{"Authorization":"Bearer "+(s?s.access_token:KEY),"Content-Type":"application/json","x-ta-idempotency-key":ISS.makeIdemKey("chg")},body:JSON.stringify({cardId:id,amount:a})});
    const j=await r.json().catch(()=>({}));
    if(r.status===401){LAST="Sign in to run charges — the charge endpoint no longer accepts anonymous calls.";render();return}
    LAST="Test charge of "+money(a)+": "+(j.status==="succeeded"||r.ok?"APPROVED — card auto-closed (single-use). This was the only charge it will ever approve. (Simulated — no real money.)":"DECLINED — "+(j.reason||j.decline_reason||j.error||"card closed"));
    await load();
  }catch(e){alert("Charge call failed: "+e.message)}
}
function feePreview(){
  const a=parseFloat(document.getElementById("nc_amt").value);
  const plan=curPlan(),f=isNaN(a)||a<=0?null:feeFor(a,plan);
  let s='<div class="feeline">Trial Armor fee: '+(f==null?"—":'<b>'+money(f)+'</b>')+' &nbsp;·&nbsp; Your plan: <b>'+PLANS[plan].name+'</b>';
  if(plan==="plus")s+=' <span style="color:var(--dim)">(flat $1 per card, any amount)</span>';
  if(plan==="pro")s+=' <span style="color:var(--dim)">(no fee up to $500, half fee above)</span>';
  return s+'</div>';
}
function newPreview(){document.getElementById("nc_fee").innerHTML=feePreview()}
async function createCard(){
  if(!USER){go("account");return}
  const m=document.getElementById("nc_mer").value.trim();
  const a=parseFloat(document.getElementById("nc_amt").value);
  if(!m){alert("Merchant name is required.");return}
  if(!(a>0)){alert("Enter the trial charge amount.");return}
  const g=genCard(),plan=curPlan(),fee=feeFor(a,plan);
  try{
    const cards=await insertRow("cards",{merchant_name:m,card_number:g.num.replace(/ /g,"").slice(-4),card_expiry_month:g.mm,card_expiry_year:g.yy,card_cvv:null,status:"active"});
    const c=cards[0];
    localStorage.setItem("ta_plan_"+c.id,plan);
    await insertRow("charges",{card_id:c.id,amount:fee,status:"succeeded",decline_reason:"Trial Armor fee — card $"+a.toFixed(2)+", plan "+PLANS[plan].name});
    LAST='Card created for '+esc(m)+'. Simulated number <b>'+esc(g.num)+'</b>, expires '+g.mm+'/'+g.yy.slice(-2)+' — <span class="sandboxbadge">SANDBOX</span> shown once, not stored. Only the last 4 digits are saved. Trial Armor fee '+money(fee)+' charged. First merchant charge closes it.';
    go("dash");load();
  }catch(e){alert("Create failed: "+e.message)}
}
function viewNew(){
  return '<div class="page"><h2 style="font-size:19px">New Single-Use Card</h2><div class="sub">One card, one charge. It closes itself the moment the first charge goes through.</div>'+
  '<div class="form"><label for="nc_mer">Merchant / trial name</label><input id="nc_mer" placeholder="e.g. Netflix, Adobe, HelloFresh" style="width:100%">'+
  '<label for="nc_amt">Trial charge amount (USD)</label><input id="nc_amt" type="number" step="0.01" min="0.01" placeholder="e.g. 9.99" oninput="newPreview()" style="width:100%">'+
  '<div id="nc_fee">'+feePreview()+'</div>'+
  '<div style="margin-top:16px;display:flex;gap:10px"><button class="btn" onclick="createCard()" aria-label="Create the card">Create card</button><button class="btn ghost" onclick="go(\'dash\')">Cancel</button></div>'+
  '<div style="margin-top:14px;color:var(--faint);font-size:12px">Sandbox build: the number is simulated and shown once; only the last 4 digits are stored, and no CVV is kept. A real number comes from the issuer once the sponsor-bank program is live.</div></div></div>';
}

/* ---------- plans ---------- */
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
  return s+'</table><div style="color:var(--faint);font-size:11.5px;margin-top:8px">Fees shown for your current plan ('+PLANS[cur].name+'). Fee is charged once, when the card is created. Plan selection is stored on this device for now; billing arrives with the live launch.</div></div></div>';
}

/* ---------- account ---------- */
function viewAccount(){
  if(USER){
    return '<div class="page"><h2 style="font-size:19px">Account</h2><div class="sub">Signed in as '+esc(USER.email||"your account")+'</div>'+
    '<div class="authbox"><div style="margin-bottom:12px">Current plan: <b>'+PLANS[curPlan()].name+'</b> <span style="color:var(--faint);font-size:12px">(stored on this device; billing comes with the live launch)</span></div>'+
    '<button class="btn ghost" onclick="signOut()" aria-label="Sign out of Trial Armor">Sign out</button>'+
    '<div style="margin-top:14px;color:var(--faint);font-size:12px">Your cards are private to this account. Demo cards stay visible to everyone but are read-only and hold no real card data.</div></div></div>';
  }
  return '<div class="page"><h2 style="font-size:19px">Account</h2><div class="sub">Create a free account to make your own single-use cards. No card required.</div>'+
  '<div class="authbox"><label for="ac_email">Email</label><input id="ac_email" type="email" autocomplete="email" style="width:100%">'+
  '<label for="ac_pass">Password</label><input id="ac_pass" type="password" autocomplete="current-password" style="width:100%">'+
  '<div id="ac_err" class="autherr" role="alert"></div>'+
  '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" onclick="doSignIn()" aria-label="Sign in">Sign in</button><button class="btn ghost" onclick="doSignUp()" aria-label="Create account">Create account</button></div>'+
  '<div style="margin-top:12px;color:var(--faint);font-size:12px">Email + password only. We never ask for card details here.</div></div></div>';
}
async function doSignIn(){
  const e=document.getElementById("ac_email").value.trim(),p=document.getElementById("ac_pass").value;
  document.getElementById("ac_err").textContent="";
  try{await signIn(e,p);go("dash");load()}catch(err){document.getElementById("ac_err").textContent=err.message||"Sign in failed"}
}
async function doSignUp(){
  const e=document.getElementById("ac_email").value.trim(),p=document.getElementById("ac_pass").value;
  const errEl=document.getElementById("ac_err");errEl.textContent="";
  if(p.length<6){errEl.textContent="Password must be at least 6 characters.";return}
  try{
    await signUp(e,p);
    if(!session()){errEl.textContent="Account created. Check your email to confirm, then sign in.";return}
    go("dash");load();
  }catch(err){errEl.textContent=err.message||"Sign up failed"}
}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
ensureToken().then(()=>load());
