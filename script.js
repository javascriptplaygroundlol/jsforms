/* script.js - shared logic for index/section/thread/login pages
   LocalStorage key: jspf_v3
   No default admin account. If user registers or logs in with username "Toastyzz0"
   they are automatically set as moderator (user.isModerator = true).
*/

(async function(){
  // -- utilities --
  const $ = s => document.querySelector(s);
  const el = (t, cls) => { const e = document.createElement(t); if(cls) e.className = cls; return e; };
  const uid = p => (p||'id') + '-' + Math.random().toString(36).slice(2,10);

  async function hash(text){
    const enc = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  const STORAGE_KEY = 'jspf_v3';
  const DEFAULT_DB = {
    sections: [
      {id: 'sec-general', title: 'General'},
      {id: 'sec-help', title: 'Help'},
      {id: 'sec-showcase', title: 'Showcase'}
    ],
    users: [],
    threads: [],
    bans: {},
    mutes: {}
  };

  function loadDB(){
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw){ localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DB)); return JSON.parse(JSON.stringify(DEFAULT_DB)); }
    return JSON.parse(raw);
  }
  function saveDB(db){ localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }

  let DB = loadDB();
  let currentUser = null;

  // --- Auth helpers ---
  function setCurrentUser(u){
    currentUser = u;
    if(!u) { localStorage.removeItem('jspf_current'); return; }
    localStorage.setItem('jspf_current', u.id);
  }
  function restoreCurrentUser(){
    const id = localStorage.getItem('jspf_current');
    if(!id) return null;
    const u = DB.users.find(x=>x.id===id);
    currentUser = u || null;
    // ensure Toastyzz0 is moderator if matches name
    if(currentUser && (currentUser.username === 'Toastyzz0')) { currentUser.isModerator = true; currentUser.role = 'moderator'; const us = DB.users.find(x=>x.id===currentUser.id); if(us){ us.isModerator = true; us.role = 'moderator'; saveDB(DB); } }
    return currentUser;
  }

  // On load, try restore
  restoreCurrentUser();

  // --- common renderers ---
  function renderAuthArea(){
    const mount = $('#authArea');
    if(!mount) return;
    mount.innerHTML = '';
    if(currentUser){
      const chip = el('div','user-chip'); chip.textContent = currentUser.displayName || currentUser.username;
      const edit = el('button','btn'); edit.textContent='Edit'; edit.onclick = ()=> location.href='login.html#edit';
      const out = el('button','btn'); out.textContent='Logout'; out.onclick = ()=> { setCurrentUser(null); currentUser=null; saveDB(DB); renderAll(); location.href = location.pathname; };
      mount.appendChild(chip); mount.appendChild(edit); mount.appendChild(out);
    } else {
      const inBtn = el('button','btn'); inBtn.textContent='Login'; inBtn.onclick = ()=> location.href='login.html';
      const reg = el('button','btn primary'); reg.textContent='Register'; reg.onclick = ()=> location.href='login.html#register';
      mount.appendChild(inBtn); mount.appendChild(reg);
    }
  }

  function renderSectionsList(){
    const ul = $('#sectionsList');
    if(!ul) return;
    ul.innerHTML = '';
    DB.sections.forEach(s=>{
      const li = el('li');
      li.innerHTML = `<div><strong>${s.title}</strong><div class="muted" style="font-size:13px">${DB.threads.filter(t=>t.sectionId===s.id).length} threads</div></div>`;
      const a = el('a'); a.className='btn ghost'; a.textContent='Open'; a.href = `section.html?sec=${encodeURIComponent(s.id)}`;
      li.appendChild(a);
      ul.appendChild(li);
    });
  }

  function renderAccountQuick(){
    const q = $('#accountQuick'); if(!q) return;
    q.innerHTML = '';
    if(!currentUser){ q.innerHTML = '<div class="muted">Not signed in</div>'; return; }
    q.innerHTML = `<div><strong>${currentUser.displayName}</strong></div><div class="muted">@${currentUser.username}</div>`;
    const btn = el('button','btn'); btn.textContent='Edit profile'; btn.onclick = ()=> location.href='login.html#edit';
    q.appendChild(btn);
  }

  function canModerate(){
    return !!(currentUser && currentUser.isModerator);
  }
  function canEditPost(authorId){
    if(!currentUser) return false;
    if(currentUser.isModerator) return true;
    return currentUser.id === authorId;
  }

  function renderModTools(){
    const mount = $('#modTools'); if(!mount) return;
    mount.innerHTML = '';
    if(!canModerate()){ mount.innerHTML = '<div class="muted">Sign in as a moderator to access moderation tools.</div>'; return; }

    const title = el('div'); title.className='card-title'; title.textContent = 'User management';
    mount.appendChild(title);

    DB.users.forEach(u=>{
      const row = el('div'); row.style.display='flex'; row.style.justifyContent='space-between'; row.style.marginBottom='8px';
      row.innerHTML = `<div><strong>${u.displayName}</strong> <span class="muted">@${u.username}</span></div>`;
      const actions = el('div');
      const banBtn = el('button','btn small'); banBtn.textContent = (DB.bans[u.id] ? 'Unban' : 'Ban');
      banBtn.onclick = ()=>{
        if(DB.bans[u.id]) delete DB.bans[u.id]; else DB.bans[u.id] = {reason:'Banned by moderator', until:0};
        saveDB(DB); renderAll();
      };
      const muteBtn = el('button','btn small'); muteBtn.textContent = (DB.mutes[u.id] ? 'Unmute' : 'Mute 1h');
      muteBtn.onclick = ()=>{
        if(DB.mutes[u.id]) delete DB.mutes[u.id]; else DB.mutes[u.id] = {until: Date.now()+1000*60*60};
        saveDB(DB); renderAll();
      };
      const promBtn = el('button','btn small'); promBtn.textContent = (u.isModerator ? 'Demote' : 'Promote');
      promBtn.onclick = ()=>{
        u.isModerator = !u.isModerator;
        if(u.isModerator) u.role = 'moderator'; else delete u.role;
        saveDB(DB); renderAll();
      };
      actions.appendChild(banBtn); actions.appendChild(muteBtn); actions.appendChild(promBtn);
      row.appendChild(actions);
      mount.appendChild(row);
    });
  }

  // --- page-specific logic ---
  async function pageIndex(){
    // render overall index: recent threads or notice
    const content = $('#content');
    content.innerHTML = '';
    const header = el('div'); header.style.display='flex'; header.style.justifyContent='space-between';
    const h = el('h2'); h.textContent = 'Home';
    const createBtn = el('button','btn primary'); createBtn.textContent = 'New Thread'; createBtn.onclick = ()=> location.href='section.html';
    header.appendChild(h); header.appendChild(createBtn);
    content.appendChild(header);

    const threads = DB.threads.slice().sort((a,b)=>b.created - a.created);
    if(threads.length){
      const list = el('div','thread-list');
      threads.forEach(t => list.appendChild(threadCard(t)));
      content.appendChild(list);
    } else {
      const note = el('div','card'); note.innerHTML = '<div class="muted">No threads yet. Create the first thread.</div>';
      content.appendChild(note);
    }
  }

  function threadCard(t){
    const box = el('div','thread');
    const left = el('div');
    const title = el('div','title'); title.textContent = t.title;
    const meta = el('div','meta'); const author = DB.users.find(u=>u.id===t.authorId);
    meta.textContent = `${author ? author.displayName : 'Unknown'} • ${new Date(t.created).toLocaleDateString()}`;
    left.appendChild(title); left.appendChild(meta);
    const right = el('div','actions');
    const open = el('a'); open.className='btn small'; open.textContent='Open'; open.href = `thread.html?thread=${encodeURIComponent(t.id)}`;
    right.appendChild(open);
    box.appendChild(left); box.appendChild(right);
    return box;
  }

  function pageSection(){
    const params = new URLSearchParams(location.search);
    const secId = params.get('sec') || DB.sections[0].id;
    const sec = DB.sections.find(s=>s.id===secId);
    const content = $('#content'); content.innerHTML = '';
    const header = el('div'); header.style.display='flex'; header.style.justifyContent='space-between';
    const h = el('h2'); h.textContent = sec ? sec.title : 'Section';
    const createBtn = el('button','btn primary'); createBtn.textContent = 'New Thread'; createBtn.onclick = ()=> showNewThreadForm(secId);
    header.appendChild(h); header.appendChild(createBtn);
    content.appendChild(header);

    const threads = DB.threads.filter(t=>t.sectionId===secId).sort((a,b)=>b.created - a.created);
    if(threads.length){
      const list = el('div','thread-list');
      threads.forEach(t => list.appendChild(threadCard(t)));
      content.appendChild(list);
    } else {
      const note = el('div','card'); note.innerHTML = '<div class="muted">No threads in this section yet.</div>';
      content.appendChild(note);
    }
  }

  function pageThread(){
    const params = new URLSearchParams(location.search);
    const tid = params.get('thread');
    const t = DB.threads.find(x=>x.id===tid);
    const content = $('#content'); content.innerHTML = '';

    if(!t){ content.appendChild(el('p')).textContent = 'Thread not found'; return; }

    const header = el('div'); header.style.display='flex'; header.style.justifyContent='space-between';
    const left = el('div');
    const title = el('h2'); title.textContent = t.title;
    const au = DB.users.find(u=>u.id===t.authorId);
    const meta = el('div','muted'); meta.innerHTML = `By <a href="#" data-user="${t.authorId}">${au ? au.displayName : 'Unknown'}</a> • ${new Date(t.created).toLocaleString()}`;
    left.appendChild(title); left.appendChild(meta);
    header.appendChild(left);

    const right = el('div');
    if(canEditPost(t.authorId)){
      const edit = el('button','btn'); edit.textContent='Edit'; edit.onclick = ()=> showEditThreadForm(t);
      right.appendChild(edit);
    }
    if(canModerate()){
      const del = el('button','btn'); del.textContent='Delete'; del.onclick = ()=> {
        if(confirm('Delete thread?')){ DB.threads = DB.threads.filter(x=>x.id!==t.id); saveDB(DB); location.href = `section.html?sec=${encodeURIComponent(t.sectionId)}`; }
      };
      right.appendChild(del);
    }
    header.appendChild(right);
    content.appendChild(header);

    const post = el('div','post');
    const pmeta = el('div','meta'); pmeta.innerHTML = `<div><strong>${au ? au.displayName : 'Unknown'}</strong></div><div class="muted">${new Date(t.created).toLocaleString()}</div>`;
    const pcont = el('div','content'); pcont.textContent = t.content;
    post.appendChild(pmeta); post.appendChild(pcont);
    content.appendChild(post);

    content.appendChild(el('h3')).textContent = 'Replies';
    const replies = t.replies || [];
    replies.forEach(r=>{
      const rp = el('div','post');
      const rmeta = el('div','meta');
      const ru = DB.users.find(u=>u.id===r.authorId);
      rmeta.innerHTML = `<div><a href="#" data-user="${r.authorId}">${ru ? ru.displayName : 'Unknown'}</a></div><div class="muted">${new Date(r.created).toLocaleString()}</div>`;
      rp.appendChild(rmeta);
      const rc = el('div','content'); rc.textContent = r.content;
      rp.appendChild(rc);
      const tools = el('div'); tools.style.marginTop='8px';
      if(canEditPost(r.authorId)){ const e = el('button','btn small'); e.textContent='Edit'; e.onclick = ()=> showEditReplyForm(t,r); tools.appendChild(e); }
      if(canModerate()){
        const del = el('button','btn small'); del.textContent='Delete'; del.onclick = ()=> { if(confirm('Delete reply?')){ t.replies = t.replies.filter(rr=>rr.id!==r.id); saveDB(DB); location.reload(); } };
        const ban = el('button','btn small'); ban.textContent='Ban'; ban.onclick = ()=> { if(confirm('Ban user?')){ DB.bans[r.authorId] = {reason:'Banned by moderator', until:0}; saveDB(DB); alert('User banned'); } };
        tools.appendChild(del); tools.appendChild(ban);
      }
      rp.appendChild(tools);
      content.appendChild(rp);
    });

    if(currentUser){
      const box = el('div','card');
      const ta = el('textarea'); ta.className='input'; ta.placeholder='Write a reply...';
      const postBtn = el('button','btn primary'); postBtn.textContent='Post reply';
      postBtn.onclick = ()=> {
        const m = DB.mutes[currentUser.id];
        if(m && m.until && m.until > Date.now()){ alert('You are muted'); return; }
        if(!ta.value.trim()){ alert('Write something'); return; }
        const r = { id: uid('rep'), authorId: currentUser.id, content: ta.value.trim(), created: Date.now() };
        t.replies = t.replies || []; t.replies.push(r); saveDB(DB); location.reload();
      };
      box.appendChild(ta); box.appendChild(postBtn);
      content.appendChild(box);
    } else {
      const note = el('div','muted'); note.textContent = 'Sign in to reply';
      content.appendChild(note);
    }
  }

  // --- login/register page handlers ---
  async function pageLogin(){
    const mount = $('#authForm');
    if(!mount) return;
    mount.innerHTML = '';
    const anchor = location.hash.replace('#','');

    function renderLoginForm(){
      const u = el('input'); u.className='input'; u.placeholder='Username';
      const p = el('input'); p.type='password'; p.className='input'; p.placeholder='Password';
      const btn = el('button','btn primary'); btn.textContent='Sign in';
      btn.onclick = async ()=> {
        const user = DB.users.find(x=>x.username.toLowerCase() === u.value.trim().toLowerCase());
        if(!user){ alert('Account not found'); return; }
        const ph = await hash(p.value);
        if(user.passHash !== ph){ alert('Incorrect password'); return; }
        if(DB.bans[user.id]){ alert('This account is banned.'); return; }
        // if username is Toastyzz0, ensure moderator flag
        if(user.username === 'Toastyzz0'){ user.isModerator = true; user.role = 'moderator'; saveDB(DB); }
        setCurrentUser(user);
        saveDB(DB);
        location.href = 'index.html';
      };
      mount.appendChild(el('div')).appendChild(u);
      mount.appendChild(el('div')).appendChild(p);
      mount.appendChild(btn);
    }

    async function renderRegisterForm(){
      const u = el('input'); u.className='input'; u.placeholder='Username (no spaces)';
      const d = el('input'); d.className='input'; d.placeholder='Display name (optional)';
      const p = el('input'); p.type='password'; p.className='input'; p.placeholder='Password (4+ chars)';
      const btn = el('button','btn primary'); btn.textContent='Create account';
      btn.onclick = async ()=> {
        const username = u.value.trim();
        if(!username){ alert('Enter username'); return; }
        if(DB.users.some(x=>x.username.toLowerCase()===username.toLowerCase())){ alert('Username taken'); return; }
        if(!p.value || p.value.length < 4){ alert('Password must be 4+ chars'); return; }
        const ph = await hash(p.value);
        const user = { id: uid('user'), username, displayName: d.value.trim() || username, passHash: ph, created: Date.now(), isModerator:false };
        if(username === 'Toastyzz0'){ user.isModerator = true; user.role = 'moderator'; }
        DB.users.push(user); saveDB(DB);
        setCurrentUser(user);
        location.href = 'index.html';
      };
      mount.appendChild(u); mount.appendChild(d); mount.appendChild(p); mount.appendChild(btn);
    }

    function renderEditProfile(){
      if(!currentUser){ location.href='login.html'; return; }
      const d = el('input'); d.className='input'; d.value = currentUser.displayName || '';
      const about = el('textarea'); about.className='input'; about.value = currentUser.about || '';
      const save = el('button','btn primary'); save.textContent='Save';
      save.onclick = ()=> {
        currentUser.displayName = d.value.trim() || currentUser.username;
        currentUser.about = about.value.trim();
        const u = DB.users.find(x=>x.id===currentUser.id);
        Object.assign(u, currentUser); saveDB(DB); location.href='index.html';
      };
      mount.appendChild(d); mount.appendChild(about); mount.appendChild(save);
    }

    // decide which to show
    if(anchor === 'register') renderRegisterForm();
    else if(anchor === 'edit') {
      // ensure session set from restoreCurrentUser
      restoreCurrentUser();
      renderEditProfile();
    } else renderLoginForm();
  }

  // --- small mod/new thread forms (in-page overlays) ---
  function showNewThreadForm(prefSectionId){
    if(!currentUser){ location.href='login.html'; return; }
    // simple prompt flow (no modal to keep multi-file simple)
    const title = prompt('Thread title:');
    if(!title) return;
    const content = prompt('Thread content:');
    if(!content) return;
    const secId = prefSectionId || DB.sections[0].id;
    const newThread = { id: uid('thr'), sectionId: secId, title: title.trim(), content: content.trim(), authorId: currentUser.id, created: Date.now(), replies: [] };
    DB.threads.push(newThread); saveDB(DB);
    location.href = `thread.html?thread=${encodeURIComponent(newThread.id)}`;
  }

  function showEditThreadForm(thread){
    if(!canEditPost(thread.authorId)){ alert('Not allowed'); return; }
    const newTitle = prompt('Edit title:', thread.title);
    if(newTitle === null) return;
    const newContent = prompt('Edit content:', thread.content);
    if(newContent === null) return;
    thread.title = newTitle.trim(); thread.content = newContent.trim(); saveDB(DB);
    location.reload();
  }

  function showEditReplyForm(thread, reply){
    if(!canEditPost(reply.authorId)){ alert('Not allowed'); return; }
    const newContent = prompt('Edit reply:', reply.content);
    if(newContent === null) return;
    reply.content = newContent.trim(); saveDB(DB); location.reload();
  }

  // --- search handler (works on pages that have #searchInput) ---
  function setupSearch(){
    const s = $('#searchInput');
    if(!s) return;
    s.addEventListener('input', e=>{
      const q = e.target.value.trim().toLowerCase();
      // very small inline search: jump to a "search results" page using URL param in index (basic)
      if(PAGE === 'index'){
        const content = $('#content'); content.innerHTML = `<h2>Search results for "${q}"</h2>`;
        if(!q) { pageIndex(); return; }
        const threads = DB.threads.filter(t => t.title.toLowerCase().includes(q) || t.content.toLowerCase().includes(q));
        const users = DB.users.filter(u => u.username.toLowerCase().includes(q) || (u.displayName||'').toLowerCase().includes(q));
        if(threads.length){
          const list = el('div','thread-list'); threads.forEach(t => list.appendChild(threadCard(t))); content.appendChild(list);
        }
        if(users.length){
          content.appendChild(el('h3')).textContent = 'Users';
          users.forEach(u=>{
            const r = el('div','card'); r.style.display='flex'; r.style.justifyContent='space-between'; r.innerHTML = `<div><strong>${u.displayName}</strong><div class="muted">@${u.username}</div></div>`;
            const v = el('a'); v.className='btn'; v.textContent='View'; v.href = `index.html?user=${encodeURIComponent(u.id)}`;
            r.appendChild(v); content.appendChild(r);
          });
        }
        if(!threads.length && !users.length) content.appendChild(el('div','muted')).textContent = 'No results.';
      } else {
        // on other pages, do nothing special for now
      }
    });
  }

  // --- navigation helper for user links ---
  document.body.addEventListener('click', e=>{
    const a = e.target.closest('[data-user]');
    if(!a) return;
    e.preventDefault();
    const uid = a.getAttribute('data-user');
    // open user view by redirecting to index with ?user=...
    location.href = `index.html?user=${encodeURIComponent(uid)}`;
  });

  // --- render index user view if ?user=... provided ---
  function maybeRenderUserFromQuery(){
    if(PAGE !== 'index') return false;
    const params = new URLSearchParams(location.search);
    const userId = params.get('user');
    if(!userId) return false;
    const u = DB.users.find(x=>x.id===userId);
    if(!u){ $('#content').innerHTML = '<p>User not found</p>'; return true; }
    const content = $('#content'); content.innerHTML = '';
    const h = el('h2'); h.textContent = u.displayName || u.username;
    const meta = el('div','muted'); meta.textContent = `@${u.username} • Joined ${new Date(u.created).toLocaleDateString()}`;
    content.appendChild(h); content.appendChild(meta);
    if(u.about) content.appendChild(el('p')).textContent = u.about;
    if(canModerate()){
      const box = el('div','card'); const banBtn = el('button','btn'); banBtn.textContent = (DB.bans[u.id] ? 'Unban user' : 'Ban user');
      banBtn.onclick = ()=> { if(DB.bans[u.id]) delete DB.bans[u.id]; else DB.bans[u.id] = {reason:'Banned by moderator', until:0}; saveDB(DB); renderAll(); };
      box.appendChild(banBtn);
      content.appendChild(box);
    }
    // show user's threads
    const threads = DB.threads.filter(t=>t.authorId===u.id);
    if(threads.length){
      content.appendChild(el('h3')).textContent = 'Threads by user';
      const list = el('div','thread-list'); threads.forEach(t => list.appendChild(threadCard(t))); content.appendChild(list);
    }
    return true;
  }

  // --- top-level render orchestrator ---
  function renderAll(){
    renderAuthArea();
    renderSectionsList();
    renderAccountQuick();
    renderModTools();
    setupSearch();
  }

  // --- page router ---
  function runPage(){
    renderAll();
    if(PAGE === 'index'){
      if(maybeRenderUserFromQuery()) return;
      pageIndex();
    } else if(PAGE === 'section'){
      pageSection();
    } else if(PAGE === 'thread'){
      pageThread();
    } else if(PAGE === 'login'){
      pageLogin();
    }
  }

  // bootstrap
  runPage();

  // expose small debug helpers
  window.JSPF = {
    DB,
    getCurrentUser: ()=>currentUser,
    reload: ()=>{ DB = loadDB(); restoreCurrentUser(); runPage(); }
  };

})();
