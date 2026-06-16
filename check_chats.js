const dns = require('dns');
try {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
    console.warn('Could not set custom DNS servers:', e.message);
}
const mongoose = require('mongoose');
require('dotenv').config();

const ChatRoom = require('./models/ChatRoom');
const ChatMessage = require('./models/ChatMessage');

async function checkChats() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/roomhy');
        console.log('Connected.');

        console.log('=== CHAT ROOMS ===');
        const rooms = await ChatRoom.find({}).lean();
        console.log(`Total ChatRooms: ${rooms.length}`);
        rooms.forEach(r => {
            console.log(`- Room ID: ${r.room_id}, Participants: ${JSON.stringify(r.participants)}, Stage: ${r.stage}`);
        });

        console.log('\n=== LATEST MESSAGES ===');
        const messages = await ChatMessage.find({}).sort({ created_at: -1 }).limit(10).lean();
        console.log(`Latest 10 ChatMessages:`);
        messages.forEach(m => {
            console.log(`- [${m.created_at.toISOString()}] Room: ${m.room_id}, From: ${m.sender_role}/${m.sender_login_id} (${m.sender_name}): "${m.message}"`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

checkChats();
