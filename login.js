import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

document.getElementById('btn-do-login').onclick = async () => {
    const nick = document.getElementById('login-nick').value.trim();
    const pass = document.getElementById('login-pass').value;
    const email = `${nick.toLowerCase().replace(/[^a-z0-9]/g, "")}@sft.trade`;

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        window.location.href = 'main.html'; // Переходим на главную
    } catch (e) { alert("Ошибка входа: проверьте ник и пароль"); }
};