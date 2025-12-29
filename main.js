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

// Порядок валют: Black, White, Blue, Red, Green
const COIN_ORDER = ['blackcoins', 'whitecoins', 'bluecoins', 'redcoins', 'greencoins'];

// 1. ПОЛУЧЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ
onAuthStateChanged(auth, async (user) => {
    if (!user) { 
        window.location.href = 'login.html'; 
        return; 
    }

    const q = query(collection(db, "users"), where("uid", "==", user.uid));
    const snap = await getDocs(q);
    
    if (!snap.empty) {
        onSnapshot(snap.docs[0].ref, (doc) => {
            const d = doc.data();
            document.getElementById('view-nick').innerText = d.nickname;
            document.getElementById('view-id').innerText = d.id;
            document.getElementById('view-javs').innerText = Math.floor(d.javs);
            
            // Обновляем сетку монет
            COIN_ORDER.forEach(id => {
                const shortId = id.replace('coins', '');
                const el = document.getElementById(`v-${shortId}`);
                if (el) el.innerText = d[id] || 0;
            });
        });
    }
});

// 2. ОТОБРАЖЕНИЕ РЫНКА (СЛАЙДЕРЫ И КНОПКИ)
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
                <input type="range" class="coin-slider" id="sl-${id}" 
                    min="1" max="${available > 0 ? Math.min(available, 100) : 1}" value="1" 
                    oninput="document.getElementById('val-${id}').innerText = this.value">
                <span class="slider-val" id="val-${id}">1</span>
            </div>

            <div class="trade-btns">
                <button class="btn-buy-coin" onclick="trade('${id}', 'buy')" ${available <= 0 ? 'disabled' : ''}>КУПИТЬ</button>
                <button class="btn-sell-coin" onclick="trade('${id}', 'sell')">ПРОДАТЬ</button>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-top: 8px;">
                <small style="color: #444; font-size: 9px;">LIMIT: ${coin.max}</small>
                <small style="color: #444; font-size: 9px;">LEFT: ${available}</small>
            </div>
        `;
        container.appendChild(card);
    });
});

// 3. ЛОГИКА ТОРГОВЛИ (БЕЗ АВТО-ИЗМЕНЕНИЯ ЦЕНЫ)
async function trade(coinId, type) {
    const myId = document.getElementById('view-id').innerText;
    const amount = parseInt(document.getElementById(`sl-${coinId}`).value);
    
    if (myId === "00000" || isNaN(amount) || amount <= 0) return;

    const userRef = doc(db, "users", myId);
    const coinRef = doc(db, "currencies", coinId);

    try {
        await runTransaction(db, async (t) => {
            const uS = await t.get(userRef);
            const cS = await t.get(coinRef);
            
            if (!uS.exists() || !cS.exists()) throw "Ошибка данных!";

            const u = uS.data();
            const c = cS.data();
            const totalCost = c.cost * amount;

            if (type === 'buy') {
                if (c.total + amount > c.max) throw "Недостаточно монет на рынке!";
                if (u.javs < totalCost) throw "Недостаточно JAVS!";

                t.update(userRef, { 
                    javs: u.javs - totalCost, 
                    [coinId]: (u[coinId] || 0) + amount 
                });
                t.update(coinRef, { 
                    total: c.total + amount 
                    // cost НЕ меняем, он остается статичным
                });
            } else {
                if (!u[coinId] || u[coinId] < amount) throw "У вас нет столько монет!";

                t.update(userRef, { 
                    javs: u.javs + totalCost, 
                    [coinId]: u[coinId] - amount 
                });
                t.update(coinRef, { 
                    total: c.total - amount 
                    // cost НЕ меняем
                });
            }
        });
        console.log(`Успешно: ${type} ${amount} ${coinId}`);
    } catch (e) {
        alert("Ошибка сделки: " + e);
    }
}
window.trade = trade;

// 4. ТРАНСФЕР JAVS
document.getElementById('btn-transfer').onclick = async () => {
    const tid = document.getElementById('send-to-id').value.trim();
    const amt = parseFloat(document.getElementById('send-amount').value);
    const mid = document.getElementById('view-id').innerText;

    if (!tid || isNaN(amt) || amt <= 0 || tid === mid) return alert("Неверные данные перевода");

    try {
        await runTransaction(db, async (t) => {
            const mR = doc(db, "users", mid);
            const tR = doc(db, "users", tid);
            const mS = await t.get(mR);
            const tS = await t.get(tR);

            if (!tS.exists()) throw "Получатель не найден!";
            if (mS.data().javs < amt) throw "Недостаточно JAVS!";

            t.update(mR, { javs: mS.data().javs - amt });
            t.update(tR, { javs: (tS.data().javs || 0) + amt });
        });
        alert("Перевод выполнен!");
        document.getElementById('send-amount').value = '';
    } catch (e) {
        alert(e);
    }
};

// 5. ВЫХОД
document.getElementById('btn-logout').onclick = () => {
    signOut(auth).then(() => window.location.href = 'login.html');
};
