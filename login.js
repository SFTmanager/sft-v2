import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
// ИСПРАВЛЕНО: Добавлены addDoc, collection, serverTimestamp
import { getFirestore, doc, updateDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

async function logAction(userId, type, message) {
    try {
        await addDoc(collection(db, "config", "log", "entries"), {
            userId: userId,
            type: type,
            msg: message,
            time: serverTimestamp()
        });
    } catch (e) { console.error("Ошибка лога:", e); }
}

document.getElementById('btn-do-login').onclick = async () => {
    const nick = document.getElementById('login-nick').value.trim();
    const pass = document.getElementById('login-pass').value;
    const email = `${nick.toLowerCase().replace(/[^a-z0-9]/g, "")}@sft.trade`;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        const ipRes = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipRes.json();
        const currentIP = ipData.ip;

        const q = query(collection(db, "users"), where("uid", "==", user.uid));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
            const userDocRef = snap.docs[0].ref;
            const userData = snap.docs[0].data();
            // Обновляем IP
            await updateDoc(userDocRef, { lastIP: currentIP });
            // Логируем вход
            await logAction(userData.id, "LOGIN", `Вход выполнен. IP: ${currentIP}`);
        }

        window.location.href = 'main.html'; 
    } catch (e) { 
        console.error(e);
        alert("Ошибка входа: проверьте ник и пароль. Подробности в консоли."); 
    }
};