import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, query, where, getDocs, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

function showScreen(screenId) {
    document.getElementById('screen-login').classList.add('hidden');
    document.getElementById('screen-register').classList.add('hidden');
    document.getElementById('screen-main').classList.add('hidden');
    document.getElementById(screenId).classList.remove('hidden');
}

function prepareEmail(nick) {
    const clean = nick.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    return `${clean}@sft.trade`;
}

document.getElementById('go-to-reg').onclick = () => showScreen('screen-register');
document.getElementById('go-to-login').onclick = () => showScreen('screen-login');
document.getElementById('btn-logout').onclick = () => signOut(auth).then(() => location.reload());

// РЕГИСТРАЦИЯ (Исправлено на *coins)
document.getElementById('btn-do-register').onclick = async () => {
    const nick = document.getElementById('reg-nick').value.trim();
    const pass = document.getElementById('reg-pass').value;
    if (nick.length < 2 || pass.length < 6) return alert("Мало данных!");

    const email = prepareEmail(nick);
    const generatedId = Math.floor(10000 + Math.random() * 90000).toString();

    try {
        const res = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, "users", generatedId), {
            nickname: nick,
            id: generatedId,
            javs: 100,
            uid: res.user.uid,
            blackcoins: 0,
            whitecoins: 0,
            greencoins: 0,
            redcoins: 0,
            bluecoins: 0
        });
        alert("ID: " + generatedId);
    } catch (e) { alert("Ошибка регистрации"); }
};

// ВХОД
document.getElementById('btn-do-login').onclick = async () => {
    const nick = document.getElementById('login-nick').value.trim();
    const pass = document.getElementById('login-pass').value;
    try {
        await signInWithEmailAndPassword(auth, prepareEmail(nick), pass);
    } catch (e) { alert("Ошибка входа"); }
};

// ТРАНСФЕР JAVS
document.getElementById('btn-transfer').onclick = async () => {
    const targetId = document.getElementById('send-to-id').value.trim();
    const amount = parseFloat(document.getElementById('send-amount').value);
    const myId = document.getElementById('view-id').innerText;

    if (!targetId || isNaN(amount) || amount <= 0) return alert("Ошибка ввода!");
    if (targetId === myId) return alert("Нельзя самому себе!");

    try {
        const targetRef = doc(db, "users", targetId);
        const myRef = doc(db, "users", myId);

        await runTransaction(db, async (transaction) => {
            const mySnap = await transaction.get(myRef);
            const targetSnap = await transaction.get(targetRef);

            if (!targetSnap.exists()) throw "ID не найден!";
            const myJavs = mySnap.data().javs || 0;
            if (myJavs < amount) throw "Недостаточно JAVS!";

            transaction.update(myRef, { javs: myJavs - amount });
            transaction.update(targetRef, { javs: (targetSnap.data().javs || 0) + amount });
        });
        alert("Переведено!");
        document.getElementById('send-amount').value = "";
    } catch (e) { alert(e); }
};

// ОБНОВЛЕНИЕ ДАННЫХ (Исправлено чтение *coins)
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const q = query(collection(db, "users"), where("uid", "==", user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
            showScreen('screen-main');
            onSnapshot(snap.docs[0].ref, (doc) => {
                if (doc.exists()) {
                    const d = doc.data();
                    document.getElementById('view-nick').innerText = d.nickname;
                    document.getElementById('view-id').innerText = d.id;
                    document.getElementById('view-javs').innerText = d.javs || 0;
                    document.getElementById('v-black').innerText = d.blackcoins || 0;
                    document.getElementById('v-white').innerText = d.whitecoins || 0;
                    document.getElementById('v-green').innerText = d.greencoins || 0;
                    document.getElementById('v-red').innerText = d.redcoins || 0;
                    document.getElementById('v-blue').innerText = d.bluecoins || 0;
                }
            });
        }
    } else { showScreen('screen-login'); }
});