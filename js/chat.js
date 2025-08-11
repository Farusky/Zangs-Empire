import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, addDoc, onSnapshot, orderBy, getDocs } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';
import { getStorage, ref as sref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

function $(id){return document.getElementById(id);}
function el(tag, cls){ const d=document.createElement(tag); if(cls) d.className=cls; return d; }
function escapeHtml(s){ return (s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

let currentUser = null;
let activeChatId = null;
let activeChatMeta = null;
let unsubscribeMessages = null;

// load user and chats
onAuthStateChanged(auth, async user => {
  if(!user) return location.href = 'login.html';
  currentUser = user;
  $('meName').textContent = user.displayName || user.email.split('@')[0];
  $('meEmail').textContent = user.email;
  if(user.photoURL) $('meAvatar').style.backgroundImage = `url(${user.photoURL})`, $('meAvatar').textContent='';
  loadUserChats(user.uid);
});

async function loadUserChats(uid){
  const userChatsCol = collection(db, 'userChats', uid, 'chats');
  onSnapshot(userChatsCol, snapshot=>{
    const list = $('chatsList'); list.innerHTML='';
    snapshot.forEach(docSnap=>{
      const data = docSnap.data();
      const id = docSnap.id;
      const item = el('div','chat-item'); item.id = 'chat_'+id;
      const av = el('div','avatar'); if(data.photoURL) av.style.backgroundImage = `url(${data.photoURL})`; else av.textContent = (data.name||'C')[0].toUpperCase();
      const meta = el('div','meta'); const name = el('div','name'); name.textContent = data.name||'Chat'; const last = el('div','last small muted'); last.textContent = data.last||'';
      meta.appendChild(name); meta.appendChild(last); item.appendChild(av); item.appendChild(meta);
      item.addEventListener('click', ()=> openChat(id, data));
      list.appendChild(item);
    });
  });
}

// new private chat
document.getElementById('newChatBtn').addEventListener('click', ()=> document.getElementById('dialogNewChat').showModal());
document.getElementById('closeNewChat').addEventListener('click', ()=> document.getElementById('dialogNewChat').close());
document.getElementById('formNewChat').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = $('friendEmail').value.trim();
  if(!email) return alert('Enter email');
  const usersCol = collection(db, 'users');
  const q = query(usersCol, where('email','==', email));
  const snaps = await getDocs(q);
  if(snaps.empty) return alert('User not found');
  const friendDoc = snaps.docs[0];
  const friendUid = friendDoc.id;
  const meUid = currentUser.uid;
  const chatId = meUid < friendUid ? meUid + '_' + friendUid : friendUid + '_' + meUid;
  const chatRef = doc(db, 'chats', chatId);
  const chatSnap = await getDoc(chatRef);
  if(!chatSnap.exists()){
    await setDoc(chatRef, { meta: { name: friendDoc.data().name||email, members: { [meUid]:true, [friendUid]:true }, isGroup:false, createdAt: Date.now() } });
  }
  await setDoc(doc(db,'userChats',meUid,'chats',chatId), { name: friendDoc.data().name||email, last: '' });
  await setDoc(doc(db,'userChats',friendUid,'chats',chatId), { name: currentUser.displayName||currentUser.email.split('@')[0], last: '' });
  document.getElementById('dialogNewChat').close();
  openChat(chatId, { name: friendDoc.data().name||email, isGroup:false, members: { [meUid]:true, [friendUid]:true } });
});

// new group
document.getElementById('newGroupBtn').addEventListener('click', ()=> document.getElementById('dialogNewGroup').showModal());
document.getElementById('closeNewGroup').addEventListener('click', ()=> document.getElementById('dialogNewGroup').close());
document.getElementById('formNewGroup').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const name = $('groupName').value.trim(); const membersRaw = $('groupMembers').value.trim();
  if(!name) return alert('Group name required');
  const members = membersRaw ? membersRaw.split(',').map(s=>s.trim()).filter(Boolean) : [];
  const usersCol = collection(db, 'users');
  const all = await getDocs(usersCol);
  const memberUids = {};
  all.forEach(d=>{ if(members.includes(d.data().email)) memberUids[d.id]=true; });
  memberUids[currentUser.uid] = true;
  const chatId = 'group_' + Date.now();
  await setDoc(doc(db,'chats',chatId), { meta: { name, members: memberUids, isGroup:true, createdAt: Date.now() } });
  for(const u of Object.keys(memberUids)){ await setDoc(doc(db,'userChats',u,'chats',chatId), { name, last: '' }); }
  document.getElementById('dialogNewGroup').close();
  openChat(chatId, { name, isGroup:true, members: memberUids });
});

// open chat
async function openChat(chatId, meta){
  activeChatId = chatId; activeChatMeta = meta;
  document.querySelectorAll('.chat-item').forEach(e=> e.classList.remove('active'));
  const node = document.getElementById('chat_'+chatId); if(node) node.classList.add('active');
  document.getElementById('chatTitle').textContent = meta.name || 'Chat';
  document.getElementById('chatAvatar').textContent = (meta.name||'C')[0].toUpperCase();
  document.getElementById('messages').innerHTML = '';
  if(unsubscribeMessages) unsubscribeMessages();
  const msgsCol = collection(db, 'chats', chatId, 'messages');
  const q = query(msgsCol, orderBy('ts','asc'));
  unsubscribeMessages = onSnapshot(q, snapshot=>{ snapshot.docChanges().forEach(chg=>{ if(chg.type==='added'){ addMessageToUI(chg.doc.data(), chg.doc.id); } }); });
  // set read cursor
  await setDoc(doc(db, 'chats', chatId, 'reads', currentUser.uid), { ts: Date.now() });
  // listen typing
  onSnapshot(doc(db,'typing',chatId), snap=>{
    const data = snap.exists()? snap.data() : {};
    const othersTyping = Object.keys(data).filter(k=> k!== currentUser.uid && data[k]===true);
    document.getElementById('chatSub').textContent = othersTyping.length ? 'Typing...' : (meta.isGroup? 'Group chat' : 'Private chat');
  });
  // listen reads for seen indicator
  onSnapshot(collection(db,'chats',chatId,'reads'), snap=>{
    let lastSeenTs = 0;
    snap.forEach(s=>{ if(s.id !== currentUser.uid){ const d = s.data(); if(d.ts && d.ts>lastSeenTs) lastSeenTs=d.ts; } });
    document.getElementById('seenIndicator').textContent = lastSeenTs? 'Last seen: ' + new Date(lastSeenTs).toLocaleString() : '';
  });
}

// add message
function addMessageToUI(m, id){
  const div = el('div', 'message ' + (m.uid===currentUser.uid? 'me':'other'));
  let html = '<div class="text">'+ escapeHtml(m.text||'') +'</div>';
  if(m.type==='image' && m.url) html += `<img src="${m.url}" />`;
  if(m.type==='file' && m.url) html += `<div class="file"><a href="${m.url}" target="_blank">${escapeHtml(m.fileName||'file')}</a></div>`;
  html += `<div class="meta">${escapeHtml(m.name||'')} • ${new Date(m.ts).toLocaleString()}</div>`;
  if(m.uid === currentUser.uid){
    // check reads
    getDoc(doc(db,'chats',activeChatId)).then(chatSnap=>{
      const members = chatSnap.exists()? Object.keys(chatSnap.data().meta.members||{}) : [];
      const readPromises = members.filter(u=> u!==currentUser.uid).map(u => getDoc(doc(db,'chats',activeChatId,'reads',u)));
      Promise.all(readPromises).then(results=>{
        const seen = results.some(r=> r.exists() && r.data().ts >= m.ts);
        if(seen) html += `<div class="seen">Seen</div>`;
        div.innerHTML = html; document.getElementById('messages').appendChild(div); document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
      });
    });
  } else { div.innerHTML = html; document.getElementById('messages').appendChild(div); document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight; }
}

// send message
document.getElementById('sendForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!activeChatId) return alert('Select a chat');
  const text = document.getElementById('messageInput').value.trim();
  const file = document.getElementById('fileInput').files[0];
  const payloadBase = { uid: currentUser.uid, name: currentUser.displayName||currentUser.email.split('@')[0], ts: Date.now(), text: text||'' };
  let payload = {...payloadBase};
  if(file){
    const path = `uploads/${activeChatId}/${Date.now()}_${file.name}`;
    const stRef = sref(storage, path); await uploadBytes(stRef, file); const url = await getDownloadURL(stRef);
    if(file.type.startsWith('image/')){ payload.type='image'; payload.url = url; payload.fileName = file.name; } else { payload.type='file'; payload.url = url; payload.fileName = file.name; }
    document.getElementById('fileInput').value = '';
  }
  await addDoc(collection(db,'chats',activeChatId,'messages'), payload);
  // update last for members
  const chatSnap = await getDoc(doc(db,'chats',activeChatId));
  const members = chatSnap.exists()? Object.keys(chatSnap.data().meta.members||{}) : [];
  for(const u of members){ await setDoc(doc(db,'userChats',u,'chats',activeChatId), { name: chatSnap.data().meta.name||'', last: payload.text || (payload.fileName||'attachment') }); }
  document.getElementById('messageInput').value = '';
});

// file buttons
document.getElementById('fileBtn').addEventListener('click', ()=> document.getElementById('fileInput').click());
document.getElementById('attachBtn').addEventListener('click', ()=> document.getElementById('attachFile').click());
document.getElementById('attachFile').addEventListener('change', async (e)=>{
  const f = e.target.files[0]; if(!f || !activeChatId) return alert('Open chat then attach');
  const path = `uploads/${activeChatId}/${Date.now()}_${f.name}`;
  const refS = sref(storage, path); await uploadBytes(refS, f); const url = await getDownloadURL(refS);
  const payload = { uid: currentUser.uid, name: currentUser.displayName||currentUser.email.split('@')[0], ts: Date.now(), type: f.type.startsWith('image/')? 'image':'file', url, fileName: f.name };
  await addDoc(collection(db,'chats',activeChatId,'messages'), payload);
});

// typing indicator
let typingTimer = null;
document.getElementById('messageInput').addEventListener('input', async ()=>{
  if(!activeChatId) return;
  await setDoc(doc(db,'typing',activeChatId), { [currentUser.uid]: true }, { merge: true });
  if(typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(async ()=>{ await setDoc(doc(db,'typing',activeChatId), { [currentUser.uid]: false }, { merge: true }); }, 2000);
});

// logout
document.getElementById('logout').addEventListener('click', async ()=>{ await signOut(auth); location.href='login.html'; });
