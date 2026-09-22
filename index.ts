import { Hono } from "hono";
import postgres from "postgres";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";

const app = new Hono();
const sql = postgres(process.env.DATABASE_URL || "", { max: 5, idle_timeout: 20 });
const PORT = Number(process.env.PORT || 3000);

async function db(){
  const statements = [
    sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`,
    sql`CREATE TABLE IF NOT EXISTS users(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`,
    sql`CREATE TABLE IF NOT EXISTS projects(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, idea TEXT NOT NULL, spec JSONB, status TEXT DEFAULT 'draft', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`,
    sql`CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL)`,
    sql`CREATE TABLE IF NOT EXISTS builds(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE, status TEXT DEFAULT 'queued', platform TEXT DEFAULT 'android', logs TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
  ];
  for (const q of statements) await q;
}

function token(){ return crypto.randomUUID()+"-"+crypto.randomUUID(); }
function safeUser(u:any){ return {id:u.id,name:u.name,email:u.email}; }
async function currentUser(c:any){
  const t=getCookie(c,"paras_session");
  if(!t) return null;
  const rows=await sql`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=${t} AND s.expires_at>NOW()`;
  return rows[0] || null;
}
function specFromIdea(idea:string){
  const text=idea.trim();
  const title=(text.match(/(?:called|named)\s+["']?([^"']+)/i)?.[1]||"My App").slice(0,60);
  const lower=text.toLowerCase();
  const screens=["Home","Dashboard","Settings"];
  if(lower.includes("login")||lower.includes("account")) screens.unshift("Login");
  if(lower.includes("shop")||lower.includes("store")) screens.push("Products","Cart","Checkout");
  if(lower.includes("social")||lower.includes("community")) screens.push("Feed","Profile","Messages");
  if(lower.includes("delivery")) screens.push("Orders","Tracking");
  return {appName:title,description:text,screens:[...new Set(screens)],features:["Authentication","Responsive UI","Project data","Settings"],dataModels:["User","Project","Build"],navigation:"Bottom navigation with protected screens",androidPackage:"ai.paras.generated"};
}
const page=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paras AI</title><style>*{box-sizing:border-box}body{margin:0;background:#07080c;color:#f7f7fb;font-family:Inter,system-ui,sans-serif}button,input,textarea{font:inherit}.wrap{max-width:1180px;margin:auto;padding:24px}.top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #20232d;padding-bottom:18px}.logo{font-size:25px;font-weight:800}.muted{color:#969baa}.grid{display:grid;grid-template-columns:260px 1fr;gap:20px;margin-top:20px}.side,.card{background:#10121a;border:1px solid #242734;border-radius:16px}.side{padding:16px;height:max-content}.nav{padding:12px;border-radius:10px;margin:4px 0;color:#b8bdcb}.nav.active{background:#1b1e29;color:#fff}.hero{padding:28px;border-radius:18px;background:linear-gradient(135deg,#151827,#0c0e15);border:1px solid #282c3a}.hero h1{font-size:38px;margin:0 0 10px}.input{width:100%;background:#0a0c12;border:1px solid #2b2f3b;color:#fff;border-radius:12px;padding:14px;margin-top:10px;outline:none}.btn{border:0;border-radius:11px;padding:12px 18px;background:#fff;color:#090a0e;font-weight:700;cursor:pointer}.btn.secondary{background:#1d2130;color:#fff;border:1px solid #303544}.row{display:flex;gap:10px;align-items:center}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px}.card{padding:18px}.screen{padding:10px 12px;border:1px solid #292d39;border-radius:10px;margin:8px 0;background:#0c0e14}.hide{display:none}.auth{max-width:460px;margin:80px auto}.error{color:#ff7d8a;margin-top:10px}.ok{color:#72e0a0;margin-top:10px}@media(max-width:800px){.grid{grid-template-columns:1fr}.side{display:none}.cards{grid-template-columns:1fr}.hero h1{font-size:30px}}</style></head><body><div class="wrap"><div id="auth" class="auth card"><div class="logo">✦ Paras AI</div><p class="muted">Build apps from ideas with AI.</p><input id="name" class="input" placeholder="Name"><input id="email" class="input" placeholder="Email"><input id="pass" class="input" type="password" placeholder="Password"><div class="row" style="margin-top:12px"><button class="btn" onclick="signup()">Create account</button><button class="btn secondary" onclick="login()">Login</button></div><div id="msg"></div></div><div id="app" class="hide"><div class="top"><div class="logo">✦ Paras AI</div><div class="row"><span id="who" class="muted"></span><button class="btn secondary" onclick="logout()">Logout</button></div></div><div class="grid"><aside class="side"><div class="nav active">AI Builder</div><div class="nav">Projects</div><div class="nav">Templates</div><div class="nav">Builds</div><div class="nav">Settings</div></aside><main class="main"><section class="hero"><div class="muted">AI APP BUILDER</div><h1>Turn your idea into an app.</h1><p class="muted">Describe your Android app. Paras AI creates the project specification, screens, features and build job.</p><textarea id="idea" class="input" rows="5" placeholder="Example: Create a food delivery app with login, restaurants, cart, orders and live tracking."></textarea><div class="row" style="margin-top:12px"><button class="btn" onclick="generate()">Generate App</button><button class="btn secondary" onclick="newProject()">New Project</button></div><div id="result"></div></section><div class="cards"><div class="card"><b>Projects</b><h2 id="pc">0</h2><span class="muted">Saved in Postgres</span></div><div class="card"><b>Generated screens</b><h2 id="sc">0</h2><span class="muted">From your idea</span></div><div class="card"><b>Builds</b><h2 id="bc">0</h2><span class="muted">Android jobs</span></div></div></main></div></div></div><script>
async function api(url,opt={}){const r=await fetch(url,{headers:{"Content-Type":"application/json",...(opt.headers||{})},...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Request failed");return d}
let current=null;
async function boot(){try{const d=await api("/api/auth/me");current=d.user;showApp();load()}catch{}}
function showApp(){document.getElementById("auth").classList.add("hide");document.getElementById("app").classList.remove("hide");document.getElementById("who").textContent=current?.name||""}
async function signup(){try{const d=await api("/api/auth/signup",{method:"POST",body:JSON.stringify({name:name.value,email:email.value,password:pass.value})});current=d.user;showApp();load()}catch(e){msg.innerHTML='<div class="error">'+e.message+"</div>"}}
async function login(){try{const d=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:email.value,password:pass.value})});current=d.user;showApp();load()}catch(e){msg.innerHTML='<div class="error">'+e.message+"</div>"}}
async function logout(){await api("/api/auth/logout",{method:"POST"});location.reload()}
async function load(){const d=await api("/api/projects");pc.textContent=d.projects.length;bc.textContent=d.projects.reduce((a,p)=>a+Number(p.builds||0),0);sc.textContent=d.projects.reduce((a,p)=>a+((p.spec?.screens||[]).length),0)}
async function generate(){try{const v=document.getElementById("idea").value;if(!v.trim())throw Error("App idea likho");const d=await api("/api/projects",{method:"POST",body:JSON.stringify({idea:v})});document.getElementById("result").innerHTML='<div class="card" style="margin-top:16px"><h3>'+d.project.name+'</h3><p class="muted">'+d.project.spec.description+'</p><b>Screens</b>'+d.project.spec.screens.map(s=>'<div class="screen">'+s+"</div>").join("")+'<p><b>Features:</b> '+d.project.spec.features.join(", ")+'</p><button class="btn" onclick="build(\''+d.project.id+"\')">Create Android Build</button><div id="buildmsg"></div></div>';load()}catch(e){document.getElementById("result").innerHTML='<div class="error">'+e.message+"</div>"}}
async function build(id){try{const d=await api("/api/projects/"+id+"/builds",{method:"POST"});document.getElementById("buildmsg").innerHTML='<div class="ok">Build #'+d.build.id+" queued. Status: "+d.build.status+"</div>";load()}catch(e){document.getElementById("buildmsg").innerHTML='<div class="error">'+e.message+"</div>"}}
function newProject(){document.getElementById("idea").value=""}boot();
</script></body></html>`;

app.get("/",c=>c.html(page));
app.get("/health",async c=>{try{await db();await sql`SELECT 1`;return c.json({status:"ok",database:"connected",service:"paras-ai"})}catch(e){return c.json({status:"error",database:"disconnected"},500)}});
app.post("/api/auth/signup",async c=>{await db();const {name,email,password}=await c.req.json();if(!name||!email||!password||password.length<6)return c.json({error:"Name, email and 6+ character password required"},400);const existing=await sql`SELECT id FROM users WHERE lower(email)=lower(${email})`;if(existing.length)return c.json({error:"Email already registered"},409);const hash=await Bun.password.hash(password,{algorithm:"bcrypt",cost:10});const u=(await sql`INSERT INTO users(name,email,password_hash) VALUES(${name.trim()},lower(${email.trim()}),${hash}) RETURNING id,name,email`)[0];const t=token();await sql`INSERT INTO sessions(token,user_id,expires_at) VALUES(${t},${u.id},NOW()+INTERVAL '30 days')`;setCookie(c,"paras_session",t,{httpOnly:true,secure:true,sameSite:"Lax",path:"/",maxAge:2592000});return c.json({user:safeUser(u)})});
app.post("/api/auth/login",async c=>{await db();const {email,password}=await c.req.json();const rows=await sql`SELECT * FROM users WHERE lower(email)=lower(${email||""})`;if(!rows.length||!(await Bun.password.verify(password||"",rows[0].password_hash)))return c.json({error:"Invalid email or password"},401);const u=rows[0],t=token();await sql`INSERT INTO sessions(token,user_id,expires_at) VALUES(${t},${u.id},NOW()+INTERVAL '30 days')`;setCookie(c,"paras_session",t,{httpOnly:true,secure:true,sameSite:"Lax",path:"/",maxAge:2592000});return c.json({user:safeUser(u)})});
app.post("/api/auth/logout",async c=>{const t=getCookie(c,"paras_session");if(t)await sql`DELETE FROM sessions WHERE token=${t}`;deleteCookie(c,"paras_session",{path:"/"});return c.json({ok:true})});
app.get("/api/auth/me",async c=>{const u=await currentUser(c);if(!u)return c.json({error:"Not logged in"},401);return c.json({user:safeUser(u)})});
app.get("/api/projects",async c=>{const u=await currentUser(c);if(!u)return c.json({error:"Not logged in"},401);const rows=await sql`SELECT p.*, (SELECT count(*) FROM builds b WHERE b.project_id=p.id) AS builds FROM projects p WHERE p.user_id=${u.id} ORDER BY p.updated_at DESC`;return c.json({projects:rows})});
app.post("/api/projects",async c=>{const u=await currentUser(c);if(!u)return c.json({error:"Not logged in"},401);const {idea}=await c.req.json();if(!idea?.trim())return c.json({error:"Idea required"},400);const spec=specFromIdea(idea);const p=(await sql`INSERT INTO projects(user_id,name,idea,spec,status) VALUES(${u.id},${spec.appName},${idea.trim()},${JSON.stringify(spec)},'generated') RETURNING *`)[0];return c.json({project:p})});
app.post("/api/projects/:id/builds",async c=>{const u=await currentUser(c);if(!u)return c.json({error:"Not logged in"},401);const id=c.req.param("id");const p=await sql`SELECT id FROM projects WHERE id=${id} AND user_id=${u.id}`;if(!p.length)return c.json({error:"Project not found"},404);const b=(await sql`INSERT INTO builds(project_id,status,platform,logs) VALUES(${id},"queued","android","Build queued by Paras AI") RETURNING *`)[0];return c.json({build:b})});

db().catch(e=>{console.error(e);process.exit(1)});
Bun.serve({port:PORT,fetch:app.fetch});
