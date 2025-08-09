\
// app.js - Upgraded chat app (auth, 1:1, groups, files)
// Uses Firebase modular SDK loaded from CDN
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getDatabase, ref, set, push, onChildAdded, onValue, get, child, update, serverTimestamp, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { getStorage, ref as sref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

// Helpers
function $(id){return document.getElementById(id);}
function showMsg(el, txt, ok=true){ if(!el) return; el.textContent = txt; el.style.color = ok? '':'#ffb3b3'; setTimeout(()=>el.textContent='',(ok?4000:6000)); }
function escapeHtml(s){ return (s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function uidPair(a,b){ return a<b? a+'_'+b : b+'_'+a; } // deterministic chat id for 1:1

/* ------------------ AUTH PAGE ------------------ */
export function initAuthPage(){
  // tabs
  const tabLogin = $('tabLogin'), tabRegister = $('tabRegister'), tabForgot = $('tabForgot');
  const loginPanel = $('loginPanel'), registerPanel = $('registerPanel'), forgotPanel = $('forgotPanel');
  function showTab(t){ tabLogin.classList.remove('active'); tabRegister.classList.remove('active'); tabForgot.classList.remove('active'); loginPanel.classList.add('hidden'); registerPanel.classList.add('hidden'); forgotPanel.classList.add('hidden'); t.classList.add('active'); if(t===tabLogin) loginPanel.classList.remove('hidden'); if(t===tabRegister) registerPanel.classList.remove('hidden'); if(t===tabForgot) forgotPanel.classList.remove('hidden'); }
  tabLogin.onclick = ()=> showTab(tabLogin);
  tabRegister.onclick = ()=> showTab(tabRegister);
  tabForgot.onclick = ()=> showTab(tabForgot);

  // prevent forms default if JS breaks
  document.querySelectorAll('form').forEach(f=> f.addEventListener('submit', e=> e.preventDefault()));

  // toggles
  $('regEye').onclick = ()=> { const t=$('regPassword'); t.type = t.type==='password'?'text':'password'; $('regEye').textContent = t.type==='password'?'👁':'🙈'; }
  $('loginEye').onclick = ()=> { const t=$('loginPassword'); t.type = t.type==='password'?'text':'password'; $('loginEye').textContent = t.type==='password'?'👁':'🙈'; }

  // register
  $('registerForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = $('regName').value.trim();
    const email = $('regEmail').value.trim();
    const pass = $('regPassword').value;
    const photoFile = $('regPhoto').files[0];
    if(!name||!email||!pass) return showMsg($('regMsg'),'Please fill all fields', false);
    try{
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      // upload photo if present
      let photoURL = '';
      if(photoFile){
        const p = sref(storage, `avatars/${cred.user.uid}_${photoFile.name}`);
        await uploadBytes(p, photoFile);
        photoURL = await getDownloadURL(p);
      }
      await updateProfile(cred.user, { displayName: name, photoURL: photoURL || null });
      // write user profile to DB
      await set(ref(db, `users/${cred.user.uid}`), { name, email, photoURL: photoURL||'', createdAt: Date.now() });
      showMsg($('regMsg'),'Account created. Redirecting...');
      setTimeout(()=> location.href = 'app.html', 1000);
    }catch(err){
      console.error(err);
      showMsg($('regMsg'), err.message || 'Error', false);
    }
  });

  // login
  $('loginForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = $('loginEmail').value.trim();
    const pass = $('loginPassword').value;
    try{
      await signInWithEmailAndPassword(auth, email, pass);
      showMsg($('loginMsg'),'Logged in. Redirecting...');
      setTimeout(()=> location.href = 'app.html', 700);
    }catch(err){
      console.error(err);
      showMsg($('loginMsg'), err.message || 'Login failed', false);
    }
  });

  // forgot
  $('forgotForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = $('forgotEmail').value.trim();
    try{
      await sendPasswordResetEmail(auth, email);
      showMsg($('forgotMsg'), 'Password reset sent. Check your inbox.');
    }catch(err){
      console.error(err);
      showMsg($('forgotMsg'), err.message||'Error', false);
    }
  });
}

/* ------------------ MAIN APP PAGE ------------------ */
let activeChatId = null;
let activeIsGroup = false;
export function initAppPage(){
  // ensure served over http(s)
  if(location.protocol==='file:') alert('Run a local server (python -m http.server) or host files. Modules need HTTP/HTTPS.');

  // elements
  const meAvatar = $('meAvatar'), meName = $('meName'), meEmail = $('meEmail');
  const signOutBtn = $('signOutBtn'), chatList = $('chatList'), searchInput = $('searchInput');
  const newChatBtn = $('newChatBtn'), newGroupBtn = $('newGroupBtn');
  const messagesEl = $('messages'), chatNameEl = $('chatName'), chatSubEl = $('chatSub'), chatAvatar = $('chatAvatar');
  const msgForm = $('msgForm'), msgInput = $('msgInput'), attachBtn = $('attachBtn'), fileInput = $('fileInput');
  const newChatDialog = $('newChatDialog'), newGroupDialog = $('newGroupDialog');
  const newChatForm = $('newChatForm'), newGroupForm = $('newGroupForm');

  // auth state
  onAuthStateChanged(auth, async user=>{
    if(!user) return location.href = 'auth.html';
    // show profile
    meName.textContent = user.displayName || user.email.split('@')[0];
    meEmail.textContent = user.email;
    if(user.photoURL) meAvatar.style.backgroundImage = `url(${user.photoURL})`, meAvatar.textContent='';
    // presence
    const statusRef = ref(db, `status/${user.uid}`);
    await set(statusRef, { state: 'online', lastChanged: Date.now() });
    // load chat list (userChats)
    listenChatList(user.uid);
  });

  signOutBtn.addEventListener('click', async ()=>{ await signOut(auth); location.href='auth.html'; });

  // chat list
  function listenChatList(uid){
    chatList.innerHTML = '';
    const listRef = ref(db, `userChats/${uid}`);
    onChildAdded(listRef, async snap=>{
      const chatId = snap.key;
      const meta = snap.val();
      renderChatItem(chatId, meta);
    });
  }

  async function renderChatItem(chatId, meta){
    const el = document.createElement('div'); el.className='chat-item'; el.id = 'chat_'+chatId;
    const av = document.createElement('div'); av.className='avatar'; av.textContent = (meta.name||'C')[0].toUpperCase();
    const metaDiv = document.createElement('div'); metaDiv.className='meta';
    const nameDiv = document.createElement('div'); nameDiv.className='name'; nameDiv.textContent = meta.name || 'Chat';
    const lastDiv = document.createElement('div'); lastDiv.className='last'; lastDiv.textContent = meta.last || '';
    metaDiv.appendChild(nameDiv); metaDiv.appendChild(lastDiv);
    el.appendChild(av); el.appendChild(metaDiv);
    el.addEventListener('click', ()=> openChat(chatId, meta));
    chatList.prepend(el);
  }

  // create new 1:1
  newChatBtn.addEventListener('click', ()=> newChatDialog.showModal());
  $('closeNewChat').addEventListener('click', ()=> newChatDialog.close());
  newChatForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const friendEmail = $('friendEmail').value.trim();
    if(!friendEmail) return;
    // find user by email
    const usersRef = ref(db, 'users');
    try{
      const snap = await get(usersRef);
      let friend = null;
      snap.forEach(ch=>{ const v = ch.val(); if(v.email===friendEmail) friend = { uid: ch.key, ...v }; });
      if(!friend) return alert('No user with that email registered.');
      const me = auth.currentUser;
      const chatId = uidPair(me.uid, friend.uid);
      // create chat meta and userChats entries
      const meta = { name: friend.name || friend.email.split('@')[0], members: {[me.uid]:true, [friend.uid]:true}, isGroup:false, last:'' };
      await set(ref(db, `chats/${chatId}/meta`), meta);
      await set(ref(db, `userChats/${me.uid}/${chatId}`), { name: friend.name||friend.email.split('@')[0], last:'' });
      await set(ref(db, `userChats/${friend.uid}/${chatId}`), { name: me.displayName||me.email.split('@')[0], last:'' });
      newChatDialog.close();
      openChat(chatId, meta);
    }catch(err){ console.error(err); alert('Error creating chat'); }
  });

  // create group
  newGroupBtn.addEventListener('click', ()=> newGroupDialog.showModal());
  $('closeNewGroup').addEventListener('click', ()=> newGroupDialog.close());
  newGroupForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = $('groupName').value.trim(); const membersRaw = $('groupMembers').value.trim();
    const me = auth.currentUser;
    if(!name) return alert('Group needs a name');
    const members = [me.email];
    if(membersRaw) members.push(...membersRaw.split(',').map(s=>s.trim()).filter(Boolean));
    // find uids for emails
    const allUsersSnap = await get(ref(db,'users'));
    const memberUids = {};
    allUsersSnap.forEach(ch=>{ const v=ch.val(); if(members.includes(v.email)) memberUids[ch.key]=true; });
    // ensure current user included
    memberUids[me.uid] = true;
    const groupId = 'group_' + Date.now();
    const meta = { name, members: memberUids, isGroup:true, createdAt:Date.now() };
    await set(ref(db, `chats/${groupId}/meta`), meta);
    // add to each user's userChats
    for(const u of Object.keys(memberUids)){
      await set(ref(db, `userChats/${u}/${groupId}`), { name, last:'' });
    }
    newGroupDialog.close();
    openChat(groupId, meta);
  });

  // open chat
  async function openChat(chatId, meta){
    activeChatId = chatId;
    activeIsGroup = meta.isGroup || false;
    // mark active UI
    document.querySelectorAll('.chat-item').forEach(e=> e.classList.remove('active'));
    const node = $('chat_'+chatId); if(node) node.classList.add('active');
    // header
    chatNameEl.textContent = meta.name || 'Chat';
    chatSubEl.textContent = activeIsGroup ? 'Group chat' : 'Private chat';
    chatAvatar.textContent = (meta.name||'C')[0].toUpperCase();
    // listen messages
    messagesEl.innerHTML = '';
    const msgsRef = ref(db, `chats/${chatId}/messages`);
    onChildAdded(msgsRef, snap=>{
      const m = snap.val();
      addMessage(m);
    });
  }

  // add message UI
  function addMessage(m){
    const cur = auth.currentUser;
    const div = document.createElement('div'); div.className = 'message ' + (m.uid===cur.uid ? 'me' : 'other');
    let html = '<div class="text">'+ escapeHtml(m.text || '') +'</div>';
    if(m.type === 'image' && m.fileUrl){ html += `<img src="${m.fileUrl}" alt="img" />`; }
    if(m.type === 'file' && m.fileUrl){ html += `<div class="file"><a href="${m.fileUrl}" target="_blank">${m.fileName||'file'}</a></div>`; }
    html += `<div class="meta">${escapeHtml(m.name||'')} • ${new Date(m.ts).toLocaleString()}</div>`;
    div.innerHTML = html;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // send message (text or file)
  msgForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const txt = msgInput.value.trim(); if(!txt && !fileInput.files[0]) return;
    const cur = auth.currentUser;
    const payload = { uid: cur.uid, name: cur.displayName||cur.email.split('@')[0], ts: Date.now(), text: txt };
    if(fileInput.files[0]){
      const f = fileInput.files[0];
      const path = `uploads/${activeChatId}/${Date.now()}_${f.name}`;
      const stRef = sref(storage, path);
      const upl = await uploadBytes(stRef, f);
      const url = await getDownloadURL(stRef);
      if(f.type.startsWith('image/')){ payload.type='image'; payload.fileUrl = url; payload.fileName = f.name; } else { payload.type='file'; payload.fileUrl = url; payload.fileName = f.name; }
      fileInput.value = '';
    }
    // push message
    await push(ref(db, `chats/${activeChatId}/messages`), payload);
    // update last on userChats for all members (quick/naive approach)
    const metaSnap = await get(ref(db, `chats/${activeChatId}/meta`));
    const meta = metaSnap.val() || {};
    const members = meta.members ? Object.keys(meta.members) : [];
    for(const u of members){ await update(ref(db, `userChats/${u}/${activeChatId}`), { last: payload.text || (payload.fileName||'attachment') }); }
    msgInput.value = '';
  });

  attachBtn.addEventListener('click', ()=> fileInput.click());

  // search simple (client-side)
  searchInput.addEventListener('input', ()=>{
    const q = searchInput.value.toLowerCase();
    document.querySelectorAll('.chat-item').forEach(ci=>{
      const name = ci.querySelector('.name').textContent.toLowerCase();
      ci.style.display = name.includes(q)? 'flex' : 'none';
    });
  });
}
