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

// E2EE variables
let myECDHKey = null;
let myPublicKey = null;
let sharedSecret = null;
let aesKey = null;

// Generate ECDH key pair on load
(async function generateECDH() {
    myECDHKey = await window.crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey', 'deriveBits']
    );
    myPublicKey = await window.crypto.subtle.exportKey('jwk', myECDHKey.publicKey);
})();

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

    // Send our public key to the peer
    socket.emit('signal', { room: currentRoom, e2ee_pub: myPublicKey });
});

// Handle E2EE key exchange in signaling
socket.on('signal', async (data) => {
    if (data.e2ee_pub) {
        // Import peer's public key
        const peerPubKey = await window.crypto.subtle.importKey(
            'jwk', data.e2ee_pub, { name: 'ECDH', namedCurve: 'P-256' }, true, []
        );
        // Derive shared secret
        sharedSecret = await window.crypto.subtle.deriveKey(
            { name: 'ECDH', public: peerPubKey },
            myECDHKey.privateKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        aesKey = sharedSecret;
    }
});

// Encrypt message before sending
async function encryptMessage(msg) {
    if (!aesKey) return msg;
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        enc.encode(msg)
    );
    return {
        iv: Array.from(iv),
        ct: Array.from(new Uint8Array(ciphertext))
    };
}

// Decrypt message after receiving
async function decryptMessage(data) {
    if (!aesKey || !data.iv || !data.ct) return data;
    const iv = new Uint8Array(data.iv);
    const ct = new Uint8Array(data.ct);
    try {
        const pt = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            ct
        );
        return new TextDecoder().decode(pt);
    } catch (e) {
        return '[Encrypted message could not be decrypted]';
    }
}

// Send message (encrypt if possible)
sendBtn.addEventListener('click', async () => {
    const msg = input.value.trim();
    if (msg && currentRoom) {
        let payload = msg;
        if (aesKey) payload = await encryptMessage(msg);
        socket.emit('message', { room: currentRoom, msg: payload, sender: myRole });
        input.value = '';
        socket.emit('typing', { room: currentRoom, typing: false });
    }
});

// Send on Enter
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendBtn.click();
});

// Listen for typing event from the server
socket.on('typing', (isTyping) => {
    typingIndicator.textContent = isTyping ? 'Stranger is typing...' : '';
});

// Send typing status when user types
input.addEventListener('input', () => {
    if (currentRoom) {
        socket.emit('typing', { room: currentRoom, typing: true });
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('typing', { room: currentRoom, typing: false });
        }, 1000); // 1 second after user stops typing
    }
});

// Receive message (decrypt if possible)
socket.on('message', async (data) => {
    const msgDiv = document.createElement('div');
    let displayMsg = data && data.msg;
    if (aesKey && displayMsg && typeof displayMsg === 'object' && displayMsg.iv && displayMsg.ct) {
        displayMsg = await decryptMessage(displayMsg);
    }
    if (data && data.sender && displayMsg) {
        msgDiv.textContent = `${data.sender} - ${displayMsg}`;
        if (data.sender === myRole) {
            msgDiv.classList.add('user-message');
        }
    } else if (typeof displayMsg === 'string') {
        msgDiv.textContent = displayMsg;
    }
    messages.appendChild(msgDiv);
    messages.scrollTop = messages.scrollHeight;
    playNotif();
});

// Next button
nextBtn.addEventListener('click', () => {
    if (currentRoom) {
        socket.emit('leave_room', { room: currentRoom });
    }
    currentRoom = null;
    messages.innerHTML = '';
    typingIndicator.textContent = '';
    socket.emit('find_stranger');
});

// Dark mode toggle
const darkToggle = document.getElementById('dark-toggle');
darkToggle.addEventListener('click', function() {
    document.body.classList.toggle('dark-mode');
    this.textContent = document.body.classList.contains('dark-mode') ? "☀️ Light Mode" : "🌙 Dark Mode";
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
    // Automatically find a new stranger after 1.2 seconds
    setTimeout(() => {
        socket.emit('find_stranger');
        messages.innerHTML = '';
        typingIndicator.textContent = '';
    }, 1200);
});

function logDebug(...args) {
    console.log('[KAMOGLE DEBUG]', ...args);
}

// Add debug logs to signaling and WebRTC events
socket.on('signal', async (data) => {
    logDebug('Received signal', data);
    if (data.e2ee_pub) {
        logDebug('Received E2EE public key');
        // Import peer's public key
        const peerPubKey = await window.crypto.subtle.importKey(
            'jwk', data.e2ee_pub, { name: 'ECDH', namedCurve: 'P-256' }, true, []
        );
        // Derive shared secret
        sharedSecret = await window.crypto.subtle.deriveKey(
            { name: 'ECDH', public: peerPubKey },
            myECDHKey.privateKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        aesKey = sharedSecret;
    }
});
