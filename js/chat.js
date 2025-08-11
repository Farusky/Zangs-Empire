import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { getFirestore, doc, setDoc, collection, addDoc, onSnapshot, query, where, orderBy, getDoc, getDocs } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';
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

onAuthStateChanged(auth, async user => {
  if(!user) return location.href = 'auth.html';
  currentUser = user;
  $('meName').textContent = user.displayName || user.email.split('@')[0];
  $('meEmail').textContent = user.email;
  if(user.photoURL) $('meAvatar').style.backgroundImage = `url(${user.photoURL})`, $('meAvatar').textContent='';
  // load user's chats
  loadUserChats(user.uid);
});

async function loadUserChats(uid){
  const userChatsCol = collection(db, 'userChats', uid, 'chats');
  // listen realtime: using onSnapshot on collection
  onSnapshot(userChatsCol, snapshot=>{
    const list = $('chatsList'); list.innerHTML='';
    snapshot.forEach(docSnap=>{
      const data = docSnap.data();
      const id = docSnap.id;
      const item = el('div','chat-item'); item.id = 'chat_'+id;
      const av = el('div','avatar'); av.textContent = (data.name||'C')[0].toUpperCase();
      const meta = el('div','meta'); const name = el('div','name'); name.textContent = data.name||'Chat'; const last = el('div','last small muted'); last.textContent = data.last||'';
      meta.appendChild(name); meta.appendChild(last); item.appendChild(av); item.appendChild(meta);
      item.addEventListener('click', ()=> openChat(id, data));
      list.appendChild(item);
    });
  });
}

// create private chat by email
$('newChatBtn').addEventListener('click', ()=> document.getElementById('dialogNewChat').showModal());
$('closeNewChat').addEventListener('click', ()=> document.getElementById('dialogNewChat').close());
document.getElementById('formNewChat').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = $('friendEmail').value.trim();
  if(!email) return alert('Enter email');
  // find user by email
  const usersCol = collection(db, 'users');
  const q = query(usersCol, where('email','==', email));
  const snaps = await getDocs(q);
  if(snaps.empty) return alert('User not found or not registered');
  const friendDoc = snaps.docs[0];
  const friendUid = friendDoc.id;
  const meUid = currentUser.uid;
  const chatId = meUid < friendUid ? meUid + '_' + friendUid : friendUid + '_' + meUid;
  // create chat meta if not exists
  const chatRef = doc(db, 'chats', chatId);
  const chatSnap = await getDoc(chatRef);
  if(!chatSnap.exists()){
    await setDoc(chatRef, { meta: { name: friendDoc.data().name||email, members: { [meUid]:true, [friendUid]:true }, isGroup:false, createdAt: Date.now() } });
  }
  // add to userChats subcollection
  await setDoc(doc(db, 'userChats', meUid, 'chats', chatId), { name: friendDoc.data().name||email, last: '' });
  await setDoc(doc(db, 'userChats', friendUid, 'chats', chatId), { name: currentUser.displayName||currentUser.email.split('@')[0], last: '' });
  document.getElementById('dialogNewChat').close();
  openChat(chatId, { name: friendDoc.data().name||email, isGroup:false, members: { [meUid]:true, [friendUid]:true } });
});

// create group
$('newGroupBtn').addEventListener('click', ()=> document.getElementById('dialogNewGroup').showModal());
$('closeNewGroup').addEventListener('click', ()=> document.getElementById('dialogNewGroup').close());
document.getElementById('formNewGroup').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const name = $('groupName').value.trim(); const membersRaw = $('groupMembers').value.trim();
  if(!name) return alert('Group name required');
  const members = membersRaw ? membersRaw.split(',').map(s=>s.trim()).filter(Boolean) : [];
  // map emails to uids
  const usersCol = collection(db, 'users');
  const allUsers = await getDocs(usersCol);
  const memberUids = {};
  allUsers.forEach(d=>{ if(members.includes(d.data().email)) memberUids[d.id]=true; });
  memberUids[currentUser.uid] = true;
  const chatId = 'group_' + Date.now();
  await setDoc(doc(db,'chats',chatId), { meta: { name, members: memberUids, isGroup:true, createdAt: Date.now() } });
  // add to userChats
  for(const u of Object.keys(memberUids)){
    await setDoc(doc(db,'userChats',u,'chats',chatId), { name, last: '' });
  }
  document.getElementById('dialogNewGroup').close();
  openChat(chatId, { name, isGroup:true, members: memberUids });
});

// open chat and listen messages
async function openChat(chatId, meta){
  activeChatId = chatId;
  activeChatMeta = meta;
  // UI header
  $('chatTitle').textContent = meta.name || 'Chat';
  $('chatAvatar').textContent = (meta.name||'C')[0].toUpperCase();
  $('messages').innerHTML = '';
  // unsubscribe old
  if(unsubscribeMessages) unsubscribeMessages();
  const msgsCol = collection(db, 'chats', chatId, 'messages');
  const q = query(msgsCol, orderBy('ts','asc'));
  unsubscribeMessages = onSnapshot(q, snapshot=>{
    snapshot.docChanges().forEach(chg=>{
      if(chg.type === 'added'){
        addMessageToUI(chg.doc.data());
      }
    });
  });
}

// add message to UI
function addMessageToUI(m){
  const div = el('div', 'message '+ (m.uid===currentUser.uid? 'me':'other'));
  let html = '<div class="text">'+ escapeHtml(m.text||'') +'</div>';
  if(m.type === 'image' && m.url) html += `<img src="${m.url}" />`;
  if(m.type === 'file' && m.url) html += `<div class="file"><a href="${m.url}" target="_blank">${escapeHtml(m.fileName||'file')}</a></div>`;
  html += `<div class="meta small muted">${escapeHtml(m.name||'')} • ${new Date(m.ts).toLocaleString()}</div>`;
  div.innerHTML = html; $('messages').appendChild(div); $('messages').scrollTop = $('messages').scrollHeight;
}

// send message
document.getElementById('sendForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!activeChatId) return alert('Select a chat first');
  const text = $('messageInput').value.trim();
  const file = document.getElementById('fileInput').files[0];
  const payload = { uid: currentUser.uid, name: currentUser.displayName||currentUser.email.split('@')[0], ts: Date.now(), text: text||'' };
  if(file){
    const path = `uploads/${activeChatId}/${Date.now()}_${file.name}`;
    const stRef = sref(storage, path);
    await uploadBytes(stRef, file);
    const url = await getDownloadURL(stRef);
    if(file.type.startsWith('image/')){ payload.type='image'; payload.url = url; payload.fileName = file.name; } else { payload.type='file'; payload.url = url; payload.fileName = file.name; }
    document.getElementById('fileInput').value = '';
  }
  await addDoc(collection(db, 'chats', activeChatId, 'messages'), payload);
  // update last on members' userChats
  const chatSnap = await getDoc(doc(db, 'chats', activeChatId));
  const members = chatSnap.exists() ? Object.keys(chatSnap.data().meta.members||{}) : [];
  for(const u of members){ await setDoc(doc(db,'userChats',u,'chats',activeChatId), { name: chatSnap.data().meta.name||'', last: payload.text || (payload.fileName||'attachment') }); }
  $('messageInput').value = '';
});

// file attach button
$('fileBtn').addEventListener('click', ()=> document.getElementById('fileInput').click());
$('attachBtn').addEventListener('click', ()=> document.getElementById('attachFile').click());
document.getElementById('attachFile').addEventListener('change', async (e)=>{
  const f = e.target.files[0]; if(!f || !activeChatId) return alert('Open chat then attach');
  // upload and send as message
  const path = `uploads/${activeChatId}/${Date.now()}_${f.name}`;
  const refS = sref(storage, path); await uploadBytes(refS, f); const url = await getDownloadURL(refS);
  const payload = { uid: currentUser.uid, name: currentUser.displayName||currentUser.email.split('@')[0], ts: Date.now(), type: f.type.startsWith('image/') ? 'image' : 'file', url, fileName: f.name };
  await addDoc(collection(db, 'chats', activeChatId, 'messages'), payload);
});

// logout
$('logout').addEventListener('click', async ()=>{ await signOut(auth); location.href='auth.html'; });
