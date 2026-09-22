import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL || "", { max: 5, idle_timeout: 20 });

const SYSTEM = `You are Paras AI Agent, a fast autonomous coding agent similar in workflow to modern AI app builders.
Your job is to turn the user's app request into a real, coherent project. Work in small verified steps.
Use tools to inspect and modify the project. Prefer a runnable web app unless the user explicitly asks for Android/Flutter.
Always create a useful MVP, keep files internally consistent, and finish with a concise summary.
Never invent files you have not written. If something cannot be executed in the current environment, still create the correct source/config and explain the remaining deployment step.`;

const tools = [
  { type: "function", name: "list_files", description: "List all files currently in the project.", parameters: { type: "object", properties: {} } },
  { type: "function", name: "read_file", description: "Read a project file.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { type: "function", name: "write_file", description: "Create or replace a project file with complete UTF-8 text.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
  { type: "function", name: "delete_file", description: "Delete a project file.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } }
];

function safePath(p:string){
  const x = String(p || "").replace(/\\/g,"/").replace(/^\/+/,"");
  if(!x || x.includes("..") || x.startsWith(".git/") || x.startsWith(".env")) throw new Error("Unsafe file path");
  return x;
}

async function ensureTables(){
  await sql`CREATE TABLE IF NOT EXISTS project_files(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE, path TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(project_id,path))`;
  await sql`CREATE TABLE IF NOT EXISTS agent_runs(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE, user_prompt TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running', events JSONB NOT NULL DEFAULT '[]'::jsonb, summary TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`;
}

async function callAI(input:any, previous?:string){
  const key=process.env.OPENAI_API_KEY;
  if(!key) throw new Error("OPENAI_API_KEY is not configured on Railway");
  const payload:any={model:process.env.OPENAI_MODEL||"gpt-5.6-luna",instructions:SYSTEM,input,tools,tool_choice:"auto",max_output_tokens:12000};
  if(previous) payload.previous_response_id=previous;
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const d=await r.json();
  if(!r.ok) throw new Error(d?.error?.message||`AI request failed (${r.status})`);
  return d;
}

function outputText(resp:any){
  return (resp.output||[]).filter((x:any)=>x.type==="message").flatMap((x:any)=>x.content||[]).filter((x:any)=>x.type==="output_text").map((x:any)=>x.text).join("\n").trim();
}

async function toolResult(projectId:string,name:string,args:any){
  if(name==="list_files"){
    const rows=await sql`SELECT path FROM project_files WHERE project_id=${projectId} ORDER BY path`;
    return {files:rows.map((r:any)=>r.path)};
  }
  if(name==="read_file"){
    const path=safePath(args.path); const rows=await sql`SELECT content FROM project_files WHERE project_id=${projectId} AND path=${path}`;
    return rows.length?{path,content:rows[0].content}:{error:"File not found"};
  }
  if(name==="write_file"){
    const path=safePath(args.path); const content=String(args.content??"");
    await sql`INSERT INTO project_files(project_id,path,content,updated_at) VALUES(${projectId},${path},${content},NOW()) ON CONFLICT(project_id,path) DO UPDATE SET content=EXCLUDED.content,updated_at=NOW()`;
    return {ok:true,path,bytes:Buffer.byteLength(content,"utf8")};
  }
  if(name==="delete_file"){
    const path=safePath(args.path); await sql`DELETE FROM project_files WHERE project_id=${projectId} AND path=${path}`; return {ok:true,path};
  }
  return {error:"Unknown tool"};
}

export async function runAgent(projectId:string,prompt:string,onEvent?:(e:any)=>void){
  await ensureTables();
  const run=(await sql`INSERT INTO agent_runs(project_id,user_prompt,status) VALUES(${projectId},${prompt},'running') RETURNING *`)[0];
  const events:any[]=[]; const emit=(e:any)=>{events.push(e); onEvent?.(e)};
  try{
    let resp=await callAI(prompt);
    for(let round=0;round<12;round++){
      const calls=(resp.output||[]).filter((x:any)=>x.type==="function_call");
      if(!calls.length) break;
      const outputs:any[]=[];
      for(const call of calls){
        const args=JSON.parse(call.arguments||"{}");
        emit({type:"tool",tool:call.name,path:args.path||null});
        const result=await toolResult(projectId,call.name,args);
        outputs.push({type:"function_call_output",call_id:call.call_id,output:JSON.stringify(result)});
      }
      resp=await callAI(outputs,resp.id);
    }
    const summary=outputText(resp)||"Agent finished the requested work.";
    emit({type:"done",summary});
    await sql`UPDATE agent_runs SET status='completed',events=${JSON.stringify(events)},summary=${summary},updated_at=NOW() WHERE id=${run.id}`;
    return {runId:run.id,summary,events};
  }catch(e:any){
    const message=e?.message||"Agent failed"; emit({type:"error",message});
    await sql`UPDATE agent_runs SET status='failed',events=${JSON.stringify(events)},summary=${message},updated_at=NOW() WHERE id=${run.id}`;
    throw new Error(message);
  }
}

export async function listProjectFiles(projectId:string){ await ensureTables(); return await sql`SELECT path,content,updated_at FROM project_files WHERE project_id=${projectId} ORDER BY path`; }
export async function listRuns(projectId:string){ await ensureTables(); return await sql`SELECT id,status,user_prompt,summary,created_at,updated_at FROM agent_runs WHERE project_id=${projectId} ORDER BY created_at DESC LIMIT 20`; }
