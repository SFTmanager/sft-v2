import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import { 
    getAuth, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
    setDoc,           // Добавили сюда
    serverTimestamp,  // Он уже тут есть
    increment,
    arrayUnion
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
// ВНИМАНИЕ: Импорт отсюда УДАЛЕН, так как всё уже импортировано сверху!

async function logAction(userId, type, message, path) {
    try {
        const now = new Date();
        const dateStr = now.toLocaleDateString('ru-RU', { 
            day: '2-digit', month: '2-digit', year: 'numeric' 
        });
        const timeStr = now.toLocaleTimeString('ru-RU', { 
            hour: '2-digit', minute: '2-digit', second: '2-digit' 
        });

        const customId = `${timeStr}; ${dateStr} [${userId}]`;

        await setDoc(doc(db, "config", "log", path, customId), {
            userId: userId,
            type: type,
            msg: message,
            time: serverTimestamp() 
        });

    } catch (e) { 
        console.error("❗Ошибка записи лога:", e); 
    }
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
                const descEl = document.getElementById('view-description');
                const statusEl = document.getElementById('status');
                const tags = document.getElementById('tags');
                if (!d.tags) {
                    console.log("🏆 Инициализация списка достижений...");
                    updateDoc(userRef, { tags: [] }); 
                    // Мы записываем пустой массив, чтобы в следующий раз ошибки не было
                }
                if (statusEl) {
                    if (d.pstatus){
                        const displayStatus = d.pstatus || "DEFAULT"; 
                        statusEl.innerText = "Status: " + displayStatus;
                    }
                    else {
                        updateDoc(userRef, { pstatus: "DEFAULT" });
                    }
                }
                if (tags && d.tags) {
                    // 1. Очищаем контейнер, чтобы теги не дублировались при обновлении
                    tags.innerHTML = ""; 

                    // 2. Используем for...of — это современнее и читабельнее
                    for (const tagText of d.tags) {
                        const element = document.createElement("p");
                        
                        // Используй textContent вместо innerHTML, если в тегах только текст
                        // Это защитит от XSS (если кто-то впишет <script> в тег)
                        element.textContent = tagText; 
                        
                        // Можно сразу добавить стиль или класс
                        element.style.margin = "5px 0";
                        element.className = "c-green"; 

                        tags.appendChild(element);
                    }
                }
                if (descEl) descEl.innerText = d.description || "Нет описания";
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
        
        if (!sid) return alert("🧿 Введите ID для поиска");

        searchResult.innerHTML = "<p style='color: #888; text-align: center; font-family: monospace;'>ACCESSING DATABASE...</p>";

        try {
            const userRef = doc(db, "users", sid);
            const snap = await getDoc(userRef);

            if (snap.exists()) {
                const d = snap.data();
                
                // 1. Готовим список достижений/тегов заранее
                // Если полей нет в базе, используем пустой массив, чтобы .map не выдал ошибку
                const allTags = d.tags || [];
                const rating = d.rating || 0;
                let colorrating = 0;
                if (rating < 0){
                    colorrating = "#FF0000";
                }
                else if (rating > 0){
                    colorrating = "#00FF00";
                }
                else {
                    colorrating = "#FFFFFF";
                }
                const tagsHTML = allTags.length > 0 
                    ? allTags.map(t => `<span style="display:inline-block; background:#222; border:1px solid #444; padding:2px 8px; border-radius:10px; margin:2px; font-size:10px; color:#4CAF50;">${t}</span>`).join('')
                    : "<span style='color:#555; font-size:11px;'>Тегов нет</span>";
                
                // 2. Отрисовываем всю карточку
                searchResult.innerHTML = `
                    <div style="background: #111; padding: 20px; border-radius: 15px; border: 1px solid #333; box-shadow: 0 10px 30px rgba(0,0,0,0.7); text-align: center; color: #fff;">
                        
                        <div style="margin-bottom: 15px;">
                            <div style="font-size: 9px; color: #555; letter-spacing: 2px; margin-bottom: 5px; text-transform: uppercase;">SFT Profile System</div>
                            <b style="font-size: 24px; color: #fff;">${d.nickname || "Unknown"}</b>
                            <div style="color: #444; font-size: 11px; font-family: monospace; margin-top: 4px;">#${sid}</div>
                        </div>

                        <div style="margin-bottom: 15px;">
                            <span style="font-size: 11px; font-weight: bold; padding: 3px 12px; border-radius: 20px; border: 1px solid #2196f3; color: #2196f3; text-transform: uppercase;">
                                ${d.pstatus || "DEFAULT"}
                            </span>
                        </div>

                        <div style="background: #1a1a1a; padding: 12px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #2196f3;">
                            <p style="margin: 0; color: #ccc; font-size: 13px; font-style: italic; line-height: 1.4;">
                                "${d.description || "Описание отсутствует"}"
                            </p>
                        </div>

                        <div style="margin-bottom: 20px; background: rgba(76, 175, 80, 0.05); padding: 10px; border-radius: 10px;">
                            <div style="color: #4CAF50; font-size: 22px; font-weight: bold;">${Math.floor(d.javs || 0)} <span style="font-size: 12px;">JAVS</span></div>
                            <div style="display: flex; justify-content: center; gap: 15px; margin-top: 10px; font-size: 11px; color: #888;">
                                <span>⚫ ${d.blackcoins || 0}</span>
                                <span>⚪ ${d.whitecoins || 0}</span>
                                <span>🔵 ${d.bluecoins || 0}</span>
                            </div>
                        </div>

                        <details style="background: #0a0a0a; border-radius: 8px; border: 1px solid #222; overflow: hidden;">
                            <summary style="padding: 10px; cursor: pointer; color: #666; font-size: 12px; user-select: none; outline: none;">
                                Теги/Достижения SFT
                            </summary>
                            <div style="padding: 15px; text-align: left; border-top: 1px solid #222;">
                                <div style="margin-bottom: 10px;">
                                    ${tagsHTML}
                                </div>
                            </div>
                        </details>
                        <div>
                            <p class = "c-white">Рейтинг: <h3 style = "color: ${colorrating}">${rating}</h3></p>
                            <div style = "display: flex; flex-direction: row;">
                                <button class = 'btn-primary'>
                                    <img src = "imgs/thumbs-up.png">
                                </button>
                                <button class = 'btn-primary' style = 'background-color: red;'>
                                    <img src = "imgs/thumbs-down.png">
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                const upBtn = searchResult.querySelector('.btn-primary:not([style*="background-color: red"])');
                const downBtn = searchResult.querySelector('.btn-primary[style*="background-color: red"]');

                if (upBtn && downBtn) {
                    // Функция для голосования
                    const handleVote = async (isPositive) => {
                        const currentUser = auth.currentUser; // Получаем текущего авторизованного юзера
                        if (!currentUser) return alert("❌ Войдите в аккаунт, чтобы голосовать");
                        if (currentUser.uid === sid) return alert("⛔ Нельзя голосовать за самого себя!");

                        try {
                            const targetUserRef = doc(db, "users", sid);
                            const targetSnap = await getDoc(targetUserRef);
                            const targetData = targetSnap.data();
                            
                            const voters = targetData.votedBy || [];

                            if (voters.includes(currentUser.uid)) {
                                return alert("🚫 Вы уже голосовали за этого пользователя");
                            }

                            // Обновляем рейтинг и добавляем ID в список проголосовавших
                            await updateDoc(targetUserRef, {
                                rating: increment(isPositive ? 1 : -1),
                                votedBy: arrayUnion(currentUser.uid)
                            });

                            alert("✅ Голос учтен!");
                            btnDoSearch.onclick(); // Перезапускаем поиск, чтобы обновить цифру на экране
                            
                        } catch (err) {
                            console.error("Vote error:", err);
                            alert("❗ Ошибка при голосовании");
                        }
                    };

                    upBtn.onclick = () => handleVote(true);
                    downBtn.onclick = () => handleVote(false);
                }
            } else {
                searchResult.innerHTML = "<div style='color: #ff5252; text-align: center; background: rgba(255,82,82,0.1); padding: 15px; border-radius: 10px;'>❗ ОШИБКА: Пользователь не найден</div>";
            }
        } catch (e) {
            console.error("Search Error:", e);
            searchResult.innerHTML = "<p style='color: red; text-align: center;'>❗ ОШИБКА ПОДКЛЮЧЕНИЯ К БД</p>";
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


// --- ОБНОВЛЕНИЕ ОПИСАНИЯ ---
const dModal = document.getElementById("description-modal");
const btnDescription = document.getElementById("edit-description");
const closeDescription = document.getElementById("close-description");
const btnDescSave = document.getElementById("submit-description");
const inputDescription = document.getElementById("input-description");

// Открытие модалки и загрузка данных
if (btnDescription) {
    btnDescription.onclick = async () => {
        const ID = document.getElementById("view-id").innerText;
        dModal.style.display = "flex";
        
        // Сразу подгружаем текущее описание в поле ввода
        try {
            const userRef = doc(db, "users", ID);
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                const data = snap.data();
                if (inputDescription) {
                    inputDescription.value = data.description || "";
                }
            }
        } catch (e) {
            console.error("Ошибка загрузки описания:", e);
        }
    };
}

// Закрытие
if (closeDescription) {
    closeDescription.onclick = () => {
        dModal.style.display = "none";
    };
}

// Сохранение
if (btnDescSave) {
    btnDescSave.onclick = async () => {
        const new_description = inputDescription.value.trim();
        const ID = document.getElementById("view-id").innerText;
        
        if (ID === "00000") return;

        try {
            const userRef = doc(db, "users", ID);
            await updateDoc(userRef, { description: new_description });
            
            alert("✅ Описание успешно изменено!");
            dModal.style.display = "none";
            
            // Логируем
            await logAction(ID, "EDIT", `Сменил описание на: ${new_description}`, "PROFILE");
            
            // Чтобы увидеть результат без перезагрузки, можно обновить текст на странице, 
            // если у тебя есть элемент для этого (например, view-description)
            const viewDesc = document.getElementById('view-description');
            if (viewDesc) viewDesc.innerText = new_description;

        } catch (e) {
            console.error("Ошибка сохранения:", e);
            alert("❌ Ошибка при сохранении");
        }
    };
}