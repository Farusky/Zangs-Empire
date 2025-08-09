// app.js - Firebase based auth + realtime chat
import { firebaseConfig } from './firebase-config.js';

// Import Firebase modular SDK from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// helper to show messages
function showMessage(el, text, success=true){
  el.textContent = text;
  el.style.color = success ? '' : '#ffb3b3';
  setTimeout(()=>el.textContent='',5000);
}

/* ----------------- Register Page ----------------- */
export function initRegisterPage(){
  const form = document.getElementById('registerForm');
  const msg = document.getElementById('message');
  const toggle = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('password');

  toggle.addEventListener('click', ()=> {
    const t = passwordInput;
    t.type = t.type === 'password' ? 'text' : 'password';
    toggle.textContent = t.type === 'password' ? '👁' : '🙈';
  });

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = passwordInput.value;
    try{
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      // set display name
      await updateProfile(userCred.user, { displayName: name });
      showMessage(msg, 'Registered successfully! Redirecting to chat...');
      setTimeout(()=> location.href = 'chat.html', 1200);
    }catch(err){
      showMessage(msg, err.message, false);
    }
  });
}

/* ----------------- Login Page ----------------- */
export function initLoginPage(){
  const form = document.getElementById('loginForm');
  const msg = document.getElementById('message');
  const toggle = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('password');

  toggle.addEventListener('click', ()=> {
    const t = passwordInput;
    t.type = t.type === 'password' ? 'text' : 'password';
    toggle.textContent = t.type === 'password' ? '👁' : '🙈';
  });

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = passwordInput.value;
    try{
      await signInWithEmailAndPassword(auth, email, password);
      showMessage(msg, 'Login successful! Redirecting...');
      setTimeout(()=> location.href = 'chat.html', 800);
    }catch(err){
      showMessage(msg, err.message, false);
    }
  });
}

/* ----------------- Forgot Page ----------------- */
export function initForgotPage(){
  const form = document.getElementById('forgotForm');
  const msg = document.getElementById('message');
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    try{
      await sendPasswordResetEmail(auth, email);
      showMessage(msg, 'Password reset email sent. Check your inbox.');
    }catch(err){
      showMessage(msg, err.message, false);
    }
  });
}

/* ----------------- Chat Page ----------------- */
export function initChatPage(){
  const messagesEl = document.getElementById('messages');
  const form = document.getElementById('messageForm');
  const input = document.getElementById('messageInput');
  const logoutBtn = document.getElementById('logoutBtn');
  const userNameEl = document.getElementById('userName');

  // require login
  onAuthStateChanged(auth, user => {
    if(!user){
      location.href = 'login.html';
      return;
    }
    const displayName = user.displayName || user.email.split('@')[0];
    userNameEl.textContent = displayName;
    // load existing messages
    const messagesRef = ref(db, 'messages/');
    onChildAdded(messagesRef, (snap) => {
      const m = snap.val();
      addMessageToList(m, user.uid);
    });
  });

  logoutBtn.addEventListener('click', async ()=> {
    await signOut(auth);
    location.href = 'login.html';
  });

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const text = input.value.trim();
    if(!text) return;
    const user = auth.currentUser;
    if(!user) return alert('Not signed in');
    const payload = {
      uid: user.uid,
      name: user.displayName || user.email.split('@')[0],
      text,
      ts: Date.now()
    };
    try{
      await push(ref(db, 'messages/'), payload);
      input.value = '';
    }catch(err){
      alert(err.message);
    }
  });

  function addMessageToList(m, myUid){
    const div = document.createElement('div');
    div.className = 'message ' + (m.uid === myUid ? 'me' : 'other');
    div.innerHTML = '<div class="message-text">'+escapeHtml(m.text)+'</div><div class="message-meta">' + (m.name ? escapeHtml(m.name) + ' • ' : '') + timeString(m.ts) + '</div>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function timeString(ts){
    if(!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString();
  }

  function escapeHtml(str){
    return (str || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  }
}
