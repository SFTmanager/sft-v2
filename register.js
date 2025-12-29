import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

document.getElementById('btn-do-register').onclick = async () => {
    const nick = document.getElementById('reg-nick').value.trim();
    const pass = document.getElementById('reg-pass').value;
    const genId = Math.floor(10000 + Math.random() * 90000).toString();
    const email = `${nick.toLowerCase().replace(/[^a-z0-9]/g, "")}@sft.trade`;

    if (nick.length < 2 || pass.length < 6) return alert("Данные слишком короткие");

    try {
        const res = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, "users", genId), {
            nickname: nick,
            id: genId,
            javs: 100,
            uid: res.user.uid,
            blackcoins: 0, whitecoins: 0, greencoins: 0, redcoins: 0, bluecoins: 0
        });
        alert("Успех! Твой ID: " + genId);
        window.location.href = 'main.html';
    } catch (e) { alert("Этот ник уже занят или ошибка системы"); }
};