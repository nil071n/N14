// ============================================
// N14 TERMINAL CHATROOM - SCRIPT
// ============================================

document.addEventListener('DOMContentLoaded', function () {
    const USERS_KEY = 'n14_users';
    const SESSION_KEY = 'n14_current_user';
    const CHAT_KEY = 'n14_chat_state_v1';
    const PRESENCE_KEY = 'n14_presence_v1';
    const READ_PREFIX = 'n14_read_state_';
    const PRESENCE_TTL_MS = 30000;
    const PRESENCE_PULSE_MS = 10000;

    const channels = [
        { name: 'general', desc: 'public chatroom' },
    ];

    let currentUser = '';
    let currentView = 'channel';
    let currentChannel = 'general';
    let currentDM = null;
    let activeTab = 'dms';
    let presenceTimer = null;

    const authScreen = document.getElementById('authScreen');
    const appContainer = document.getElementById('appContainer');
    const signInForm = document.getElementById('signInForm');
    const registerForm = document.getElementById('registerForm');
    const showRegister = document.getElementById('showRegister');
    const showSignIn = document.getElementById('showSignIn');
    const signInError = document.getElementById('signInError');
    const registerError = document.getElementById('registerError');
    const signInUsername = document.getElementById('signInUsername');
    const signInPassword = document.getElementById('signInPassword');
    const regUsername = document.getElementById('regUsername');
    const regPassword = document.getElementById('regPassword');
    const regConfirm = document.getElementById('regConfirm');

    const chatMessages = document.getElementById('chatMessages');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const dmList = document.getElementById('dmList');
    const onlineList = document.getElementById('onlineList');
    const offlineList = document.getElementById('offlineList');
    const onlineCount = document.getElementById('onlineCount');
    const offlineCount = document.getElementById('offlineCount');
    const chatChannelName = document.getElementById('chatChannelName');
    const chatChannelDesc = document.getElementById('chatChannelDesc');
    const chatChannelIcon = document.querySelector('.chat-channel-icon');
    const currentUserEl = document.getElementById('currentUser');
    const dmSearch = document.getElementById('dmSearch');
    const sidebarTabs = document.querySelectorAll('.sidebar-tab');
    const toggleLeft = document.getElementById('toggleLeft');
    const toggleRight = document.getElementById('toggleRight');
    const sidebarLeft = document.getElementById('sidebarLeft');
    const sidebarRight = document.getElementById('sidebarRight');
    const logoutBtn = document.getElementById('logoutBtn');

    function safeParse(json, fallback) {
        try {
            return json ? JSON.parse(json) : fallback;
        } catch (err) {
            return fallback;
        }
    }

    function getUsers() {
        return safeParse(localStorage.getItem(USERS_KEY), {});
    }

    function saveUsers(users) {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }

    function getSession() {
        return sessionStorage.getItem(SESSION_KEY);
    }

    function setSession(username) {
        sessionStorage.setItem(SESSION_KEY, username);
    }

    function clearSession() {
        sessionStorage.removeItem(SESSION_KEY);
    }

    function getDefaultChatState() {
        return { channels: { general: [] }, dms: {} };
    }

    function normalizeChatState(state) {
        const normalized = state && typeof state === 'object' ? state : getDefaultChatState();
        if (!normalized.channels || typeof normalized.channels !== 'object') normalized.channels = {};
        if (!normalized.dms || typeof normalized.dms !== 'object') normalized.dms = {};
        if (!Array.isArray(normalized.channels.general)) normalized.channels.general = [];
        return normalized;
    }

    function getChatState() {
        return normalizeChatState(safeParse(localStorage.getItem(CHAT_KEY), getDefaultChatState()));
    }

    function saveChatState(state) {
        localStorage.setItem(CHAT_KEY, JSON.stringify(normalizeChatState(state)));
    }

    function getPresence() {
        return safeParse(localStorage.getItem(PRESENCE_KEY), {});
    }

    function savePresence(presence) {
        localStorage.setItem(PRESENCE_KEY, JSON.stringify(presence));
    }

    function getReadState() {
        if (!currentUser) return {};
        return safeParse(localStorage.getItem(READ_PREFIX + currentUser), {});
    }

    function setReadState(readState) {
        if (!currentUser) return;
        localStorage.setItem(READ_PREFIX + currentUser, JSON.stringify(readState));
    }

    function getDMKey(userA, userB) {
        return [userA, userB].sort().join('::');
    }

    function markThreadRead(threadKey) {
        const readState = getReadState();
        readState[threadKey] = Date.now();
        setReadState(readState);
    }

    function getTimeLabel(timestamp) {
        const d = new Date(timestamp);
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }

    function getUsernameColorClass(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return 'color-' + ((Math.abs(hash) % 6) + 1);
    }

    function getInitials(name) {
        return name.split(/[_\-.]/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || name.slice(0, 2).toUpperCase();
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function removePresence() {
        if (!currentUser) return;
        const presence = getPresence();
        delete presence[currentUser];
        savePresence(presence);
    }

    function touchPresence() {
        if (!currentUser) return;
        const presence = getPresence();
        const now = Date.now();
        presence[currentUser] = now;
        Object.keys(presence).forEach((name) => {
            if (now - presence[name] > PRESENCE_TTL_MS) delete presence[name];
        });
        savePresence(presence);
    }

    function startPresence() {
        stopPresence();
        touchPresence();
        presenceTimer = setInterval(() => {
            touchPresence();
            renderOnlineUsers();
        }, PRESENCE_PULSE_MS);
    }

    function stopPresence() {
        if (presenceTimer) {
            clearInterval(presenceTimer);
            presenceTimer = null;
        }
    }

    function getMessagesForCurrentThread() {
        const chatState = getChatState();
        if (currentView === 'channel') {
            return chatState.channels[currentChannel] || [];
        }
        if (currentView === 'dm' && currentDM) {
            return chatState.dms[getDMKey(currentUser, currentDM)] || [];
        }
        return [];
    }

    function renderMessages(messages) {
        if (messages.length === 0) {
            chatMessages.innerHTML = `
                <div class="chat-welcome">
                    <div class="welcome-icon">#</div>
                    <div class="welcome-text">no messages yet</div>
                    <div class="welcome-hint">type something below to start the conversation</div>
                </div>
            `;
            return;
        }

        let html = '';
        messages.forEach(msg => {
            const isOwn = msg.from === currentUser;
            const classes = ['message'];
            if (isOwn) classes.push('own');
            const colorClass = getUsernameColorClass(msg.from);

            html += `
                <div class="${classes.join(' ')}">
                    <div class="message-line">
                        <span class="msg-timestamp">[${escapeHTML(msg.time)}]</span>
                        <span class="msg-prefix">&gt;</span>
                        <span class="msg-username ${colorClass}">${escapeHTML(msg.from)}:</span>
                        <span class="msg-text">${escapeHTML(msg.text)}</span>
                    </div>
                </div>
            `;
        });

        html += '<div class="typing-indicator" id="typingIndicator"></div>';
        chatMessages.innerHTML = html;
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function getDMOverview() {
        const chatState = getChatState();
        const readState = getReadState();
        const list = [];
        Object.entries(chatState.dms).forEach(([key, messages]) => {
            const usersInConv = key.split('::');
            if (!usersInConv.includes(currentUser)) return;
            const otherUser = usersInConv[0] === currentUser ? usersInConv[1] : usersInConv[0];
            const last = messages[messages.length - 1];
            const readTs = readState['dm:' + key] || 0;
            const unread = messages.filter(m => m.from !== currentUser && m.ts > readTs).length;
            list.push({
                user: otherUser,
                unread,
                lastTs: last ? last.ts : 0,
                lastTime: last ? last.time : '',
                preview: last ? last.text : 'start a conversation...',
            });
        });
        list.sort((a, b) => b.lastTs - a.lastTs);
        return list;
    }

    function renderDMList(filter = '') {
        const dmConversations = getDMOverview();
        const filtered = filter
            ? dmConversations.filter(c => c.user.toLowerCase().includes(filter.toLowerCase()))
            : dmConversations;

        if (filtered.length === 0) {
            dmList.innerHTML = `
                <div class="dm-empty">
                    no conversations yet<br>
                    <span style="color: #112211;">click a user to start a DM</span>
                </div>
            `;
            return;
        }

        let html = '';
        filtered.forEach(conv => {
            const isActive = currentView === 'dm' && currentDM === conv.user;
            html += `
                <div class="dm-item ${isActive ? 'active' : ''}" data-dm="${escapeHTML(conv.user)}">
                    <div class="dm-avatar">${getInitials(conv.user)}</div>
                    <div class="dm-info">
                        <div class="dm-name">${escapeHTML(conv.user)}</div>
                        <div class="dm-preview">${escapeHTML(conv.preview.length > 30 ? conv.preview.slice(0, 30) + '...' : conv.preview)}</div>
                    </div>
                    <div class="dm-meta">
                        <span class="dm-time">${escapeHTML(conv.lastTime)}</span>
                        ${conv.unread > 0 ? `<span class="dm-unread">${conv.unread}</span>` : ''}
                    </div>
                </div>
            `;
        });

        dmList.innerHTML = html;
        document.querySelectorAll('.dm-item').forEach(el => {
            el.addEventListener('click', () => openDM(el.dataset.dm));
        });
    }

    function renderChannelList() {
        let html = '';
        channels.forEach(ch => {
            const isActive = currentView === 'channel' && currentChannel === ch.name;
            html += `
                <div class="channel-item ${isActive ? 'active' : ''}" data-channel="${ch.name}">
                    <span class="channel-icon">#</span>
                    <span>${ch.name}</span>
                </div>
            `;
        });
        dmList.innerHTML = html;
        document.querySelectorAll('.channel-item').forEach(el => {
            el.addEventListener('click', () => openChannel(el.dataset.channel));
        });
    }

    function renderSidebarContent() {
        if (activeTab === 'dms') renderDMList(dmSearch.value);
        else renderChannelList();
    }

    function renderOnlineUsers() {
        const users = getUsers();
        const allUsers = Object.keys(users).sort();
        const presence = getPresence();
        const now = Date.now();

        const online = [];
        const offline = [];
        allUsers.forEach(name => {
            if (presence[name] && now - presence[name] <= PRESENCE_TTL_MS) online.push(name);
            else offline.push(name);
        });

        onlineCount.textContent = String(online.length);
        offlineCount.textContent = String(offline.length);

        function userListHtml(names, statusClass) {
            return names.map(name => {
                const isYou = name === currentUser;
                return `
                    <div class="user-item" data-user="${escapeHTML(name)}">
                        <div class="user-avatar">
                            ${getInitials(name)}
                            <span class="status-indicator ${statusClass}"></span>
                        </div>
                        <span class="user-name">${escapeHTML(name)}${isYou ? ' (you)' : ''}</span>
                    </div>
                `;
            }).join('');
        }

        onlineList.innerHTML = userListHtml(online, 'online');
        offlineList.innerHTML = userListHtml(offline, 'offline');

        document.querySelectorAll('.user-item').forEach(el => {
            el.addEventListener('click', () => {
                const userName = el.dataset.user;
                if (!userName || userName === currentUser) return;
                openDM(userName);
            });
        });
    }

    function openChannel(name) {
        currentView = 'channel';
        currentChannel = name;
        currentDM = null;
        chatChannelIcon.textContent = '#';
        chatChannelName.textContent = name;
        const ch = channels.find(c => c.name === name);
        chatChannelDesc.textContent = ch ? `— ${ch.desc}` : '';
        markThreadRead('channel:' + name);
        renderMessages(getMessagesForCurrentThread());
        renderSidebarContent();
        closeMobileSidebars();
    }

    function openDM(name) {
        currentView = 'dm';
        currentDM = name;
        activeTab = 'dms';
        sidebarTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'dms'));
        chatChannelIcon.textContent = '✉';
        chatChannelName.textContent = name;
        chatChannelDesc.textContent = '— private message';
        markThreadRead('dm:' + getDMKey(currentUser, name));
        renderMessages(getMessagesForCurrentThread());
        renderSidebarContent();
        closeMobileSidebars();
    }

    function sendMessage() {
        const text = messageInput.value.trim();
        if (!text || !currentUser) return;
        const now = Date.now();
        const message = {
            id: String(now) + '-' + Math.random().toString(16).slice(2),
            from: currentUser,
            text,
            ts: now,
            time: getTimeLabel(now),
        };

        const chatState = getChatState();
        if (currentView === 'channel') {
            if (!Array.isArray(chatState.channels[currentChannel])) chatState.channels[currentChannel] = [];
            chatState.channels[currentChannel].push(message);
            markThreadRead('channel:' + currentChannel);
        } else if (currentView === 'dm' && currentDM) {
            const key = getDMKey(currentUser, currentDM);
            if (!Array.isArray(chatState.dms[key])) chatState.dms[key] = [];
            chatState.dms[key].push(message);
            markThreadRead('dm:' + key);
        }

        saveChatState(chatState);
        messageInput.value = '';
        messageInput.focus();
        renderMessages(getMessagesForCurrentThread());
        renderSidebarContent();
    }

    function refreshCurrentThread() {
        if (!currentUser) return;
        if (currentView === 'channel') markThreadRead('channel:' + currentChannel);
        if (currentView === 'dm' && currentDM) markThreadRead('dm:' + getDMKey(currentUser, currentDM));
        renderMessages(getMessagesForCurrentThread());
        renderSidebarContent();
    }

    function closeMobileSidebars() {
        sidebarLeft.classList.remove('open');
        sidebarRight.classList.remove('open');
        document.querySelectorAll('.sidebar-backdrop').forEach(el => el.remove());
    }

    function openMobileSidebar(side) {
        closeMobileSidebars();
        const sidebar = side === 'left' ? sidebarLeft : sidebarRight;
        sidebar.classList.add('open');
        const backdrop = document.createElement('div');
        backdrop.className = 'sidebar-backdrop active';
        backdrop.addEventListener('click', closeMobileSidebars);
        document.body.appendChild(backdrop);
    }

    function resetAuthForms() {
        signInForm.reset();
        registerForm.reset();
        registerForm.classList.add('hidden');
        signInForm.classList.remove('hidden');
        signInError.textContent = '';
        registerError.textContent = '';
    }

    function leaveChat() {
        stopPresence();
        removePresence();
        clearSession();
        currentUser = '';
        authScreen.classList.remove('hidden');
        appContainer.classList.add('hidden');
        toggleLeft.classList.add('hidden');
        toggleRight.classList.add('hidden');
        resetAuthForms();
    }

    function enterChat(username) {
        currentUser = username;
        currentView = 'channel';
        currentChannel = 'general';
        currentDM = null;
        activeTab = 'dms';

        currentUserEl.textContent = username;
        authScreen.classList.add('hidden');
        appContainer.classList.remove('hidden');
        toggleLeft.classList.remove('hidden');
        toggleRight.classList.remove('hidden');
        sidebarTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'dms'));

        startPresence();
        renderOnlineUsers();
        openChannel('general');
        messageInput.focus();
    }

    showRegister.addEventListener('click', (e) => {
        e.preventDefault();
        signInForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        signInError.textContent = '';
        registerError.textContent = '';
    });

    showSignIn.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.add('hidden');
        signInForm.classList.remove('hidden');
        signInError.textContent = '';
        registerError.textContent = '';
    });

    signInForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = signInUsername.value.trim().toLowerCase();
        const password = signInPassword.value;
        if (!username || !password) {
            signInError.textContent = '> all fields required';
            return;
        }
        const users = getUsers();
        if (!users[username]) {
            signInError.textContent = '> user not found';
            return;
        }
        if (users[username] !== password) {
            signInError.textContent = '> invalid password';
            return;
        }
        setSession(username);
        enterChat(username);
    });

    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = regUsername.value.trim().toLowerCase();
        const password = regPassword.value;
        const confirm = regConfirm.value;
        if (!username || !password || !confirm) {
            registerError.textContent = '> all fields required';
            return;
        }
        if (/\s/.test(username)) {
            registerError.textContent = '> no spaces in username';
            return;
        }
        if (username.length < 2 || username.length > 20) {
            registerError.textContent = '> username: 2-20 characters';
            return;
        }
        if (password.length < 3) {
            registerError.textContent = '> password: min 3 characters';
            return;
        }
        if (password !== confirm) {
            registerError.textContent = '> passwords do not match';
            return;
        }
        const users = getUsers();
        if (users[username]) {
            registerError.textContent = '> username already taken';
            return;
        }
        users[username] = password;
        saveUsers(users);
        setSession(username);
        enterChat(username);
    });

    logoutBtn.addEventListener('click', leaveChat);

    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
        if (e.key === 'Escape') messageInput.value = '';
    });

    sidebarTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            activeTab = tab.dataset.tab;
            sidebarTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderSidebarContent();
        });
    });

    dmSearch.addEventListener('input', () => {
        if (activeTab === 'dms') renderDMList(dmSearch.value);
    });

    toggleLeft.addEventListener('click', () => openMobileSidebar('left'));
    toggleRight.addEventListener('click', () => openMobileSidebar('right'));

    window.addEventListener('storage', (event) => {
        if (!currentUser) return;
        if (event.key === CHAT_KEY || event.key === PRESENCE_KEY || event.key === USERS_KEY) {
            refreshCurrentThread();
            renderOnlineUsers();
        }
    });

    window.addEventListener('beforeunload', () => {
        stopPresence();
        removePresence();
    });

    if (!localStorage.getItem(CHAT_KEY)) {
        saveChatState(getDefaultChatState());
    }

    const savedUser = getSession();
    if (savedUser) {
        const users = getUsers();
        if (users[savedUser]) enterChat(savedUser);
        else clearSession();
    }
});