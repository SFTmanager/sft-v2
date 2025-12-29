import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, query, where, getDocs, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


const firebaseConfig = {
    apiKey: "AIzaSyCB6U9js8IMNaQm3cGpR9W-KfJTLVVS85A",
    authDomain: "sft-v2.firebaseapp.com",
    projectId: "sft-v2",
    storageBucket: "sft-v2.appspot.com",
    messagingSenderId: "246083377922",
    appId: "1:246083377922:web:0cba7bfdd8733f9f75401b"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

onAuthStateChanged(auth, async (user) => {
    if (!user) window.location.href = 'login.html';
    
    const q = query(collection(db, "users"), where("uid", "==", user.uid));
    const snap = await getDocs(q);
    
    if (!snap.empty) {
        onSnapshot(snap.docs[0].ref, (doc) => {
            const d = doc.data();
            document.getElementById('view-nick').innerText = d.nickname;
            document.getElementById('view-id').innerText = d.id;
            document.getElementById('view-javs').innerText = d.javs;
            document.getElementById('v-black').innerText = d.blackcoins;
            document.getElementById('v-white').innerText = d.whitecoins;
            document.getElementById('v-green').innerText = d.greencoins;
            document.getElementById('v-red').innerText = d.redcoins;
            document.getElementById('v-blue').innerText = d.bluecoins;
        });
    }
});

// Логика трансфера (скопируй из прошлого script.js с заменой переменных на нужные ID)
document.getElementById('btn-transfer').onclick = async () => { /* Код транзакции */ };
document.getElementById('btn-logout').onclick = () => signOut(auth);