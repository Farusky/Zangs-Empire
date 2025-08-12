import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { 
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
  sendPasswordResetEmail, updateProfile 
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { 
  getFirestore, doc, setDoc 
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';
import { 
  getStorage, ref as sref, uploadBytes, getDownloadURL 
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

function $(id) { return document.getElementById(id); }
function show(el, txt) { if (el) el.textContent = txt; }

// Password eye toggle
if ($('loginEye')) $('loginEye').onclick = () => { 
  const t = $('loginPassword'); 
  t.type = t.type === 'password' ? 'text' : 'password'; 
  $('loginEye').textContent = t.type === 'password' ? '👁' : '🙈'; 
};
if ($('signupEye')) $('signupEye').onclick = () => { 
  const t = $('signupPassword'); 
  t.type = t.type === 'password' ? 'text' : 'password'; 
  $('signupEye').textContent = t.type === 'password' ? '👁' : '🙈'; 
};

// Sign up
if ($('signupForm')) {
  $('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('signupName').value.trim();
    const email = $('signupEmail').value.trim();
    const pw = $('signupPassword').value;
    const photo = $('signupPhoto').files[0];
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pw);
      let photoURL = '';
      if (photo) {
        const ref = sref(storage, `avatars/${cred.user.uid}_${photo.name}`);
        await uploadBytes(ref, photo);
        photoURL = await getDownloadURL(ref);
      }
      await updateProfile(cred.user, { displayName: name, photoURL: photoURL || null });

      // Save to Firestore for search/chat list
      await setDoc(doc(db, 'users', cred.user.uid), { 
        uid: cred.user.uid,
        name,
        email,
        photoURL: photoURL || '',
        createdAt: Date.now()
      });

      show($('signupMsg'), 'Account created. Redirecting...');
      setTimeout(() => location.href = 'profile.html', 900);
    } catch (err) {
      console.error(err);
      show($('signupMsg'), err.message);
    }
  });
}

// Login
if ($('loginForm')) {
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('loginEmail').value.trim();
    const pw = $('loginPassword').value;
    try {
      await signInWithEmailAndPassword(auth, email, pw);
      show($('loginMsg'), 'Logged in. Redirecting...');
      setTimeout(() => location.href = 'chat.html', 700);
    } catch (err) {
      console.error(err);
      show($('loginMsg'), err.message);
    }
  });
}

// Forgot password
if ($('forgotForm')) {
  $('forgotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('forgotEmail').value.trim();
    try { 
      await sendPasswordResetEmail(auth, email); 
      show($('forgotMsg'), 'Reset email sent.'); 
    } catch (err) { 
      console.error(err); 
      show($('forgotMsg'), err.message); 
    }
  });
      }
