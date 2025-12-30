import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, query, where, getDocs, getDoc, runTransaction, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

const COIN_ORDER = ['blackcoins', 'whitecoins', 'bluecoins', 'redcoins', 'greencoins'];

// --- 1. ГЛАВНЫЙ СЛУШАТЕЛЬ (АВТОРИЗАЦИЯ + БАНЫ + ДАННЫЕ) ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'login.html'; return; }

    try {
        // Проверка IP
        const ipRes = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipRes.json();
        const currentIP = ipData.ip;

        // Получаем списки банов
        const banIdSnap = await getDoc(doc(db, "banned", "by_id"));
        const banIpSnap = await getDoc(doc(db, "banned", "by_ip"));
        const bannedIds = banIdSnap.data() || {};
        const bannedIps = banIpSnap.data() || {};

        // Проверка бана по IP сразу
        if (bannedIps[currentIP]) {
            alert(`ДОСТУП ЗАПРЕЩЕН!\nВаш IP заблокирован: ${bannedIps[currentIP]}`);
            await signOut(auth);
            window.location.href = 'login.html';
            return;
        }

        const q = query(collection(db, "users"), where("uid", "==", user.uid));
        const snap = await getDocs(q);

        if (!snap.empty) {
            const userRef = snap.docs[0].ref;
            const userData = snap.docs[0].data();
            const myId = userData.id;

            // Проверка бана по ID
            if (bannedIds[myId]) {
                alert(`ВАШ АККАУНТ ЗАБЛОКИРОВАН!\nПричина: ${bannedIds[myId]}`);
                await signOut(auth);
                window.location.href = 'login.html';
                return;
            }

            // Слушаем изменения баланса в реальном времени
            onSnapshot(userRef, (doc) => {
                const d = doc.data();
                document.getElementById('view-nick').innerText = d.nickname;
                document.getElementById('view-id').innerText = d.id;
                document.getElementById('view-javs').innerText = Math.floor(d.javs);
                COIN_ORDER.forEach(id => {
                    const shortId = id.replace('coins', '');
                    const el = document.getElementById(`v-${shortId}`);
                    if (el) el.innerText = d[id] || 0;
                });
            });
        }
    } catch (e) { console.error("Критическая ошибка:", e); }
});

// --- 2. РЫНОК (ОТРИСОВКА) ---
onSnapshot(collection(db, "currencies"), (snap) => {
    const container = document.getElementById('market-container');
    const dataMap = {};
    snap.forEach(d => dataMap[d.id] = d.data());
    container.innerHTML = ''; 

    COIN_ORDER.forEach(id => {
        const coin = dataMap[id];
        if (!coin) return;
        const available = coin.max - coin.total;
        const colorClass = `c-${id.replace('coins', '')}`;

        const card = document.createElement('div');
        card.className = 'coin-card';
        card.innerHTML = `
            <div class="coin-header">
                <b class="${colorClass}">${id.toUpperCase()}</b>
                <span style="font-size: 14px; color: #4CAF50;">${coin.cost} J</span>
            </div>
            <div class="slider-container">
                <input type="range" class="coin-slider" id="sl-${id}" min="1" max="${available > 0 ? Math.min(available, 100) : 1}" value="1" oninput="document.getElementById('val-${id}').innerText = this.value">
                <span class="slider-val" id="val-${id}">1</span>
            </div>
            <div class="trade-btns">
                <button class="btn-buy-coin" onclick="trade('${id}', 'buy')" ${available <= 0 ? 'disabled' : ''}>КУПИТЬ</button>
                <button class="btn-sell-coin" onclick="trade('${id}', 'sell')">ПРОДАТЬ</button>
            </div>
            <small style="color: #444; font-size: 9px; margin-top: 5px; display: block;">ДОСТУПНО: ${available}</small>
        `;
        container.appendChild(card);
    });
});

// --- 3. ТОРГОВЛЯ ---
async function trade(coinId, type) {
    const myId = document.getElementById('view-id').innerText;
    const amount = parseInt(document.getElementById(`sl-${coinId}`).value);
    if (myId === "00000" || isNaN(amount)) return;

    const userRef = doc(db, "users", myId);
    const coinRef = doc(db, "currencies", coinId);

    try {
        await runTransaction(db, async (t) => {
            const uS = await t.get(userRef);
            const cS = await t.get(coinRef);
            const u = uS.data();
            const c = cS.data();
            const totalCost = c.cost * amount;

            if (type === 'buy') {
                if (c.total + amount > c.max) throw "Лимит рынка исчерпан!";
                if (u.javs < totalCost) throw "Недостаточно JAVS!";
                t.update(userRef, { javs: u.javs - totalCost, [coinId]: (u[coinId] || 0) + amount });
                t.update(coinRef, { total: c.total + amount });
            } else {
                if (!u[coinId] || u[coinId] < amount) throw "Недостаточно монет!";
                t.update(userRef, { javs: u.javs + totalCost, [coinId]: u[coinId] - amount });
                t.update(coinRef, { total: c.total - amount });
            }
        });
    } catch (e) { alert(e); }
}
window.trade = trade;

// --- 4. ПЕРЕВОДЫ ---
document.getElementById('btn-transfer').onclick = async () => {
    const tid = document.getElementById('send-to-id').value.trim();
    const amt = parseFloat(document.getElementById('send-amount').value);
    const type = document.getElementById('transfer-type').value; 
    const mid = document.getElementById('view-id').innerText;

    if (!tid || isNaN(amt) || amt <= 0 || tid === mid) return alert("Ошибка ввода");

    try {
        await runTransaction(db, async (t) => {
            const mR = doc(db, "users", mid);
            const tR = doc(db, "users", tid);
            const mS = await t.get(mR);
            const tS = await t.get(tR);

            if (!tS.exists()) throw "Получатель не найден!";
            const bal = mS.data()[type] || 0;
            if (bal < amt) throw "Недостаточно средств!";

            t.update(mR, { [type]: bal - amt });
            t.update(tR, { [type]: (tS.data()[type] || 0) + amt });
        });
        alert("Перевод выполнен!");
    } catch (e) { alert(e); }
};

// --- 5. ПРОМОКОДЫ ---
const pModal = document.getElementById('promo-modal');
document.getElementById('open-promo').onclick = () => pModal.style.display = 'flex';
document.getElementById('close-promo').onclick = () => pModal.style.display = 'none';

document.getElementById('btn-promo').onclick = async () => {
    const code = document.getElementById('promo-input').value.trim().toUpperCase();
    const myId = document.getElementById('view-id').innerText;
    if (!code) return;

    try {
        const promoRef = doc(db, "promo", code);
        const userRef = doc(db, "users", myId);

        await runTransaction(db, async (t) => {
            const pS = await t.get(promoRef);
            const uS = await t.get(userRef);

            if (!pS.exists()) throw "Код не существует!";
            const p = pS.data();
            if (!p.is_active) throw "Код неактивен!";
            if (p.used_by && p.used_by.includes(myId)) throw "Вы уже активировали этот код!";

            const u = uS.data();
            const updates = {};
            let rewardMsg = "Успех! Вы получили:";

            for (const key in p.awards) {
                updates[key] = (u[key] || 0) + p.awards[key];
                rewardMsg += `\n + ${p.awards[key]} ${key.toUpperCase()}`;
            }

            t.update(userRef, updates);
            t.update(promoRef, { used_by: [...(p.used_by || []), myId] });
            
            alert(rewardMsg);
        });
        pModal.style.display = 'none';
        document.getElementById('promo-input').value = '';
    } catch (e) { alert(e); }
};

// --- 6. ВЫХОД ---
document.getElementById('btn-logout').onclick = () => signOut(auth).then(() => window.location.href = 'login.html');
window.onclick = (e) => { if (e.target == pModal) pModal.style.display = 'none'; };