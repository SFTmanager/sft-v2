import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    onSnapshot, 
    collection, 
    query, 
    where, 
    getDocs, 
    getDoc, 
    runTransaction, 
    updateDoc, 
    addDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- КОНФИГУРАЦИЯ ---
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

// --- УНИВЕРСАЛЬНАЯ ФУНКЦИЯ ЛОГА ---
async function logAction(userId, type, message) {
    try {
        await addDoc(collection(db, "config", "log", "entries"), {
            userId: userId,
            type: type,
            msg: message,
            time: serverTimestamp()
        });
    } catch (e) { console.error("Ошибка записи лога:", e); }
}

// --- ПРОВЕРКА АВТОРИЗАЦИИ И БАНОВ ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { 
        window.location.href = 'login.html'; 
        return; 
    }

    try {
        // 1. Получаем IP для проверки
        const ipRes = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipRes.json();
        const currentIP = ipData.ip;

        // 2. Проверяем бан по IP
        const banIpSnap = await getDoc(doc(db, "banned", "by_ip"));
        const bannedIps = banIpSnap.data() || {};

        if (bannedIps[currentIP]) {
            alert(`ДОСТУП ЗАПРЕЩЕН!\nВаш IP (${currentIP}) заблокирован.`);
            await signOut(auth);
            window.location.href = 'login.html';
            return;
        }

        // 3. Получаем данные пользователя
        const q = query(collection(db, "users"), where("uid", "==", user.uid));
        const snap = await getDocs(q);

        if (!snap.empty) {
            const userRef = snap.docs[0].ref;
            const userData = snap.docs[0].data();
            const myId = userData.id;

            // 4. Проверяем бан по ID
            const banIdSnap = await getDoc(doc(db, "banned", "by_id"));
            const bannedIds = banIdSnap.data() || {};

            if (bannedIds[myId]) {
                alert(`ВАШ АККАУНТ (${myId}) ЗАБЛОКИРОВАН!`);
                await signOut(auth);
                window.location.href = 'login.html';
                return;
            }

            // 5. Слушаем изменения данных (Баланс, Ник и т.д.)
            onSnapshot(userRef, (doc) => {
                const d = doc.data();
                if (!d) return;

                const nickEl = document.getElementById('view-nick');
                const idEl = document.getElementById('view-id');
                const javsEl = document.getElementById('view-javs');

                if (nickEl) nickEl.innerText = d.nickname;
                if (idEl) idEl.innerText = d.id;
                if (javsEl) javsEl.innerText = Math.floor(d.javs);

                COIN_ORDER.forEach(id => {
                    const shortId = id.replace('coins', '');
                    const el = document.getElementById(`v-${shortId}`);
                    if (el) el.innerText = d[id] || 0;
                });
            }, (err) => console.error("Ошибка Snapshot юзера:", err));

        } else {
            console.error("Документ пользователя не найден в Firestore.");
        }
    } catch (e) { 
        console.error("Критическая ошибка инициализации:", e); 
    }
});

// --- РЫНОК (ОТОБРАЖЕНИЕ) ---
onSnapshot(collection(db, "currencies"), (snap) => {
    const container = document.getElementById('market-container');
    if (!container) return;

    const dataMap = {};
    snap.forEach(d => dataMap[d.id] = d.data());
    container.innerHTML = ''; 

    COIN_ORDER.forEach(id => {
        const coin = dataMap[id];
        if (!coin) return;
        
        const available = coin.max - (coin.total || 0);
        const shortName = id.replace('coins', '');
        
        const card = document.createElement('div');
        card.className = 'coin-card';
        card.innerHTML = `
            <div class="coin-header">
                <b class="c-${shortName}">${id.toUpperCase()}</b>
                <span style="font-size: 14px; color: #4CAF50;">${coin.cost} J</span>
            </div>
            <div class="slider-container">
                <input type="range" class="coin-slider" id="sl-${id}" 
                    min="1" max="${available > 0 ? Math.min(available, 100) : 1}" 
                    value="1" oninput="document.getElementById('val-${id}').innerText = this.value">
                <span class="slider-val" id="val-${id}">1</span>
            </div>
            <div class="trade-btns">
                <button class="btn-buy-coin" onclick="trade('${id}', 'buy')" ${available <= 0 ? 'disabled' : ''}>КУПИТЬ</button>
                <button class="btn-sell-coin" onclick="trade('${id}', 'sell')">ПРОДАТЬ</button>
            </div>
        `;
        container.appendChild(card);
    });
}, (err) => console.error("Ошибка Snapshot рынка:", err));

// --- ТОРГОВЛЯ ---
async function trade(coinId, type) {
    const myId = document.getElementById('view-id').innerText;
    const slider = document.getElementById(`sl-${coinId}`);
    const amount = parseInt(slider ? slider.value : 0);

    if (myId === "00000" || isNaN(amount) || amount <= 0) return;

    try {
        await runTransaction(db, async (t) => {
            const userRef = doc(db, "users", myId);
            const coinRef = doc(db, "currencies", coinId);
            
            const uS = await t.get(userRef);
            const cS = await t.get(coinRef);
            
            if (!uS.exists() || !cS.exists()) throw "Ошибка данных базы!";
            
            const u = uS.data();
            const c = cS.data();
            const totalCost = c.cost * amount;

            if (type === 'buy') {
                const availableOnMarket = c.max - (c.total || 0);
                if (availableOnMarket < amount) throw "На рынке нет столько монет!";
                if (u.javs < totalCost) throw "Недостаточно JAVS!";
                
                t.update(userRef, { 
                    javs: u.javs - totalCost, 
                    [coinId]: (u[coinId] || 0) + amount 
                });
                t.update(coinRef, { total: (c.total || 0) + amount });
            } else {
                if (!u[coinId] || u[coinId] < amount) throw "Недостаточно монет в кошельке!";
                
                t.update(userRef, { 
                    javs: u.javs + totalCost, 
                    [coinId]: u[coinId] - amount 
                });
                t.update(coinRef, { total: Math.max(0, (c.total || 0) - amount) });
            }
        });

        await logAction(myId, "MARKET", `${type === 'buy' ? 'Купил' : 'Продал'} ${amount} ${coinId}`);
    } catch (e) { 
        alert(e); 
        console.error("Ошибка транзакции:", e);
    }
}
window.trade = trade;

// --- ПЕРЕВОДЫ ---
const btnTransfer = document.getElementById('btn-transfer');
if (btnTransfer) {
    btnTransfer.onclick = async () => {
        const tid = document.getElementById('send-to-id').value.trim();
        const amt = parseFloat(document.getElementById('send-amount').value);
        const type = document.getElementById('transfer-type').value; 
        const mid = document.getElementById('view-id').innerText;

        if (!tid || isNaN(amt) || amt <= 0) return alert("Неверные данные перевода");
        if (tid === mid) return alert("Нельзя переводить самому себе");

        try {
            await runTransaction(db, async (t) => {
                const mR = doc(db, "users", mid);
                const queryReceiver = query(collection(db, "users"), where("id", "==", tid));
                const rSnap = await getDocs(queryReceiver);
                
                if (rSnap.empty) throw "Получатель с таким ID не найден!";
                const tR = rSnap.docs[0].ref;
                
                const mS = await t.get(mR);
                const tS = await t.get(tR);
                
                const myBal = mS.data()[type] || 0;
                if (myBal < amt) throw "Недостаточно средств для перевода!";

                t.update(mR, { [type]: myBal - amt });
                t.update(tR, { [type]: (tS.data()[type] || 0) + amt });
            });

            await logAction(mid, "TRANSFER", `Перевел ${amt} ${type} игроку ${tid}`);
            alert("Перевод выполнен!");
        } catch (e) { 
            alert(e); 
        }
    };
}

// --- ПРОМОКОДЫ ---
const pModal = document.getElementById('promo-modal');
const btnOpenPromo = document.getElementById('open-promo');
const btnClosePromo = document.getElementById('close-promo');
const btnSubmitPromo = document.getElementById('btn-promo');

if (btnOpenPromo) btnOpenPromo.onclick = () => pModal.style.display = 'flex';
if (btnClosePromo) btnClosePromo.onclick = () => pModal.style.display = 'none';

if (btnSubmitPromo) {
    btnSubmitPromo.onclick = async () => {
        const code = document.getElementById('promo-input').value.trim().toUpperCase();
        const myId = document.getElementById('view-id').innerText;
        
        if (!code) return;

        try {
            const promoRef = doc(db, "promo", code);
            await runTransaction(db, async (t) => {
                const pS = await t.get(promoRef);
                const userRef = doc(db, "users", myId);
                const uS = await t.get(userRef);

                if (!pS.exists()) throw "Код не существует!";
                const p = pS.data();
                
                if (p.used_by && p.used_by.includes(myId)) throw "Вы уже активировали этот код!";
                
                const updates = {};
                for (const key in p.awards) { 
                    updates[key] = (uS.data()[key] || 0) + p.awards[key]; 
                }
                
                t.update(userRef, updates);
                t.update(promoRef, { used_by: [...(p.used_by || []), myId] });
            });

            await logAction(myId, "PROMO", `Активировал код: ${code}`);
            alert("Промокод успешно активирован!");
            pModal.style.display = 'none';
        } catch (e) { 
            alert(e); 
        }
    };
}

// --- ВЫХОД ---
const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
    btnLogout.onclick = () => {
        signOut(auth).then(() => {
            window.location.href = 'login.html';
        });
    };
}