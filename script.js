// Case Study Simulator (compact)
const $=(s,el=document)=>el.querySelector(s), $$=(s,el=document)=>Array.from(el.querySelectorAll(s));
async function loadModule(name,url){try{return await import(name)}catch{return await import(url)}}

// Supabase
const supabaseUrl="https://nnqutlsuisayoqvfyefh.supabase.co", supabaseKey="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ucXV0bHN1aXNheW9xdmZ5ZWZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwOTM0MzksImV4cCI6MjA3OTY2OTQzOX0.y5M_9F2wKDZ9D0BSlmrObE-JRwkrWVUMMYwKZuz1-fo"; let supabase;
(async()=>{const {createClient}=await loadModule('@supabase/supabase-js','https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'); supabase=createClient(supabaseUrl,supabaseKey,{auth:{detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}})})()
const waitSupabaseReady=()=>new Promise(r=>{const t=setInterval(()=>{if(supabase){clearInterval(t);r()}},50)});

// LLM config
const STORAGE_KEY="bootstrapLLMProvider_openaiConfig", DEFAULT_BASE_URL="https://llmfoundry.straive.com/openai/v1", DEFAULT_MODEL="gpt-5-nano";
const setLocal=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}}, getLocal=(k,def=null)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):def}catch{return def}};
async function loadOrInitOpenAIConfig(){const init={baseUrl:DEFAULT_BASE_URL,apiKey:"",models:[DEFAULT_MODEL]}; const cfg=getLocal(STORAGE_KEY); if(cfg?.baseUrl) return cfg; setLocal(STORAGE_KEY,init); return init}
const llmConfigured=()=>{const c=getLocal(STORAGE_KEY); return !!((c?.baseUrl||'').trim()&&(c?.apiKey||'').trim())};

document.addEventListener('click',e=>{const send=e.target.closest('#send-btn'); if(send&&!llmConfigured()){e.preventDefault(); if(typeof e.stopImmediatePropagation==='function') e.stopImmediatePropagation(); e.stopPropagation(); showAlert({title:'Configure LLM first',body:'Set Base URL and API key via Configure LLM.',color:'warning'})}},true);

function enforceLLMGating(){const configured=llmConfigured(); $$('.start-demo').forEach(b=>{const id=b.closest('.demo-card')?.dataset?.demoId; b.disabled=(id!=='__fresh__')&&!session?.user?.id}); const hasActive=!!gameSessionId||freshChatActive||($('#chat').children.length>0); const canChat=configured&&hasActive; $('#user-input').disabled=!canChat; $('#send-btn').disabled=!canChat}
window.addEventListener('load',enforceLLMGating);

// Alerts
async function showAlert({title="",body="",color="info",replace=false}){try{const {bootstrapAlert}=await loadModule('bootstrap-alert','https://cdn.jsdelivr.net/npm/bootstrap-alert@1/+esm'); bootstrapAlert({title,body,color,replace})}catch{const id='alert-holder'; let h=document.getElementById(id); if(!h){h=document.createElement('div'); h.id=id; Object.assign(h.style,{position:'fixed',top:'1rem',right:'1rem',zIndex:'1080'}); document.body.appendChild(h)} if(replace) h.innerHTML=''; const d=document.createElement('div'); d.className=`alert alert-${color} shadow`; d.role='alert'; d.style.minWidth='260px'; d.innerHTML=`${title?`<div class="fw-semibold mb-1">${title}</div>`:''}${body||''}`; h.appendChild(d); setTimeout(()=>d.remove(),4000)}}

// Theme toggle
$$('[data-bs-theme-value]').forEach(btn=>btn.addEventListener('click',()=>{const v=btn.getAttribute('data-bs-theme-value'); const theme=v==='auto'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):v; document.documentElement.setAttribute('data-bs-theme',theme)}));

// State
let session=null, gameSessionId=null, messages=[], freshChatActive=false, selectedSession=null, selectedMessages=[];

// Markdown
async function renderMarkdown(text){const src=String(text||''); try{const mod=await loadModule('marked','https://cdn.jsdelivr.net/npm/marked@12/+esm'); mod.marked.setOptions({breaks:true}); return mod.marked.parse(src)}catch{return src.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>')}}

// Game start
async function startNewGame(demo){freshChatActive=false; if(!session?.user?.id){await showAlert({title:'Please sign in',color:'warning'}); return} await waitSupabaseReady(); let data,error; ({data,error}=await supabase.from('game_sessions').insert([{user_id:session.user.id}]).select()); if(error){({data,error}=await supabase.from('game_sessions').insert([{user_id:session.user.id}]).select()); if(error){await showAlert({title:'Failed to start',body:String(error?.message||error),color:'danger'}); return}} gameSessionId=data?.[0]?.id; messages=[]; $('#chat').innerHTML=''; appendMsg('ai','Starting: '+(demo?.title||'Case')); const firstUser=demo?.prompt||'Start the scenario.'; const intro=await fetchAIResponse([{role:'user',content:firstUser}]); messages.push({role:'ai',content:intro}); appendMsg('ai',intro); $('#user-input').disabled=false; $('#send-btn').disabled=false}
function startFreshChat(){gameSessionId=null; freshChatActive=true; messages=[]; $('#chat').innerHTML=''; $('#user-input').disabled=false; $('#send-btn').disabled=false}

// Configure LLM
$('#configure-llm')?.addEventListener('click',async()=>{if(!session?.user?.id){await signIn(); if(!session?.user?.id) return} let openaiConfig; try{({openaiConfig}=await loadModule('bootstrap-llm-provider','https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1/+esm'))}catch{await showAlert({title:'Configure LLM failed',body:'Provider UI did not load. Check network.',color:'danger'}); return} try{await openaiConfig({show:true})}catch{} try{const ocfg=await loadOrInitOpenAIConfig(); const baseUrl=(ocfg?.baseUrl||DEFAULT_BASE_URL).replace(/\/$/,''); const apiKey=ocfg?.apiKey||''; const model=($('#model')?.value||'').trim()||(ocfg?.models?.[0])||DEFAULT_MODEL; if(baseUrl&&apiKey){let ok=false; try{ok=(await fetch(baseUrl+'/models',{headers:{Authorization:`Bearer ${apiKey}`}})).ok}catch{} if(!ok){try{ok=(await fetch(baseUrl+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},body:JSON.stringify({model,messages:[{role:'user',content:'ping'}],max_tokens:1})})).ok}catch{}} await showAlert({title:ok?'LLM connected':'LLM connection failed',body:ok?'Endpoint and key look good.':'Please verify Base URL, API key, and model.',color:ok?'success':'danger',replace:true})}}catch(e){await showAlert({title:'LLM test failed',body:String(e?.message||e),color:'danger',replace:true})}});

// Config
async function loadConfig(){try{const res=await fetch('config.json'); if(!res.ok) throw new Error('config.json not found'); return await res.json()}catch(e){console.warn('loadConfig failed:', e?.message||e); return {}}}

// Demo cards
async function renderDemoCards(cfg){let row=$("#demo-cards .row"), wrap=$("#demo-cards"); if(!row&&wrap){row=document.createElement('div'); row.className='row g-3 justify-content-center mb-4'; wrap.appendChild(row)} if(!row) return; row.innerHTML=''; (cfg.demos||[]).forEach(d=>{const col=document.createElement('div'); col.className='col-md-4 col-lg-3'; col.innerHTML=`\n    <div class="card demo-card h-100" data-demo-id="${d.id}">\n      <div class="card-body d-flex flex-column">\n        <div class="mb-3"><i class="fs-1 text-primary bi ${d.icon}"></i></div>\n        <h6 class="card-title h5 mb-2">${d.title}</h6>\n        <p class="card-text">${d.desc}</p>\n        <div class="mt-auto"><button class="btn btn-primary w-100 start-demo" disabled>Start</button></div>\n      </div>\n    </div>`; row.appendChild(col)}); const fresh=document.createElement('div'); fresh.className='col-md-4 col-lg-3'; fresh.innerHTML=`\n    <div class="card demo-card h-100" data-demo-id="__fresh__">\n      <div class="card-body d-flex flex-column">\n        <div class="mb-3"><i class="fs-1 text-success bi bi-lightning-charge-fill"></i></div>\n        <h6 class="card-title h5 mb-2">Start Fresh</h6>\n        <p class="card-text">Begin a free-form chat with the advisor.</p>\n        <div class="mt-auto"><button class="btn btn-success w-100 start-demo">Start</button></div>\n      </div>\n    </div>`; row.appendChild(fresh); row.addEventListener('click',e=>{const btn=e.target.closest('.start-demo'); if(!btn) return; const id=e.target.closest('.demo-card')?.dataset?.demoId; if(id==='__fresh__'){startFreshChat(); return} const demo=(cfg.demos||[]).find(x=>x.id===id); if(demo) startNewGame(demo)})}


// Chat rendering
function appendMsg(role, text) {
    const chat = $('#chat'),
        wrap = document.createElement('div');
    wrap.className = 'chat-msg-wrap ' + (role === 'user' ? 'msg-user text-end' : 'msg-ai');
    
    const header = role === 'ai' ? 
        '<i class="bi bi-cpu-fill"></i> <span class="fw-semibold">Advisor</span>' : 
        '<span class="fw-semibold">You</span> <i class="bi bi-person-circle"></i>';
    
    wrap.innerHTML = `<div class="small mb-1">${header}</div><div class="bubble p-2 rounded-3 d-inline-block text-start"><div class="markdown-body"></div></div>`;
    
    const md = wrap.querySelector('.markdown-body');
    md.innerHTML = (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    
    // FIX: Only trigger markdown rendering if 'text' actually exists.
    // This prevents overwriting the spinner when we pass empty text for the loading state.
    if (role === 'ai' && text) {
        try { renderMarkdown(text).then(html => md.innerHTML = html) } catch {}
    }
    
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
    return md;
}

let streamMsgEl = null;

const ensureStreamEl = () => {
    if (streamMsgEl) return streamMsgEl;
    
    // Create an empty AI bubble
    const el = appendMsg('ai', '');
    
    // Inject the "Typing Dots" animation
    el.innerHTML = `
    <div class="d-flex align-items-center gap-1 py-1 px-1" style="min-height: 24px">
        <div class="spinner-grow bg-secondary" style="width: 0.5rem; height: 0.5rem;" role="status"></div>
        <div class="spinner-grow bg-secondary" style="width: 0.5rem; height: 0.5rem; animation-delay: 0.15s;" role="status"></div>
        <div class="spinner-grow bg-secondary" style="width: 0.5rem; height: 0.5rem; animation-delay: 0.3s;" role="status"></div>
    </div>`;
    
    streamMsgEl = el;
    return el;
};

const clearStreamEl = () => { streamMsgEl = null };

const setLoading = v => {
    $('#user-input').disabled = v;
    $('#send-btn').disabled = v;
};

// LLM calls
async function* streamAIResponse(history){try{const cfg=await loadConfig(), systemPrompt=$('#system-prompt')?.value?.trim()||cfg.systemPrompt, formModel=($('#model')?.value||'').trim(), ocfg=await loadOrInitOpenAIConfig(), baseUrl=(ocfg?.baseUrl||DEFAULT_BASE_URL).replace(/\/$/,''), apiKey=ocfg?.apiKey||'', model=formModel||(ocfg?.models?.[0])||cfg.model||DEFAULT_MODEL; const {asyncLLM}=await loadModule('asyncllm','https://cdn.jsdelivr.net/npm/asyncllm@2/+esm'); const body={model,stream:true,messages:[{role:'system',content:systemPrompt},...history]}, url=`${baseUrl}/chat/completions`, headers={'Content-Type':'application/json',Accept:'text/event-stream',Authorization:`Bearer ${apiKey}`}, opts={onResponse:async res=>{const ct=res.headers?.get?.('content-type')||''; if(!ct.includes('text/event-stream')) console.warn('Streaming disabled by server; content-type:',ct)}}; for await(const {content,error} of asyncLLM(url,{method:'POST',headers,body:JSON.stringify(body)},opts)){if(error) throw new Error(error); if(content) yield content}}catch(e){console.warn('streamAIResponse failed:',e?.message||e)}}
async function fetchAIResponse(history){const cfg=await loadConfig(), systemPrompt=$('#system-prompt')?.value?.trim()||cfg.systemPrompt, formModel=($('#model')?.value||'').trim(), ocfg=await loadOrInitOpenAIConfig(), baseUrl=(ocfg?.baseUrl||DEFAULT_BASE_URL).replace(/\/$/,''), apiKey=ocfg?.apiKey||'', model=formModel||(ocfg?.models?.[0])||cfg.model||DEFAULT_MODEL; let full=''; try{const {asyncLLM}=await loadModule('asyncllm','https://cdn.jsdelivr.net/npm/asyncllm@2/+esm'); const body={model,stream:true,messages:[{role:'system',content:systemPrompt},...history]}; for await(const {content,error} of asyncLLM(`${baseUrl}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},body:JSON.stringify(body)})){if(error){console.warn('stream error',error); break} if(content){full=content}}}catch(e){console.warn('LLM stream failed; falling back:',e?.message||e); try{const body={model,messages:[{role:'system',content:systemPrompt},...history]}; const res=await fetch(`${baseUrl}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},body:JSON.stringify(body)}); const data=await res.json(); full=data?.choices?.[0]?.message?.content||''}catch(ee){await showAlert({title:'LLM request failed',body:String(ee?.message||ee),color:'danger'})}} return full||''}

// Auth state
async function refreshAuthState(){if(!supabase) return; const {data:{session:s}}=await supabase.auth.getSession(); session=s; const signedIn=!!session; $('#auth-btn').classList.toggle('d-none',signedIn); $('#profile-btn').classList.toggle('d-none',!signedIn); $('#signout-btn').classList.toggle('d-none',!signedIn); $$('.start-demo').forEach(b=>{const id=b.closest('.demo-card')?.dataset?.demoId; b.disabled=!signedIn&&id!=='__fresh__'}); const hasActive=!!gameSessionId||freshChatActive||($('#chat').children.length>0); const canChat=llmConfigured()&&hasActive; $('#user-input').disabled=!canChat; $('#send-btn').disabled=!canChat}

// Auth actions
async function signIn(){await showAlert({title:'Signing in',body:'Opening Google OAuth...',color:'info',replace:true}); await waitSupabaseReady(); let ensure; try{const mod=await loadModule('supabase-oauth-popup','https://cdn.jsdelivr.net/npm/supabase-oauth-popup@1/dist/index.js'); ensure=mod.default}catch{} if(!ensure){try{await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.href}}); return}catch(e){await showAlert({title:'Sign-in unavailable',body:'OAuth script not loaded and redirect failed. Check network.',color:'danger'}); return}} try{const s=await ensure(supabase,{provider:'google'}); session=s; await refreshAuthState(); await showAlert({title:'Signed in',color:'success',body:s?.user?.email||'Login ok',replace:true})}catch(err){await showAlert({title:'Login failed',body:String(err),color:'danger'})}}
async function signOut(){try{await waitSupabaseReady(); await supabase.auth.signOut(); await showAlert({title:'Signed out',body:'You have been signed out.',color:'info',replace:true})}catch(err){await showAlert({title:'Sign-out failed',body:String(err),color:'danger'})}finally{await refreshAuthState()}}

// Send chat
async function handleSend(){const input=$('#user-input').value.trim(); if(!input) return; $('#user-input').value=''; messages=messages.filter(m=>m.role!=='ai-temp').concat([{role:'user',content:input}]); appendMsg('user',input); setLoading(true); try{if(session?.user?.id&&gameSessionId){await supabase.from('chat_messages').insert([{session_id:gameSessionId,role:'user',content:input}])} let full=''; const bubble=ensureStreamEl(); try{const stream=streamAIResponse(messages.map(m=>({role:m.role==='ai'?'assistant':'user',content:m.content}))); for await(const partial of stream){full=partial; bubble.innerHTML=await renderMarkdown(partial); $('#chat').scrollTop=$('#chat').scrollHeight}}catch{} if(!full){full=await fetchAIResponse(messages.map(m=>({role:m.role==='ai'?'assistant':'user',content:m.content}))); bubble.innerHTML=await renderMarkdown(full)} clearStreamEl(); messages=messages.filter(m=>m.role!=='ai-temp').concat([{role:'ai',content:full}]); if(session?.user?.id&&gameSessionId){await supabase.from('chat_messages').insert([{session_id:gameSessionId,role:'ai',content:full}])}}catch(e){await showAlert({title:'Error',body:String(e),color:'danger'})}finally{setLoading(false)}}

// Profile modal
function openProfile(){const el=$('#profile-modal'), m=bootstrap.Modal.getOrCreateInstance(el); $('#session-list').innerHTML=''; $('#session-messages').innerHTML=''; $('#continue-session').disabled=true; $('#delete-session').disabled=true; m.show(); if(!session?.user?.id) return; fetchAndRenderSessions()}
async function fetchAndRenderSessions(){const list=$('#session-list'); if(!list||!session?.user?.id) return; list.innerHTML=''; try{await waitSupabaseReady(); const {data,error}=await supabase.from('game_sessions').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false}); if(error){await showAlert({title:'Load sessions failed',body:String(error?.message||error),color:'danger'}); return} (data||[]).forEach(s=>{const btn=document.createElement('button'); btn.className='list-group-item list-group-item-action'; const label=`Session ${String(s.id).slice(0,8)}${s.status?' - '+s.status:''}`; btn.textContent=label; btn.addEventListener('click',()=>viewSession(s)); list.appendChild(btn)})}catch(e){await showAlert({title:'Load sessions failed',body:String(e?.message||e),color:'danger'})}}
async function viewSession(sess){selectedSession=sess; $('#continue-session').disabled=false; $('#delete-session').disabled=false; const {data}=await supabase.from('chat_messages').select('role, content, created_at').eq('session_id',sess.id).order('created_at',{ascending:true}); selectedMessages=data||[]; const pane=$('#session-messages'); pane.innerHTML=''; selectedMessages.forEach(m=>{const div=document.createElement('div'); div.className='chat-msg-wrap '+(m.role==='user'?'msg-user text-end':'msg-ai'); const header=m.role==='ai'?'<i class="bi bi-cpu-fill"></i> <span class="fw-semibold">Advisor</span>':'<span class="fw-semibold">You</span> <i class="bi bi-person-circle"></i>'; div.innerHTML=`<div class="small mb-1">${header}</div><div class="bubble p-2 rounded-3 d-inline-block text-start"></div><div class="text-muted" style="font-size:.75rem">${m.created_at?new Date(m.created_at).toLocaleString():''}</div>`; div.querySelector('.bubble').textContent=m.content; pane.appendChild(div)})}
async function continueFromSelected(){if(!selectedSession) return; freshChatActive=false; gameSessionId=selectedSession.id; messages=selectedMessages.map(m=>({role:m.role,content:m.content})); $('#chat').innerHTML=''; messages.forEach(m=>appendMsg(m.role,m.content)); bootstrap.Modal.getInstance($('#profile-modal')).hide()}
async function deleteSelectedSession(){if(!selectedSession) return; if(!confirm('Delete this session? This will remove its transcript.')) return; try{await waitSupabaseReady(); const {error:e1}=await supabase.from('chat_messages').delete().eq('session_id',selectedSession.id); if(e1){await showAlert({title:'Delete failed',body:String(e1?.message||e1),color:'danger'}); return} const {error:e2}=await supabase.from('game_sessions').delete().eq('id',selectedSession.id).eq('user_id',session.user.id); if(e2){await showAlert({title:'Delete failed',body:String(e2?.message||e2),color:'danger'}); return} await showAlert({title:'Session deleted',color:'success',replace:true}); selectedSession=null; selectedMessages=[]; $('#continue-session').disabled=true; $('#delete-session').disabled=true; $('#session-messages').innerHTML=''; await fetchAndRenderSessions()}catch(err){await showAlert({title:'Delete failed',body:String(err?.message||err),color:'danger'})}}

// Settings
let form; (async()=>{try{const mod=await loadModule('saveform','https://cdn.jsdelivr.net/npm/saveform@1.4.0/+esm'); form=mod.default('#settings-form')}catch{}})();
$('#settings-reset').addEventListener('click',async()=>{try{form?.clear()}catch{} try{const cfg=await loadConfig(); const sp=$('#system-prompt'); if(sp) sp.value=cfg.systemPrompt||''; const mdl=$('#model'); if(mdl) mdl.value=cfg.model||''; try{form?.save()}catch{} await showAlert({title:'Defaults restored',color:'info',replace:true})}catch(e){await showAlert({title:'Reset failed',body:String(e?.message||e),color:'danger'})}});
$('#settings-apply').addEventListener('click',()=>{try{form?.save()}catch{}});

// Events
$('#send-btn')?.addEventListener('click',e=>{e.preventDefault(); handleSend()}); $('#chat-form')?.addEventListener('submit',e=>{e.preventDefault(); handleSend()}); $('#user-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault(); handleSend()}});
$('#auth-btn')?.addEventListener('click',signIn); $('#signout-btn')?.addEventListener('click',signOut); $('#profile-btn')?.addEventListener('click',openProfile); $('#continue-session')?.addEventListener('click',continueFromSelected); $('#delete-session')?.addEventListener('click',deleteSelectedSession);

// Init
(async()=>{const cfg=await loadConfig(); await renderDemoCards(cfg); await waitSupabaseReady(); await refreshAuthState(); enforceLLMGating(); if($('#system-prompt')&&!$('#system-prompt').value) $('#system-prompt').value=cfg.systemPrompt; if($('#model')&&!$('#model').value) $('#model').value=cfg.model; try{if(cfg.title){document.title=cfg.title; $('.navbar-brand').textContent=cfg.title; $('.display-1').textContent=cfg.title} if(cfg.subtitle){$('.display-6').textContent=cfg.subtitle}}catch{}})();