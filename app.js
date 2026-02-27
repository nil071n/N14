class Chatroom {
    constructor() {
        this.messagesContainer = document.getElementById('messagesContainer');
        this.messageInput = document.getElementById('messageInput');
        this.nameInput = document.getElementById('nameInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.userCountElement = document.getElementById('userCount');
        this.messages = [];
        this.users = new Set();
        this.currentUser = null;
        
        this.init();
    }
    
    init() {
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        this.nameInput.addEventListener('change', () => {
            this.setUser();
        });
        
        this.loadMessages();
        this.loadUsers();
    }
    
    setUser() {
        const name = this.nameInput.value.trim();
        if (name && name !== this.currentUser) {
            if (this.currentUser) {
                this.users.delete(this.currentUser);
            }
            this.currentUser = name;
            this.users.add(name);
            this.updateUserCount();
            this.saveUsers();
        }
    }
    
    sendMessage() {
        if (!this.currentUser) {
            alert('Please enter your name first');
            this.nameInput.focus();
            return;
        }
        
        const message = this.messageInput.value.trim();
        if (!message) return;
        
        const msg = {
            sender: this.currentUser,
            text: message,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        
        this.messages.push(msg);
        this.saveMessages();
        this.renderMessage(msg, this.messages.length - 1);
        this.messageInput.value = '';
        this.messageInput.focus();
    }
    
    renderMessage(msg, index) {
        const messageEl = document.createElement('div');
        const isOwn = msg.sender === this.currentUser;
        messageEl.className = `message ${isOwn ? 'own' : ''}`;
        messageEl.id = `msg-${index}`;
        
        messageEl.innerHTML = `
            <div class="message-content">
                <span class="sender-name">${this.escapeHtml(msg.sender)}</span>
                <span class="message-text">${this.escapeHtml(msg.text)}</span>
            </div>
            <div class="message-time">${msg.timestamp}</div>
        `;
        
        this.messagesContainer.appendChild(messageEl);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
    
    loadMessages() {
        const stored = localStorage.getItem('N14_messages');
        if (stored) {
            this.messages = JSON.parse(stored);
            const welcome = this.messagesContainer.querySelector('.welcome-message');
            if (welcome) welcome.remove();
            
            this.messages.forEach((msg, index) => {
                this.renderMessage(msg, index);
            });
        }
    }
    
    saveMessages() {
        localStorage.setItem('N14_messages', JSON.stringify(this.messages));
    }
    
    loadUsers() {
        const stored = localStorage.getItem('N14_users');
        if (stored) {
            this.users = new Set(JSON.parse(stored));
            this.updateUserCount();
        }
    }
    
    saveUsers() {
        localStorage.setItem('N14_users', JSON.stringify(Array.from(this.users)));
    }
    
    updateUserCount() {
        this.userCountElement.textContent = this.users.size;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Chatroom();
});
