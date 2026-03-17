import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

// Берем только то, что нужно для входа и выхода
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Берем всё для работы с базой данных
import { 
    getFirestore, 
    doc, 
    onSnapshot, 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    getDocs, 
    getDoc, 
    runTransaction, 
    updateDoc, 
    addDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- КОНФИГУРАЦИЯ ---
// ... далее твой код без изменений
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
async function logAction(userId, type, message, path) {
    try {
        await addDoc(collection(db, "config", "log", path), {
            userId: userId,
            type: type,
            msg: message,
            time: serverTimestamp()
        });
    } catch (e) { console.error("❗Ошибка записи лога:", e); }
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
            alert(`❗ДОСТУП ЗАПРЕЩЕН!\nВаш IP (${currentIP}) заблокирован.`);
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
                alert(`❗ВАШ АККАУНТ (${myId}) ЗАБЛОКИРОВАН!`);
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
            }, (err) => console.error("❗Ошибка Snapshot юзера:", err));
            initLeaderboard();
        } else {
            console.error("❗Документ пользователя не найден в Firestore.");
        }
    } catch (e) { 
        console.error("❗Критическая ошибка инициализации:", e); 
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
        
        const total = coin.total || 0;
        const max = coin.max || 0;
        const available = max - total;
        const shortName = id.replace('coins', '');
        console.log(shortName)
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

            <div style="display: flex; justify-content: space-between; padding: 0 10px; margin-bottom: 10px; font-size: 11px; font-family: monospace;">
                <span style="color: #444444;">СУММАРНО: <b style="color: #eee;">${total}</b></span>
                <span style="color: #444444;">МАКС: <b style="color: #eee;">${max}</b></span>
            </div>

            <div class="trade-btns">
                <button class="btn-buy-coin" onclick="trade('${id}', 'buy')" ${available <= 0 ? 'disabled' : ''}>📈КУПИТЬ</button>
                <button class="btn-sell-coin" onclick="trade('${id}', 'sell')">📉ПРОДАТЬ</button>
            </div>
        `;
        container.appendChild(card);
    });
}, (err) => console.error("❗Ошибка Snapshot рынка:", err));
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
            
            if (!uS.exists() || !cS.exists()) throw "❗Ошибка данных базы!";
            
            const u = uS.data();
            const c = cS.data();
            const totalCost = c.cost * amount;

            if (type === 'buy') {
                const availableOnMarket = c.max - (c.total || 0);
                if (availableOnMarket < amount) throw "❗На рынке нет столько монет!";
                if (u.javs < totalCost) throw "❗Недостаточно JAVS!";
                
                t.update(userRef, { 
                    javs: u.javs - totalCost, 
                    [coinId]: (u[coinId] || 0) + amount 
                });
                t.update(coinRef, { total: (c.total || 0) + amount });
            } else {
                if (!u[coinId] || u[coinId] < amount) throw "❗Недостаточно монет в кошельке!";
                
                t.update(userRef, { 
                    javs: u.javs + totalCost, 
                    [coinId]: u[coinId] - amount 
                });
                t.update(coinRef, { total: Math.max(0, (c.total || 0) - amount) });
            }
        });

        await logAction(myId, "MARKET", `${type === 'buy' ? 'Купил' : 'Продал'} ${amount} ${coinId}`, "shop");
    } catch (e) { 
        alert(e); 
        console.error("❗Ошибка транзакции:", e);
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

        if (!tid || isNaN(amt) || amt <= 0) return alert("❗Неверные данные перевода");
        if (tid === mid) return alert("❗Нельзя переводить самому себе");

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
                if (myBal < amt) throw "❗Недостаточно средств для перевода!";

                t.update(mR, { [type]: myBal - amt });
                t.update(tR, { [type]: (tS.data()[type] || 0) + amt });
            });

            await logAction(mid, "TRANSFER", `Перевел ${amt} ${type} игроку ${tid}`, "TRANSFER");
            alert("✅Перевод выполнен!");
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
            let awardsSummary = ""; // Переменная для хранения текста наград

            await runTransaction(db, async (t) => {
                const pS = await t.get(promoRef);
                const userRef = doc(db, "users", myId);
                const uS = await t.get(userRef);

                if (!pS.exists()) throw "❗Код не существует!";
                const p = pS.data();
                
                if (p.used_by && p.used_by.includes(myId)) throw "❗Вы уже активировали этот код!";
                
                const updates = {};
                const awardsArray = []; // Массив для красивого текста

                for (const key in p.awards) { 
                    const amount = p.awards[key];
                    updates[key] = (uS.data()[key] || 0) + amount; 
                    awardsArray.push(`${amount} ${key}`); // Собираем "500 javs", "10 blackcoins" и т.д.
                }
                
                awardsSummary = awardsArray.join(", "); // Соединяем через запятую

                t.update(userRef, updates);
                t.update(promoRef, { used_by: [...(p.used_by || []), myId] });
            });

            await logAction(myId, "PROMO", `Активировал код: ${code}. Награды: ${awardsSummary}`, "PROMOS");
            
            // Выводим уведомление с перечислением наград
            alert(`🎁Промокод успешно активирован! Награды: ${awardsSummary}`);
            
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

// Функция для отображения таблицы лидеров
function initLeaderboard() {
    const leaderboardList = document.getElementById('leaderboard-list');
    if (!leaderboardList) return;

    // Берем чуть больше людей (например, 30), чтобы было из чего сортировать при равных балансах
    const q = query(
        collection(db, "users"), 
        orderBy("javs", "desc"), 
        limit(5) 
    );

    onSnapshot(q, (snap) => {
        let users = [];
        snap.forEach(doc => {
            users.push(doc.data());
        });

        // РУЧНАЯ СОРТИРОВКА
        users.sort((a, b) => {
            // 1. Сначала по JAVS (от большего к меньшему)
            if (b.javs !== a.javs) {
                return b.javs - a.javs;
            }
            // 2. Если JAVS равны, по ID (от меньшего к большему)
            return a.id - b.id;
        });

        // Оставляем только топ-10 после нашей сортировки
        const top10 = users.slice(0, 10);

        leaderboardList.innerHTML = '';
        let rank = 1;

        top10.forEach(d => {
            const item = document.createElement('div');
            item.className = 'leader-item';
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
            
            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 5px 0;">
                    <span>
                        <span style="font-size: 18px; margin-right: 10px;">${medal}</span>
                        <b>${d.nickname}</b> 
                        <small style="color: #555; margin-left: 5px;">#${d.id}</small>
                    </span>
                    <b style="color: #4CAF50;">${Math.floor(d.javs)} J</b>
                </div>
            `;
            leaderboardList.appendChild(item);
            rank++;
        });
    });
}



// --- ЛОГИКА ПОИСКА ИГРОКА ---
const sModal = document.getElementById('search-modal');
const btnOpenSearch = document.getElementById('open-search');
const btnCloseSearch = document.getElementById('close-search');
const btnDoSearch = document.getElementById('btn-do-search');
const searchResult = document.getElementById('search-result');

// Открытие/Закрытие
if (btnOpenSearch) btnOpenSearch.onclick = () => sModal.style.display = 'flex';
if (btnCloseSearch) {
    btnCloseSearch.onclick = () => {
        sModal.style.display = 'none';
        searchResult.innerHTML = ''; // Очистка результата при закрытии
    };
}

// Сама функция поиска
if (btnDoSearch) {
    btnDoSearch.onclick = async () => {
        const sid = document.getElementById('search-id-input').value.trim();
        
        if (!sid) return alert("🧿Введите ID для поиска");

        searchResult.innerHTML = "<p style='color: #888; text-align: center;'>Запрос к базе данных...</p>";

        try {
            // Ищем документ в коллекции users, где ID документа — это наш номер
            const userRef = doc(db, "users", sid);
            const snap = await getDoc(userRef);

            if (snap.exists()) {
                const d = snap.data();
                // Формируем красивую карточку результата
                searchResult.innerHTML = `
                    <div style="background: #1a1a1a; padding: 15px; border-radius: 12px; border: 1px solid #333; animation: fadeIn 0.3s;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <b style="color: #2196f3; font-size: 18px;">🪪${d.nickname}</b>
                            <span style="color: #555; font-size: 12px;">🪪 #${sid}</span>
                        </div>
                        <hr style="border: 0; border-top: 1px solid #222; margin: 10px 0;">
                        <p style="margin: 5px 0; color: #4CAF50;"><b>Баланс:</b> 🔹${Math.floor(d.javs)} JAVS</p>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; font-size: 11px; color: #888;">
                            <span>Black: ⚫${d.blackcoins || 0}</span>
                            <span>White: ⚪${d.whitecoins || 0}</span>
                            <span>Blue: 🔵${d.bluecoins || 0}</span>
                            <span>Red: 🔴${d.redcoins || 0}</span>
                            <span>Green: 🟢${d.greencoins || 0}</span>
                        </div>
                    </div>
                `;
            } else {
                searchResult.innerHTML = "<p style='color: #ff5252; text-align: center;'>❗Пользователь не найден</p>";
            }
        } catch (e) {
            console.error("Search Error:", e);
            searchResult.innerHTML = "<p style='color: red; text-align: center;'>❗Ошибка доступа к данным</p>";
        }
    };
}

// --- ЛОГИКА РЕПОРТОВ ---
const reportdiv = document.getElementById("report");
const btnopenreport = document.getElementById("open-report");
const btnclosereport = document.getElementById("close-report");
const btndoreport = document.getElementById("btn-do-report");
const reportStatus = document.getElementById("report-status");

if (btnopenreport) btnopenreport.onclick = () => reportdiv.style.display = 'flex';

if (btnclosereport) {
    btnclosereport.onclick = () => {
        reportdiv.style.display = 'none';
        if (reportStatus) reportStatus.innerText = "";
    };
}

if (btndoreport) {
    btndoreport.onclick = async () => {
        const targetId = document.getElementById('report-id-input').value.trim();
        const reason = document.getElementById('report-reason-input').value.trim();
        const myId = document.getElementById('view-id').innerText;

        if (!targetId || !reason) return alert("❗Заполните все поля репорта!");
        if (targetId === myId) return alert("❗Вы не можете пожаловаться на себя");

        btndoreport.disabled = true;
        if (reportStatus) reportStatus.innerText = "📮Отправка репорта...";

        try {
            // Добавляем документ в коллекцию "reports"
            await addDoc(collection(db, "reports"), {
                FROM: myId,
                TO: targetId,
                REASON: reason,
                time: serverTimestamp()
            });

            if (reportStatus) {
                reportStatus.style.color = "#4CAF50";
                reportStatus.innerText = "✅Репорт успешно отправлен!";
            }

            // Очищаем и закрываем через 1.5 сек
            setTimeout(() => {
                document.getElementById('report-id-input').value = "";
                document.getElementById('report-reason-input').value = "";
                reportdiv.style.display = 'none';
                btndoreport.disabled = false;
                if (reportStatus) reportStatus.innerText = "";
            }, 1500);

            // Лог для админа
            await logAction(myId, "REPORT", `Подал жалобу на ${targetId}: ${reason}`, "REPORTED");

        } catch (e) {
            console.error("Report Error:", e);
            alert("❗Ошибка при отправке: " + e.message);
            btndoreport.disabled = false;
        }
    };
}

document.getElementById('get-daily').onclick = async () => {
    const myId = document.getElementById('view-id').innerText;
    if (myId === "00000") return;

    const userRef = doc(db, "users", myId);
    
    // --- НАСТРОЙКИ ШАНСОВ И МАКСИМУМОВ ---
    let javschance = 100, bcchance = 1, wcchance = 10, blcchance = 20, rcchance = 30, gcchance = 50;
    let mjavs = 50, mbc = 1, mwc = 2, mblc = 5, mrc = 10, mgc = 25;

    // ИСПРАВЛЕННЫЕ ССЫЛКИ (теперь совпадают с рынком и базой)
    const cRefs = {
        black: doc(db, "currencies", "blackcoins"),
        white: doc(db, "currencies", "whitecoins"),
        blue: doc(db, "currencies", "bluecoins"),
        red: doc(db, "currencies", "redcoins"),
        green: doc(db, "currencies", "greencoins")
    };

    try {
        await runTransaction(db, async (t) => {
            // ШАГ 1: Читаем данные
            const [uSnap, bSnap, wSnap, blSnap, rSnap, gSnap] = await Promise.all([
                t.get(userRef),
                t.get(cRefs.black),
                t.get(cRefs.white),
                t.get(cRefs.blue),
                t.get(cRefs.red),
                t.get(cRefs.green)
            ]);

            if (!uSnap.exists()) throw "❗Ошибка профиля";
            
            const userData = uSnap.data();
            const now = Date.now();
            const cooldown = 24 * 60 * 60 * 1000; 

            if (now - (userData.lastGiftTime || 0) < cooldown) {
                const diff = cooldown - (now - (userData.lastGiftTime || 0));
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                throw `Рано! Жди еще ${h}ч. ${m}м. 🕐`;
            }

            let updates = { lastGiftTime: now };
            let rewardsList = [];
            let globalUpdates = []; 
            const roll = (chance) => Math.random() * 100 < chance;

            // 1. JAVS
            if (roll(javschance)) {
                const amtJ = Math.floor(Math.random() * (mjavs - 10 + 1)) + 10;
                updates.javs = (userData.javs || 0) + amtJ;
                rewardsList.push(`🔹 ${amtJ} J`);
            }

            // Вспомогательная функция (внутри транзакции)
            // Вспомогательная функция (внутри транзакции)
            const processCoin = (key, snap, chance, max, icon, label) => {
                if (roll(chance)) {
                    const amt = (max === 1) ? 1 : Math.floor(Math.random() * max) + 1;
                    const fieldName = key === 'blue' ? 'bluecoins' : key + "coins"; // Проверка на blue
                    
                    updates[fieldName] = (userData[fieldName] || 0) + amt;
                    rewardsList.push(`${icon} ${amt} ${label}`);
                    
                    if (snap && snap.exists()) {
                        const currentTotal = snap.data().total || 0;
                        // Обновляем ОБЩЕЕ количество в коллекции currencies прямо здесь
                        t.update(cRefs[key], { total: currentTotal + amt });
                    }
                }
            };

            // Вызовы (убедись, что ключи совпадают с cRefs)
            processCoin('black', bSnap, bcchance, mbc, '⚫', 'BlackCoin');
            processCoin('white', wSnap, wcchance, mwc, '⚪', 'WhiteCoins');
            processCoin('blue', blSnap, blcchance, mblc, '🔵', 'BlueCoins'); // Ключ 'blue'
            processCoin('red', rSnap, rcchance, mrc, '🔴', 'RedCoins');
            processCoin('green', gSnap, gcchance, mgc, '🟢', 'GreenCoins');

            // В конце ШАГА 2 оставляем только обновление юзера
            t.update(userRef, updates);
            globalUpdates.forEach(upd => {
                t.update(upd.ref, { total: upd.newTotal });
            });

            return rewardsList.join(", ");

        }).then(async (resText) => {
            alert("Вы получили: " + resText);
            if (typeof logAction === "function") {
                await logAction(myId, "GIFT", "Получен бонус: " + resText, "DAILY-AWARD");
            }
        });

    } catch (e) {
        alert(e);
        console.error("Ошибка подарка:", e);
    }
};
// --- СИСТЕМА НОВОСТЕЙ (ИСПРАВЛЕННАЯ) ---
let currentNewsId = 0;
let maxNewsId = 0;

const nModal = document.getElementById('news-modal');
const nText = document.getElementById('news-text');
const nDate = document.getElementById('news-date');

// Открытие модалки
document.getElementById('open-news').onclick = async () => {
    nModal.style.display = 'flex';
    nText.innerText = "Загрузка...";
    await initNews();
};

document.getElementById('close-news').onclick = () => nModal.style.display = 'none';

async function initNews() {
    try {
        // Берем все документы из коллекции news
        const snap = await getDocs(collection(db, "news"));
        
        if (snap.empty) {
            nText.innerText = "Новостей пока нет.";
            document.getElementById('news-prev').style.display = 'none';
            document.getElementById('news-next').style.display = 'none';
            return;
        }

        // Собираем все ID, превращаем в числа и находим самое большое
        const ids = snap.docs.map(d => parseInt(d.id)).filter(id => !isNaN(id));
        maxNewsId = Math.max(...ids);
        currentNewsId = maxNewsId;

        await displayNews(currentNewsId);
    } catch (e) {
        console.error("Ошибка новостей:", e);
        nText.innerText = "Ошибка доступа к базе.";
    }
}

async function displayNews(id) {
    try {
        const nSnap = await getDoc(doc(db, "news", id.toString()));

        if (nSnap.exists()) {
            const data = nSnap.data();
            nText.innerText = data.text || "Текст отсутствует";

            // --- ОБРАБОТКА TIMESTAMP ---
            if (data.date) {
                // Если это Firebase Timestamp, у него есть метод toDate()
                // Если это обычное число (ms), создаем объект Date из него
                const dateObj = data.date.toDate ? data.date.toDate() : new Date(data.date);
                
                // Форматируем: День.Месяц.Год Часы:Минуты
                nDate.innerText = dateObj.toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } else {
                nDate.innerText = "Дата не указана";
            }
        } else {
            nText.innerText = `Новость #${id} не найдена.`;
        }

        const btnPrev = document.getElementById('news-prev');
        const btnNext = document.getElementById('news-next');
        btnPrev.disabled = (id <= 1);
        btnNext.disabled = (id >= maxNewsId);
        btnPrev.style.opacity = (id <= 1) ? "0.3" : "1";
        btnNext.style.opacity = (id >= maxNewsId) ? "0.3" : "1";

    } catch (e) {
        console.error(e);
        nText.innerText = "Ошибка при загрузке новости.";
    }
}

// Навигация
document.getElementById('news-prev').onclick = () => {
    if (currentNewsId > 1) {
        currentNewsId--;
        displayNews(currentNewsId);
    }
};

document.getElementById('news-next').onclick = () => {
    if (currentNewsId < maxNewsId) {
        currentNewsId++;
        displayNews(currentNewsId);
    }
};


//Редактирование профиля
// --- РЕДАКТИРОВАНИЕ ПРОФИЛЯ (УПРОЩЕННОЕ) ---
let currentUserData = {}; 

const eModal = document.getElementById("editor-modal");
const btnEditor = document.getElementById("open-editor");
const closeEditor = document.getElementById("close-editor");

// Открытие модалки
if (btnEditor) {
    btnEditor.onclick = async () => {
        const myId = document.getElementById('view-id').innerText;
        
        if (myId === "00000" || !myId) {
            alert("❌ Ошибка: ID пользователя не определен. Подождите загрузки данных.");
            return;
        }

        eModal.style.display = "flex";
        await load_udata(myId);
    };
}

// Закрытие модалки
if (closeEditor) {
    closeEditor.onclick = () => {
        eModal.style.display = "none";
    };
}

// Загрузка текущих данных ника
async function load_udata(myId) {
    try {
        const userRef = doc(db, "users", myId);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
            currentUserData = snap.data();
            const inputNick = document.getElementById('edit-nickname-input');
            if (inputNick) {
                inputNick.value = currentUserData.nickname || "";
            }
        }
    } catch (e) {
        console.error("❗ Ошибка загрузки данных:", e);
    }
}

// Сохранение НОВОГО НИКА
const btnSave = document.getElementById("btn-save-settings");
if (btnSave) {
    btnSave.onclick = async () => {
        const new_nickname = document.getElementById("edit-nickname-input").value.trim();
        const myId = document.getElementById('view-id').innerText;
        const statusEl = document.getElementById("editor-status");

        try {
            if (!new_nickname) throw "❗ Ник не может быть пустым!";
            if (new_nickname.length < 3) throw "❗ Ник слишком короткий!";

            const userRef = doc(db, "users", myId);
            
            // Просто обновляем ник в Firestore
            await updateDoc(userRef, { nickname: new_nickname });

            alert("✅ Ник успешно изменен!");
            eModal.style.display = "none";

            // Логируем действие для админки
            await logAction(myId, "EDIT", `Сменил ник на ${new_nickname}`, "PROFILE");
        } catch (e) {
            alert(e);
            if (statusEl) statusEl.innerText = e;
        }
    };
}

//Contacts
const cModal = document.getElementById("contacts-modal");
const btnContacts = document.getElementById("open-contacts");
const closeContacts = document.getElementById("close-contacts");

if (btnContacts) {
    btnContacts.onclick = async () => {
        cModal.style.display = "flex";
    };
}

// Закрытие модалки
if (closeContacts) {
    closeContacts.onclick = () => {
        cModal.style.display = "none";
    };
}
