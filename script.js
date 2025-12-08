// --- 1. Utilities ---
const $ = (s, parent = document) => parent.querySelector(s);
const $$ = (s, parent = document) => Array.from(parent.querySelectorAll(s));

// Robust JSON parser with "Stutter Fix"
function parseRelaxedJSON(str) {
  // 1. Remove Markdown code blocks
  let text = str.replace(/```json/g, '').replace(/```/g, '').trim();

  // 2. Identify if we are looking for an Object or an Array
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  
  let startChar = '{';
  let endChar = '}';
  let startIndex = firstBrace;

  // Use Array mode if '[' appears before '{' or if '{' is not found
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    startIndex = firstBracket;
    startChar = '[';
    endChar = ']';
  }

  const endIndex = text.lastIndexOf(endChar);

  // 3. Scan for valid JSON
  while (startIndex !== -1 && startIndex < endIndex) {
    try {
      const potentialJSON = text.substring(startIndex, endIndex + 1);
      return JSON.parse(potentialJSON);
    } catch (e) {
      // If parsing failed, try the next start char
      startIndex = text.indexOf(startChar, startIndex + 1);
    }
  }

  // 4. Fallback: Relaxed Evaluation
  try {
    const looseStart = text.indexOf(startChar);
    const looseEnd = text.lastIndexOf(endChar);
    if (looseStart !== -1 && looseEnd > looseStart) {
        const looseText = text.substring(looseStart, looseEnd + 1);
        return (new Function(`return ${looseText}`))();
    }
  } catch (e) { /* ignore */ }

  throw new Error(`Could not recover JSON from: ${text.substring(0, 30)}...`);
}

async function showAlert(t,m){try{const x=await import("https://cdn.jsdelivr.net/npm/bootstrap-alert@1/+esm");const a=(m||"").split("<br>");x.bootstrapAlert({body:a.length>1?a.slice(1).join("<br>"):m,title:a.length>1?a[0]:undefined,color:t,position:"top-0 end-0",replace:true,autohide:true,delay:5000});if(!window.__toastStyle){const st=document.createElement('style');st.textContent='.toast{border-radius:.5rem!important;overflow:hidden;box-shadow:0 .25rem .75rem rgba(0,0,0,.15)}.toast-header{border-radius:.5rem .5rem 0 0!important}.toast-body{border-radius:0 0 .5rem .5rem!important}';document.head.appendChild(st);window.__toastStyle=st;}}catch{const el=document.createElement("div");el.className="alert alert-"+(t||"info")+" alert-dismissible fade show rounded-3 shadow";el.innerHTML=m+"<button type=\"button\" class=\"btn-close\" data-bs-dismiss=\"alert\" aria-label=\"Close\"></button>";(document.querySelector("#alerts")||document.body).appendChild(el);setTimeout(()=>el.remove(),5000);}}// Dynamic Import Loader
// Dynamic Import Loader
const load = async (lib) => import({
  // Use esm.sh which bundles dependencies correctly for browser usage
  sb: 'https://esm.sh/@supabase/supabase-js@2', 
  llm: 'https://cdn.jsdelivr.net/npm/asyncllm@2/+esm',
  md: 'https://cdn.jsdelivr.net/npm/marked@12/+esm',
  ui: 'https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1/+esm',
  auth: 'https://cdn.jsdelivr.net/npm/supabase-oauth-popup@1/dist/index.js'
}[lib]);

// --- 2. State & Constants ---
const CFG_KEY = "bootstrapLLMProvider_openaiConfig";
const SB_CONFIG = {
  url: "https://nnqutlsuisayoqvfyefh.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ucXV0bHN1aXNheW9xdmZ5ZWZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwOTM0MzksImV4cCI6MjA3OTY2OTQzOX0.y5M_9F2wKDZ9D0BSlmrObE-JRwkrWVUMMYwKZuz1-fo"
};

// Default Config for fallback (when file:// fetch fails)
const DEFAULT_CONFIG = {
  "demos": [
    {
      "id": "retail",
      "title": "Omnichannel Retail",
      "desc": "Footfall -14%; leases roll; 22% aging stock",
      "icon": "bi-bag",
      "prompt": "You are COO at a 180-store apparel chain. Store footfall -14% YoY; e-comm AOV -7%; inventory aging >90d at 22%; shrink 2.1%. Three anchor leases up in 60d (+9% rent ask). Two key vendors shorten terms; bank revolver utilization 78%. Propose markdowns, lease renegotiation, supplier credit steps, and labor scheduling."
    },
    {
      "id": "ev",
      "title": "EV OEM Crisis",
      "desc": "BMS defect 1.4% rate; cobalt +23%; subsidy taper",
      "icon": "bi-ev-front",
      "prompt": "You are VP Ops at an EV OEM. Early field failures show a batch-level BMS defect (1.4% incident rate). Cobalt +23%; two EU subsidies taper next quarter. Charging network NPS falls 55->34. Outline recall vs field-fix, supplier re-pricing, and customer comp."
    },
    {
      "id": "fintech",
      "title": "Fintech Fraud Spike",
      "desc": "Card-not-present fraud +60 bps; partner bank audit",
      "icon": "bi-credit-card",
      "prompt": "You are Head of Risk at a payments fintech. CNP fraud rises +60 bps; chargebacks up 35% MoM; dispute backlog 18 days. Partner bank flags KYC gaps. Propose controls (rules, models, 3DS2), merchant comms, staffing, and bank engagement."
    }
  ],
  "systemPrompt": "You are 'The Executive', a business strategy simulation engine.",
  "model": "gpt-4o-mini"
};

const state = {
  user: null,
  session: null,
  msgs: [],
  config: DEFAULT_CONFIG,
  isFresh: false,
  selectedSession: null,
  signedInToastShown: false
};

let sbClient; // Supabase Client Instance

// --- 3. Core Initialization ---
async function init() {
  // A. Load Config (durable fallback)
  try {
    const res = await fetch('config.json');
    if (res.ok) {
       state.config = await res.json();
    }
  } catch (e) {
    console.warn("Config load failed (likely file:// protocol), using defaults.", e);
    // state.config is already initialized with DEFAULT_CONFIG
  }
  renderDemos();

  // B. Mode Toggle Listeners (Attach early)
  $$('input[name="gamemode"]').forEach(btn => {
    btn.addEventListener('change', (e) => {
      const mode = e.target.id === 'mode-board' ? 'board' : 'sim';
      toggleMode(mode);
    });
  });

  // C. Initialize Supabase (Safe Mode)
  try {
    const { createClient } = await load('sb');
    sbClient = createClient(SB_CONFIG.url, SB_CONFIG.key, {
      auth: { 
        detectSessionInUrl: true,
        persistSession: true, 
        autoRefreshToken: true 
      }
    });

    // Handle Auth State
    const { data } = await sbClient.auth.getSession();
    updateAuth(data?.session);
    sbClient.auth.onAuthStateChange((evt, s) => {
      const hadUser = !!state.user; // before update
      updateAuth(s);
      if (evt === 'SIGNED_IN' && !hadUser && !state.signedInToastShown) {
        state.signedInToastShown = true;
        showAlert('success', 'Signed in successfully<br><small>'+(s?.user?.email||'')+'</small>');
      }
      if (evt === 'SIGNED_OUT') { state.signedInToastShown = false; showAlert('danger', 'Signed out successfully.'); }
    });
  } catch (err) {
    console.warn("Supabase initialization failed (offline or config error). Auth disabled.", err);
    // $('#auth-btn').classList.add('d-none'); // DO NOT HIDE. User needs to see it to try signing in.
  }

  // C. Restore UI State
  const savedLLM = getLLMConfig();
  if ($('#system-prompt')) {
    $('#system-prompt').value = state.config.systemPrompt || '';
  }
  if (savedLLM.baseUrl) checkGate();
}


let boardGameInstance = null;
async function toggleMode(mode) {
  const simView = $('#simulation-view');
  const boardView = $('#board-game-view');
  
  if (mode === 'board') {
    if (!state.user) {
        if (!sbClient) {
             showAlert('warning', '<b>Offline Mode</b><br>Authentication unavailable. Entering Board Mode as Guest (Progress will not be saved).');
        } else {
             showAlert('warning', 'Please sign in to access Board Game mode.');
             $('#mode-sim').checked = true;
             return;
        }
    }

    simView.classList.add('d-none');
    boardView.style.display = 'block';
    setTimeout(() => boardView.classList.add('active'), 10);
    
    if (!boardGameInstance) {
      // Pass a bound wrapper if necessary, or just the function if it captures scope correctly.
      // askLLM relies on module-level 'state' and helpers. passing it directly works.
      boardGameInstance = new BoardGame('#board-game-view', askLLM);
      await boardGameInstance.init();
    }
  } else {
    simView.classList.remove('d-none');
    boardView.classList.remove('active');
    boardView.style.display = 'none';
  }
}

// --- 4. Authentication Logic ---
function updateAuth(session) {
  state.user = session?.user || null;
  const isAuth = !!state.user;

  // Toggle Navbar Buttons
  $('#auth-btn').classList.toggle('d-none', isAuth);
  $('#profile-btn').classList.toggle('d-none', !isAuth);
  $('#signout-btn').classList.toggle('d-none', !isAuth);

  // Enable/Disable Demo Buttons
  $$('.start-demo').forEach(btn => {
    const isFresh = btn.closest('.card').dataset.id === '__fresh__';
    btn.disabled = !isAuth && !isFresh;
  });

  checkGate();
}

// --- 5. LLM Integration (Unified) ---
function getLLMConfig() {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY)) || {};
  } catch {
    return {};
  }
}

async function* askLLM(history) {
  const { asyncLLM } = await load('llm');
  const cfg = getLLMConfig();
  
  if (!cfg.baseUrl) throw new Error("Please configure LLM settings first.");

  const model = $('#model').value || cfg.models?.[0] || 'gpt-4o-mini';
  const systemPrompt = $('#system-prompt').value || state.config.systemPrompt;
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cfg.apiKey}`
  };
  
  const body = {
    model,
    stream: true,
    messages: [{ role: 'system', content: systemPrompt }, ...history]
  };

  try {
    // Attempt Streaming
    for await (const chunk of asyncLLM(url, { method: 'POST', headers, body: JSON.stringify(body) })) {
      if (chunk.error) throw new Error(chunk.error);
      if (chunk.content) yield chunk.content; // yield text chunk
    }
  } catch (e) {
    // Fallback to standard fetch if stream fails
    console.warn("Stream failed, falling back to fetch", e);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, stream: false })
    });
    const data = await res.json();
    yield data.choices?.[0]?.message?.content || "";
  }
}

// --- 6. UI & Chat Rendering ---
async function renderMD(text) {
  try {
    const { marked } = await load('md');
    return marked.parse(text || '');
  } catch {
    return (text || '').replace(/\n/g, '<br>');
  }
}

function appendMsg(role, text, isLoading = false) {
  const chatBox = $('#chat');
  const div = document.createElement('div');
  
  div.className = `chat-msg-wrap ${role === 'user' ? 'msg-user text-end' : 'msg-ai'}`;
  
  const header = role === 'ai' 
    ? '<i class="bi bi-cpu-fill"></i> Advisor' 
    : 'You <i class="bi bi-person-circle"></i>';
    
  const content = isLoading 
    ? '<div class="spinner-grow spinner-grow-sm"></div><div class="spinner-grow spinner-grow-sm mx-1"></div>' 
    : '<div class="markdown-body"></div>';

  div.innerHTML = `<small class="text-muted">${header}</small>
                   <div class="bubble p-2 rounded-3 d-inline-block text-start">${content}</div>`;
                    
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;

  // Render Markdown async if text is present
  if (!isLoading && text) {
    renderMD(text).then(html => div.querySelector('.markdown-body').innerHTML = html);
  }
  
  return div.querySelector('.bubble');
}

async function handleTurn(input) {
  if (!input) return;
  const cfg = getLLMConfig();
  if (!cfg.baseUrl) { showAlert('warning', 'Please configure LLM settings first.'); setLoading(false); return; }
  $('#user-input').value = '';

  // 1. User Turn
  state.msgs.push({ role: 'user', content: input });
  appendMsg('user', input);
  
if (state.session) {
  await sbClient.from('chat_messages').insert({ 
    session_id: state.session.id, role: 'user', content: input 
  });
}

  // 2. AI Turn (Streaming)
  setLoading(true);
  const bubble = appendMsg('ai', '', true);
  let fullResponse = '';

  try {
    for await (const chunk of askLLM(state.msgs)) {
      const text = String(chunk);
      // If stream sends cumulative content, replace; else append
      if (text.startsWith(fullResponse)) fullResponse = text; else fullResponse += text;
      bubble.innerHTML = `<div class="markdown-body">${await renderMD(fullResponse)}</div>`;
      $('#chat').scrollTop = $('#chat').scrollHeight;
    }
    
    // 3. Save AI Response
    state.msgs.push({ role: 'assistant', content: fullResponse });
  if (state.session) {
  await sbClient.from('chat_messages').insert({ 
    session_id: state.session.id, role: 'ai', content: fullResponse 
  });
}

  } catch (e) {
    bubble.innerHTML = `<span class="text-danger">Error: ${e.message}</span>`;
    showAlert('danger', `LLM error: ${e.message}`);
  }
  
  setLoading(false);
}

// --- 7. Game Logic ---
async function startGame(demoId) {
  if (!state.user && demoId !== '__fresh__') { 
    showAlert('warning', 'Please sign in to start a scenario.'); 
    return; 
  }

  state.msgs = [];
  state.session = null;
  state.isFresh = demoId === '__fresh__';
  $('#chat').innerHTML = '';

  if (demoId !== '__fresh__') {
    const demo = state.config.demos?.find(d => d.id === demoId);
    
    // Create Session in DB (if available)
    if (state.session || (sbClient && state.user)) {
      try {
        const { data, error } = await sbClient.from('game_sessions')
          .insert({ user_id: state.user.id }).select().single();
        if (!error) state.session = data;
      } catch(e) { console.warn("Session create failed", e); }
    }
    
    // Now start the conversation with the prompt
    await handleTurn(demo?.prompt || "Start the scenario.");
  } else {
    checkGate();
    $('#user-input').focus();
  }
}

function renderDemos() {
  const row = $('#demo-cards .row');
  if (!row) return;
  
  // Render Configured Demos
  const cards = (state.config.demos || []).map(d => `
    <div class="col-md-4 col-lg-3">
      <div class="card h-100" data-id="${d.id}">
        <div class="card-body d-flex flex-column text-center">
          <i class="fs-1 text-primary bi ${d.icon} mb-3"></i>
          <h5>${d.title}</h5>
          <p class="small text-muted">${d.desc}</p>
          <button class="btn btn-primary mt-auto w-100 start-demo" disabled>Start</button>
        </div>
      </div>
    </div>
  `).join('');

  // Render "Fresh Chat" Card
  const freshCard = `
    <div class="col-md-4 col-lg-3">
      <div class="card h-100" data-id="__fresh__">
        <div class="card-body d-flex flex-column text-center">
          <i class="fs-1 text-success bi bi-lightning-charge-fill mb-3"></i>
          <h5>Start Fresh</h5>
          <p class="small text-muted">Free-form chat with the advisor.</p>
          <button class="btn btn-success mt-auto w-100 start-demo">Start</button>
        </div>
      </div>
    </div>`;

  row.innerHTML =  freshCard+cards;
}

// --- 8. Event Handling & Helpers ---
const setLoading = (isDisabled) => {
  $('#user-input').disabled = isDisabled;
  $('#send-btn').disabled = isDisabled;
};

const checkGate = () => {
  const hasConfig = !!getLLMConfig().baseUrl;
  const isChatActive = state.msgs.length > 0 || !!state.session || $('#chat').children.length > 0;
  
  // Allow typing in Fresh mode; else require config + active chat
  const canType = state.isFresh || (hasConfig && isChatActive);
  setLoading(!canType);
};

// Global Event Listener (Delegation)
document.addEventListener('click', async (e) => {
  const target = e.target;

  // Start Demo Button
  if (target.closest('.start-demo')) {
    startGame(target.closest('.card').dataset.id);
  }

  // Configure LLM Button
  if (target.closest('#configure-llm')) {
    try {
      if (!state.user) showAlert('warning', 'Sign in to save LLM settings.');
      const { openaiConfig } = await load('ui'); const prev=getLLMConfig().baseUrl,prevK=getLLMConfig().apiKey; await openaiConfig({ show: true }); checkGate(); const next=getLLMConfig().baseUrl,nextK=getLLMConfig().apiKey; if(next && (next!==prev || nextK!==prevK)) showAlert('success','LLM configured');
    } catch { }
  }

  // Auth: Sign In
  if (target.closest('#auth-btn')) {
    if (!sbClient) {
        showAlert('danger', '<b>Authentication Unavailable</b><br>Could not connect to the database. Check your internet or config.');
        return;
    }
    try {
      const popup = await load('auth');
      await popup.default(sbClient, { provider: 'google' });
    } catch (e) {
      console.warn("Auth popup failed", e);
      if (sbClient && sbClient.auth) {
        sbClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } })
            .catch(() => showAlert('danger', 'Sign in failed.'));
      }
    }
  }

  // Auth: Sign Out
  if (target.closest('#signout-btn')) {
    if (sbClient && sbClient.auth) await sbClient.auth.signOut();
  }

  // Profile: Load Sessions
  if (target.closest('#profile-btn')) {
    const modal = new bootstrap.Modal($('#profile-modal'));
    modal.show();
    const list = $('#session-list');
    const messagesBox = $('#session-messages');
    list.innerHTML = "<div class='p-3 text-center'>Loading...</div>";
    messagesBox.innerHTML = '';

    const { data } = await sbClient.from('game_sessions')
      .select('*').order('created_at', { ascending: false });

    list.innerHTML = '';
    state.selectedSession = null;
    $('#continue-session').disabled = true;
    $('#delete-session').disabled = true;
    
    // Render History List
    (data || []).forEach(sess => {
      const btn = document.createElement('button');
      btn.className = 'list-group-item list-group-item-action small';
      btn.innerText = `Session ${sess.id.slice(0, 8)} (${new Date(sess.created_at).toLocaleString()})`;
      
      btn.onclick = async () => {
        state.selectedSession = sess;
        const { data: msgs } = await sbClient.from('chat_messages')
          .select('*').eq('session_id', sess.id).order('created_at');
          
        // Preview in modal right pane
        messagesBox.innerHTML = '';
        (msgs || []).forEach(m => {
          const bubble = document.createElement('div');
          bubble.className = `chat-msg-wrap ${m.role === 'ai' ? 'msg-ai' : 'msg-user text-end'}`;
          bubble.innerHTML = `<small class=\"text-muted\">${m.role === 'ai' ? '<i class=\"bi bi-cpu-fill\"></i> Advisor' : 'You <i class=\"bi bi-person-circle\"></i>'}</small>
                              <div class=\"bubble p-2 rounded-3 d-inline-block text-start\">${m.content}</div>`;
          messagesBox.appendChild(bubble);
        });
        $('#continue-session').disabled = false;
        $('#delete-session').disabled = false;
      };
      list.appendChild(btn);
    });

    // Continue: restore chat and close modal
    $('#continue-session').onclick = async () => {
      if (!state.selectedSession) return;
      state.session = state.selectedSession;
      const { data: msgs } = await sbClient.from('chat_messages')
        .select('*').eq('session_id', state.session.id).order('created_at');
      $('#chat').innerHTML = '';
      state.msgs = [];
      (msgs || []).forEach(m => {
        state.msgs.push({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content });
        appendMsg(m.role, m.content);
      });
      checkGate();
      bootstrap.Modal.getInstance($('#profile-modal')).hide();
    };

    // Delete session (and its messages)
    $('#delete-session').onclick = async () => {
      if (!state.selectedSession) return;
      await sbClient.from('chat_messages').delete().eq('session_id', state.selectedSession.id);
      await sbClient.from('game_sessions').delete().eq('id', state.selectedSession.id);
      showAlert('info', 'Session deleted.');
      bootstrap.Modal.getInstance($('#profile-modal')).hide();
    };
  }
});

// Input Handling
const handleSendClick = (e) => {
  e.preventDefault();
  handleTurn($('#user-input').value.trim());
};

$('#send-btn').addEventListener('click', handleSendClick);
$('#user-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSendClick(e);
});

// Start
window.addEventListener('load', init);





class BoardGame {
  constructor(containerId, askLLMFn) {
    this.container = document.querySelector(containerId);
    this.askLLM = askLLMFn;
    this.playerPosition = 0;
    this.score = 1000;
    this.xp = 0;
    this.domain = "";
    this.tiles = [];
    this.isRolling = false;
    this.boardSize = 20;
    this.currency = "Credits";
  }

  async init() {
    this.renderSetup();
  }

  renderSetup() {
    this.container.innerHTML = `
      <div class="h-100 d-flex flex-column justify-content-center align-items-center text-white text-center p-5 font-monospace">
        <h1 class="display-4 mb-4"><i class="bi bi-joystick"></i> Game Generator</h1>
        <p class="lead mb-4">Turn any subject into a playable strategy board game in seconds.</p>
        
        <div class="card bg-dark border-light w-100" style="max-width: 500px">
          <div class="card-body p-4">
            <h5 class="card-title mb-3">Choose your Challenge</h5>
            <div class="mb-3 text-start">
              <label class="form-label text-warning mb-1">What do you want to master?</label>
              <input type="text" id="domain-input" class="form-control form-control-lg bg-black text-white border-secondary" placeholder="e.g. Quantum Physics, Startup Law, Indian History...">
            </div>
            <div class="d-grid">
              <button id="start-game-btn" class="btn btn-success btn-lg">
                <i class="bi bi-stars"></i> Generate Game Board
              </button>
            </div>
          </div>
        </div>
        
        <div class="mt-4 text-white-50 small">
          <i class="bi bi-cpu"></i> Powered by your LLM Advisor
        </div>
      </div>
    `;

    this.container.querySelector('#start-game-btn').onclick = () => {
      const input = this.container.querySelector('#domain-input').value.trim();
      if (!input) return;
      this.domain = input;
      this.startGameGeneration();
    };
  }

  async startGameGeneration() {
    this.renderLayout(true); // Show layout with loading state
    await this.generateBoardContent(this.domain);
  }

  renderLayout(isLoading = false) {
    this.container.innerHTML = `
      <div class="score-panel justify-content-center">
        <div class="score-item border border-warning text-warning"><i class="bi bi-coin"></i> <span id="game-score">${this.score}</span></div>
        <div class="score-item border border-info text-info"><i class="bi bi-mortarboard-fill"></i> <span id="game-knowledge">${this.xp}</span> XP</div>
        <div class="score-item border border-secondary text-white small">${this.domain ? this.domain.toUpperCase() : 'LOADING...'}</div>
      </div>
      
      <div class="board-container" id="game-board">
        <!-- Center Hub -->
        <div class="board-center text-center">
          ${isLoading ? 
            `<div class="spinner-border text-primary mb-3" role="status"></div>
             <h4 class="animate-pulse">Designing "${this.domain}"...</h4>
             <p class="small text-muted">Generating tiles, rules, and economy...</p>` 
            : 
            `<h2 class="text-white mb-2" style="text-shadow:0 0 10px white">${this.domain}</h2>
             <div class="small text-white-50 mb-4">STRATEGY EDITION</div>
             <div id="dice-display" class="mb-3"><i class="bi bi-dice-6"></i></div>
             <button id="roll-btn" class="btn btn-primary btn-lg px-5 shadow-lg">ROLL DICE</button>
             <p class="mt-3 text-white-50 small" id="game-log">Press Roll to start!</p>`
          }
        </div>
      </div>

      <!-- Question Modal -->
      <div class="game-modal-overlay" id="question-modal-overlay">
        <div class="game-modal">
          <div class="modal-header d-flex justify-content-between">
            <h3 id="modal-title" class="text-primary">Challenge</h3>
            <span class="badge bg-dark border" id="modal-reward">Reward: 100</span>
          </div>
          <div class="modal-body mt-3">
            <p id="modal-question" class="fs-5 mb-4">...</p>
            <div id="modal-options" class="modal-options w-100"></div>
            <div id="modal-feedback" class="mt-3 d-none"></div>
          </div>
          <div class="modal-footer mt-4 text-end">
            <button class="btn btn-light px-4 d-none" id="modal-close-btn">Continue</button>
          </div>
        </div>
      </div>
    `;

    // Render Tiles Skeleton
    const board = this.container.querySelector('#game-board');
    // Top(0-5), Right(6-9), Bottom(10-15), Left(16-19)
    for (let i = 0; i < 6; i++) this.createTileDOM(i, 1, i + 1, board);
    for (let i = 0; i < 4; i++) this.createTileDOM(6 + i, i + 2, 6, board);
    for (let i = 0; i < 6; i++) this.createTileDOM(10 + i, 6, 6 - i, board);
    for (let i = 0; i < 4; i++) this.createTileDOM(16 + i, 6 - (i + 1), 1, board);

    // Initial Token
    this.token = document.createElement('div');
    this.token.className = 'player-token';
    board.appendChild(this.token);
    this.moveTokenVisual(0);

    if (!isLoading) {
      this.attachEvents();
    }
  }

  attachEvents() {
    const btn = this.container.querySelector('#roll-btn');
    if(btn) btn.onclick = () => this.handleRoll();
    this.container.querySelector('#modal-close-btn').onclick = () => this.closeModal();
  }

  createTileDOM(index, row, col, parent) {
    const el = document.createElement('div');
    el.className = 'tile';
    el.style.gridRow = row;
    el.style.gridColumn = col;
    el.dataset.index = index;
    el.innerHTML = `<span class="spinner-grow spinner-grow-sm text-secondary" style="--bs-spinner-width: 0.5rem; --bs-spinner-height: 0.5rem;"></span>`;
    this.tiles[index] = { element: el, type: 'loading', name: '...' };
    parent.appendChild(el);
  }

  moveTokenVisual(index) {
    const tile = this.tiles[index].element;
    const boardRect = this.container.querySelector('#game-board').getBoundingClientRect();
    const rect = tile.getBoundingClientRect();
    
    // Calculate relative position within the board container
    const top = rect.top - boardRect.top + rect.height / 2;
    const left = rect.left - boardRect.left + rect.width / 2;
    
    this.token.style.top = `${top}px`;
    this.token.style.left = `${left}px`;
    
    document.querySelectorAll('.tile').forEach(t => t.classList.remove('player-here'));
    tile.classList.add('player-here');
  }

  async generateBoardContent(domain) {
    // 16 property tiles needed (20 total - 4 corners)
    this.setTile(0, "START", "flag-fill", "corner");
    this.setTile(5, "BREAK", "cup-hot-fill", "corner");
    this.setTile(10, "BONUS", "star-fill", "corner");
    this.setTile(15, "RISK", "exclamation-diamond-fill", "corner");

    try {
      this.log(`Consulting AI Advisor about "${domain}"...`);

      // Asking for 20 items to ensure we have enough even if some are filtered or missing
      const prompt = `You are a game designer. Generate 20 distinct, short board game tile names (1-3 words max) for the domain: "${domain}".
      Examples (if domain was 'Physics'): ["Gravity", "Inertia", "Friction", "Quantum State", "Relativity", "Force", "Energy", "Matter", "Dark Matter", "String Theory", "Thermodynamics", "Entrophy", "Velocity", "Mass", "Atom", "Cosmos"].
      Examples (if domain was 'History'): ["Ancient Rome", "The Crusades", "Industrial Revolution", "Cold War", "Renaissance", "Silk Road", "Feudalism", "Democracy", "Empire", "Colonialism"].
      
      Return strictly a JSON list of strings. Do not use Markdown.`;
      
      let items = [];

      try {
        const responseStream = await this.askLLM([{role: 'user', content: prompt}]);
        let fullText = "";
        for await (const chunk of responseStream) fullText += chunk;
        
        console.log("Board Generation Output:", fullText);
        items = parseRelaxedJSON(fullText);

        if (!Array.isArray(items)) throw new Error("Output is not an array");
      } catch (e) {
        console.error("LLM Generation failed", e);
        this.log(`Generation failed: ${e.message}. Using placeholders.`);
        // Fallback to dynamic placeholders
        items = Array(16).fill(null).map((_, i) => `${domain} Concept ${i + 1}`);
      }
      
      if (!items || items.length === 0) {
           items = Array(16).fill(null).map((_, i) => `${domain} Concept ${i + 1}`);
      }
      
      // Ensure we have enough items
      while (items.length < 16) {
          items = items.concat(items);
      }
      items = items.slice(0, 16);

      // Distribute items to non-corner tiles
      let itemIdx = 0;
      for (let i = 0; i < 20; i++) {
        if (i % 5 === 0) continue; // Skip corners
        const topic = items[itemIdx % items.length];
        this.setTile(i, topic, "journal-album", "property", topic);
        itemIdx++;
      }
      
      // Update Center Hub with Game Controls
      this.container.querySelector('.board-center').innerHTML = `
             <h2 class="text-white mb-2" style="text-shadow:0 0 10px white; text-transform: capitalize;">${domain}</h2>
             <div class="small text-white-50 mb-4">STRATEGY EDITION</div>
             <div id="dice-display" class="mb-3"><i class="bi bi-dice-6"></i></div>
             <button id="roll-btn" class="btn btn-primary btn-lg px-5 shadow-lg">ROLL DICE</button>
             <p class="mt-3 text-white-50 small" id="game-log">Press Roll to start!</p>
      `;
      this.attachEvents();

    } catch (e) {
      console.error(e);
      this.renderSetup(); // Go back if critical failure
    }
  }

  setTile(index, name, icon, type, metadata = null) {
    const t = this.tiles[index];
    t.name = name;
    t.type = type;
    t.metadata = metadata;
    // Keep it minimal text to fit
    t.element.innerHTML = `<i class="bi bi-${icon} tile-icon"></i><div style="line-height:1.1">${name}</div>`;
    if (type === 'corner') {
      t.element.classList.add('corner');
    } else {
      t.element.classList.add('property');
    }
  }

  async handleRoll() {
    if (this.isRolling) return;
    this.isRolling = true;
    
    const btn = this.container.querySelector('#roll-btn');
    if (btn) btn.disabled = true;
    
    const diceDisplay = this.container.querySelector('#dice-display');
    diceDisplay.classList.add('rolling');
    
    let rolls = 0;
    const interval = setInterval(() => {
      const face = Math.floor(Math.random() * 6) + 1;
      diceDisplay.innerHTML = `<i class="bi bi-dice-${face}"></i>`;
      rolls++;
      if (rolls > 12) {
        clearInterval(interval);
        this.finishRoll(face);
      }
    }, 80);
  }

  async finishRoll(roll) {
    const diceDisplay = this.container.querySelector('#dice-display');
    diceDisplay.classList.remove('rolling');
    this.isRolling = false;
    
    this.log(`Rolled a ${roll}!`);
    
    // Step-by-step move
    for (let i = 0; i < roll; i++) {
        this.playerPosition = (this.playerPosition + 1) % 20;
        this.moveTokenVisual(this.playerPosition);
        await new Promise(r => setTimeout(r, 250));
    }
    
    setTimeout(() => this.handleLanding(), 300);
    
    const btn = this.container.querySelector('#roll-btn');
    if (btn) btn.disabled = false;
  }

  handleLanding() {
    const tile = this.tiles[this.playerPosition];
    this.log(`Landed on ${tile.name}`);
    
    if (tile.type === 'corner') {
      this.handleCorner(tile);
    } else {
      this.askQuestion(tile.metadata);
    }
  }

  handleCorner(tile) {
     if (tile.name === 'START') {
         this.score += 200;
         this.log("Passed Start! +200 Credits");
     } else if (tile.name === 'BONUS') {
         const bonus = Math.floor(Math.random() * 300) + 100;
         this.score += bonus;
         this.log(`Lucky find! +${bonus} Credits`);
     } else if (tile.name === 'RISK') {
         const penalty = Math.floor(Math.random() * 200) + 50;
         this.score = Math.max(0, this.score - penalty);
         this.log(`Market Crash! -${penalty} Credits`);
     } else {
         this.log("Just resting...");
     }
     this.updateUI();
  }

  async askQuestion(topic) {
    this.openModal(`Topic: ${topic}`);
    const qEl = this.container.querySelector('#modal-question');
    const optsEl = this.container.querySelector('#modal-options');
    
    // UI Loading State
    qEl.innerHTML = `<div class="d-flex align-items-center justify-content-center gap-3">
        <div class="spinner-border text-primary"></div> 
        <div>Consulting the ${this.domain} Expert...</div>
    </div>`;
    optsEl.innerHTML = '';
    
    // 1. Stricter Prompt
    const prompt = `You are a game engine.
    Topic: "${topic}" inside Domain: "${this.domain}".
    Task: Generate a multiple-choice question.
    
    CRITICAL: Output valid JSON only. Do not stutter. Do not use Markdown.
    
    Format:
    {
      "question": "The question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Why A is correct.",
      "reward": 150
    }`;
    
    try {
        const responseStream = await this.askLLM([{role: 'user', content: prompt}]);
        let fullText = "";
        for await (const chunk of responseStream) fullText += chunk;
        
        console.log("LLM Raw Output:", fullText); // Debug log

        // 2. Use the new robust parser
        const data = parseRelaxedJSON(fullText);
        this.currentQuestionData = data;
        
        // 3. Render
        this.container.querySelector('#modal-reward').textContent = `Reward: ${data.reward || 100}`;
        qEl.textContent = data.question;
        optsEl.innerHTML = '';
        
        if (!data.options || !Array.isArray(data.options)) throw new Error("Invalid options format");
        
        data.options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = "btn btn-outline-light w-100 text-start mb-2 p-3 position-relative";
            btn.textContent = opt;
            btn.onclick = () => this.handleAnswer(idx, btn);
            optsEl.appendChild(btn);
        });
        
    } catch(e) {
        console.error(e);
        qEl.innerHTML = `<div class="alert alert-danger">
          <strong>Generation Error:</strong> ${e.message}<br>
          <small class="d-block mt-2 text-muted">Try rolling again.</small>
        </div>`;
    }
  }

  handleAnswer(selectedIdx, btn) {
      const data = this.currentQuestionData;
      const feedback = this.container.querySelector('#modal-feedback');
      const allBtns = this.container.querySelectorAll('#modal-options button');
      
      allBtns.forEach(b => b.disabled = true);
      
      if (selectedIdx === data.correctIndex) {
          btn.classList.remove('btn-outline-light');
          btn.classList.add('btn-success');
          
          const reward = data.reward || 100;
          this.score += reward;
          this.xp += 50;
          feedback.innerHTML = `<div class="text-success"><i class="bi bi-check-circle-fill"></i> Correct! +${reward}</div><div class="small text-white-50 mt-1">${data.explanation}</div>`;
      } else {
          btn.classList.remove('btn-outline-light');
          btn.classList.add('btn-danger');
          allBtns[data.correctIndex].classList.remove('btn-outline-light');
          allBtns[data.correctIndex].classList.add('btn-success'); // Show right answer
          
          this.score = Math.max(0, this.score - 50);
          feedback.innerHTML = `<div class="text-danger"><i class="bi bi-x-circle-fill"></i> Incorrect. -50</div><div class="small text-white-50 mt-1">${data.explanation}</div>`;
      }
      
      feedback.classList.remove('d-none');
      this.updateUI();
      
      const closeBtn = this.container.querySelector('#modal-close-btn');
      closeBtn.classList.remove('d-none');
      closeBtn.focus();
  }

  updateUI() {
      const s = this.container.querySelector('#game-score');
      if(s) s.textContent = this.score;
      
      const x = this.container.querySelector('#game-knowledge');
      if(x) x.textContent = this.xp;
  }

  log(text) {
      const l = this.container.querySelector('#game-log');
      if(l) l.textContent = text;
  }

  openModal(title) {
      const ol = this.container.querySelector('#question-modal-overlay');
      ol.classList.add('active');
      this.container.querySelector('#modal-title').textContent = title;
      this.container.querySelector('#modal-feedback').classList.add('d-none');
      this.container.querySelector('#modal-close-btn').classList.add('d-none');
  }

  closeModal() {
      this.container.querySelector('#question-modal-overlay').classList.remove('active');
      
      // Check for victory/defeat logic if we wanted, but infinite play is fine for now
  }
}
