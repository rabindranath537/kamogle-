const socket = io();

let currentRoom = null;
let typingTimeout = null;
let myRole = 'You';

// UI elements
const messages = document.getElementById('messages');
const input = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const nextBtn = document.getElementById('next-btn');
const typingIndicator = document.getElementById('typing-indicator');

// Find a stranger on page load
findStranger();

function findStranger() {
    currentRoom = null;
    messages.innerHTML = '';
    typingIndicator.textContent = '';
    socket.emit('find_stranger');
}

// When paired with a stranger
socket.on('stranger_found', (data) => {
    currentRoom = data.room;
    myRole = data.role || 'You';
    messages.innerHTML = '';
    typingIndicator.textContent = '';
    const info = document.createElement('div');
    info.textContent = 'Stranger connected!';
    info.style.color = '#1c7ed6';
    info.style.fontWeight = 'bold';
    messages.appendChild(info);
    playNotif();
});

// Send message
sendBtn.addEventListener('click', () => {
    const msg = input.value.trim();
    if (msg && currentRoom) {
        socket.emit('message', { room: currentRoom, msg, sender: myRole });
        input.value = '';
        socket.emit('typing', { room: currentRoom, typing: false });
    }
});

// Send on Enter
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendBtn.click();
});

// Typing indicator
input.addEventListener('input', () => {
    if (currentRoom) {
        socket.emit('typing', { room: currentRoom, typing: true });
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('typing', { room: currentRoom, typing: false });
        }, 1000);
    }
});

// Receive message
socket.on('message', (data) => {
    const msgDiv = document.createElement('div');
    if (data && data.sender && data.msg) {
        msgDiv.textContent = `${data.sender} - ${data.msg}`;
    } else if (typeof data === 'string') {
        msgDiv.textContent = data;
    }
    messages.appendChild(msgDiv);
    messages.scrollTop = messages.scrollHeight;
    playNotif();
});

// Typing indicator from stranger
socket.on('typing', (isTyping) => {
    typingIndicator.textContent = isTyping ? 'Stranger is typing...' : '';
});

// Stranger disconnected
socket.on('stranger_disconnected', () => {
    const info = document.createElement('div');
    info.textContent = 'Stranger disconnected';
    info.style.color = '#e74c3c';
    info.style.fontWeight = 'bold';
    messages.appendChild(info);
    typingIndicator.textContent = '';
    currentRoom = null;
    playNotif();
});

// Next button
nextBtn.addEventListener('click', () => {
    if (currentRoom) {
        socket.emit('leave_room', { room: currentRoom });
    }
    findStranger();
});

// Dark mode toggle
const darkToggle = document.getElementById('dark-toggle');
darkToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    darkToggle.textContent = document.body.classList.contains('dark') ? '☀️ Light Mode' : '🌙 Dark Mode';
});

// Emoji picker support
document.querySelectorAll('.emoji').forEach(el => {
    el.addEventListener('click', () => {
        input.value += el.textContent;
        input.focus();
    });
});

function playNotif() {
    const audio = document.getElementById('notif-sound');
    if (audio) audio.play();
}

// Handle disconnection
socket.on('disconnect', () => {
    alert('You have been disconnected. Trying to reconnect...');
    window.location.reload();
});
