from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import uuid
import time
import html
import re
import logging

app = Flask(__name__)
app.secret_key = "secret"
socketio = SocketIO(app)

waiting_users = []
user_rooms = {}

BAD_WORDS = ['badword1', 'badword2', 'badword3']  # Add more as needed

logging.basicConfig(level=logging.INFO)

def clean_message(msg):
    msg = html.escape(msg)
    pattern = re.compile('|'.join(map(re.escape, BAD_WORDS)), re.IGNORECASE)
    return pattern.sub('[censored]', msg)

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('find_stranger')
def find_stranger():
    sid = request.sid
    # Remove from previous room if needed
    if sid in user_rooms:
        leave_room(user_rooms[sid], sid)
        emit('stranger_disconnected', room=user_rooms[sid], include_self=False)
        del user_rooms[sid]
    # Pair with waiting user or wait
    if waiting_users:
        partner_sid = waiting_users.pop(0)
        pair_users(sid, partner_sid)
    else:
        waiting_users.append(sid)

def pair_users(sid, partner_sid):
    room = str(uuid.uuid4())
    join_room(room, sid)
    join_room(room, partner_sid)
    user_rooms[sid] = room
    user_rooms[partner_sid] = room
    emit('stranger_found', {'room': room, 'role': 'Stranger 2'}, room=sid)
    emit('stranger_found', {'room': room, 'role': 'Stranger 1'}, room=partner_sid)
    logging.info(f"Paired {sid} and {partner_sid} in room {room}")

user_last_message = {}

@socketio.on('message')
def handle_message(data):
    sid = request.sid
    now = time.time()
    last = user_last_message.get(sid, 0)
    if now - last < 1:  # 1 second between messages
        return  # Ignore spam
    user_last_message[sid] = now

    room = data.get('room')
    msg = data.get('msg')
    sender = data.get('sender', 'Stranger')
    msg = clean_message(msg)
    emit('message', {'msg': msg, 'sender': sender}, room=room)

@socketio.on('typing')
def handle_typing(data):
    room = data.get('room')
    typing = data.get('typing')
    emit('typing', typing, room=room, include_self=False)

@socketio.on('leave_room')
def leave_current_room(data):
    sid = request.sid
    room = data.get('room')
    if room:
        leave_room(room, sid)
        emit('stranger_disconnected', room=room, include_self=False)
    if sid in user_rooms:
        del user_rooms[sid]

@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    if sid in waiting_users:
        waiting_users.remove(sid)
    if sid in user_rooms:
        room = user_rooms[sid]
        emit('stranger_disconnected', room=room, include_self=False)
        del user_rooms[sid]

if __name__ == '__main__':
    import eventlet
    eventlet.monkey_patch()
    socketio.run(app, host="0.0.0.0", port=5000)
