import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getAuth, onAuthStateChanged, updateProfile, signOut } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { getStorage, ref as sref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js';
import { getFirestore, doc, updateDoc } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);
const db = getFirestore(app);

function $(id){return document.getElementById(id);}
function show(el, txt){ if(el) el.textContent = txt; }

onAuthStateChanged(auth, user => {
  if(!user) return location.href = 'auth.html';
  $('displayName').value = user.displayName || '';
});

if($('profileForm')){
  $('profileForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = $('displayName').value.trim();
    const file = $('profileImage').files[0];
    try{
      let photoURL = '';
      if(file){
        const ref = sref(storage, `avatars/${Date.now()}_${file.name}`);
        await uploadBytes(ref, file);
        photoURL = await getDownloadURL(ref);
      }
      await updateProfile(auth.currentUser, { displayName: name, photoURL: photoURL||auth.currentUser.photoURL||null });
      // update Firestore user doc
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { name, photoURL: photoURL||auth.currentUser.photoURL||'' });
      show($('profileMsg'), 'Profile updated. Redirecting to chat...');
      setTimeout(()=> location.href = 'chat.html', 800);
    }catch(err){ console.error(err); show($('profileMsg'), err.message); }
  });
}

if($('logoutBtn')) $('logoutBtn').addEventListener('click', async ()=>{ await signOut(auth); location.href='auth.html'; });
