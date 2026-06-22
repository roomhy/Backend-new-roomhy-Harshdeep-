const ChatRoom = require('../models/ChatRoom');
const ChatMessage = require('../models/ChatMessage');

/**
 * SOCKET.IO HANDLERS WITH PERMISSION CHECKS
 * 
 * Login ID Flow:
 * - Area Manager: manager_id from manager.html
 * - Tenant: tenant_id assigned in rooms.html
 * - Website User: web_user_[email_slug] generated from request tab
 * - Property Owner: owner_id from property management database
 * - Super Admin: superadmin_id
 */

module.exports = (io) => {
  const userConnections = new Map(); // Map of login_id -> socket_id

  io.on('connection', (socket) => {
    console.log(`✓ Client connected: ${socket.id}`);

    /**
     * JOIN ROOM
     * User joins a specific chat room with permission validation
     */
    socket.on('join_room', async (data) => {
      const { room_id, login_id, role, user_name } = data;

      // Validate inputs
      if (!room_id || !login_id || !role) {
        socket.emit('error', {
          message: 'Missing required fields: room_id, login_id, role'
        });
        return;
      }

      try {
        // Verify room exists
        const room = await ChatRoom.findOne({ room_id });
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        // Check permission based on room type
        if (role !== 'superadmin') {
          // Check if user is participant
          const isParticipant = room.participants.some(p => p.login_id === login_id);
          if (!isParticipant) {
            socket.emit('error', { message: 'You are not a participant in this room' });
            return;
          }

          // Check permission rules
          if (room.room_type === 'owner_website_user' && !room.owner_accepted) {
            socket.emit('error', { message: 'Owner has not accepted this enquiry yet' });
            return;
          }

          if (room.room_type === 'owner_tenant' && !room.tenant_assigned) {
            socket.emit('error', { message: 'Tenant is not assigned to this property yet' });
            return;
          }
        }

        // Join socket to room
        socket.join(room_id);
        socket.currentRoom = room_id;
        socket.user = { login_id, role, user_name };

        // Track connection
        userConnections.set(login_id, socket.id);

        console.log(`✓ ${user_name} (${role}) joined room: ${room_id}`);

        // Send room info
        socket.emit('room_joined', {
          room_id,
          room_type: room.room_type,
          participants: room.participants,
          message: 'Successfully joined room'
        });

        // Send message history (last 100 messages)
        const messages = await ChatMessage.find({ room_id })
          .sort({ created_at: 1 })
          .limit(100);

        socket.emit('message_history', {
          messages,
          total_count: (await ChatMessage.countDocuments({ room_id }))
        });

        // Notify others that user joined
        const joinMessage = await ChatMessage.create({
          room_id,
          sender_login_id: 'system',
          sender_role: 'system',
          sender_name: 'System',
          message: `${user_name} (${role}) joined the conversation`,
          message_type: 'system',
          created_at: new Date()
        });

        io.to(room_id).emit('user_joined', {
          login_id,
          user_name,
          role,
          message: joinMessage
        });

      } catch (error) {
        console.error('❌ Error joining room:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    /**
     * SEND MESSAGE
     * Only authorized roles can send messages
     */
    socket.on('send_message', async (data) => {
      const { room_id, message } = data;
      const user = socket.user;

      if (!user || !room_id) {
        socket.emit('error', { message: 'User not joined to any room' });
        return;
      }

      if (!message || message.trim().length === 0) {
        socket.emit('error', { message: 'Message cannot be empty' });
        return;
      }

      // Check if user can send in this room
      const validRoles = ['superadmin', 'areamanager', 'property_owner', 'tenant', 'website_user'];
      if (!validRoles.includes(user.role)) {
        socket.emit('error', { message: 'Your role cannot send messages' });
        return;
      }

      try {
        const { checkUserBlockStatus, isOwnerTenantChat, detectViolation, logViolation } = require('../utils/moderationHelper');
        const ChatSettings = require('../models/ChatSettings');
        const ChatRoom = require('../models/ChatRoom');

        // 1. Check user restriction
        const blockCheck = await checkUserBlockStatus(user.login_id);
        if (blockCheck.blocked) {
          socket.emit('error', { message: blockCheck.reason });
          return;
        }

        // Find recipient in participants
        const chatRoomObj = await ChatRoom.findOne({ room_id }).lean();
        const recipient = chatRoomObj?.participants?.find(p => p.loginId !== user.login_id)?.loginId || room_id;

        const originalText = String(message).trim();

        // Save message to database immediately
        const msg = new ChatMessage({
          room_id,
          sender_login_id: user.login_id,
          sender_role: user.role,
          sender_name: user.user_name,
          message: originalText,
          message_type: 'text',
          is_blocked: false,
          created_at: new Date(),
          updated_at: new Date()
        });

        await msg.save();

        // Update room's last message
        await ChatRoom.findOneAndUpdate(
          { room_id },
          {
            last_message: msg.message,
            last_message_sender_id: user.login_id,
            last_message_sender_name: user.user_name,
            last_message_time: new Date(),
            updated_at: new Date()
          }
        );

        // Broadcast to all in room instantly
        io.to(room_id).emit('new_message', msg);
        console.log(`✓ Message sent in ${room_id} by ${user.user_name}`);

        // Run Groq AI moderation asynchronously in the background
        const isModeratedChat = await isOwnerTenantChat(user.login_id, recipient);
        if (isModeratedChat) {
          const { moderateChatMessageAsync } = require('../utils/moderationHelper');
          moderateChatMessageAsync(msg, recipient).catch(err => {
            console.error('Error running async moderation (V2):', err.message);
          });
        }

      } catch (error) {
        console.error('❌ Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    /**
     * TYPING INDICATOR
     */
    socket.on('typing', (data) => {
      const { room_id } = data;
      const user = socket.user;

      if (!user || !room_id) return;

      socket.to(room_id).emit('user_typing', {
        login_id: user.login_id,
        user_name: user.user_name,
        role: user.role
      });
    });

    /**
     * STOP TYPING
     */
    socket.on('stop_typing', (data) => {
      const { room_id } = data;
      const user = socket.user;

      if (!user || !room_id) return;

      socket.to(room_id).emit('user_stop_typing', {
        login_id: user.login_id
      });
    });

    /**
     * MARK MESSAGES AS READ
     */
    socket.on('mark_as_read', async (data) => {
      const { room_id, message_ids } = data;
      const user = socket.user;

      if (!user || !room_id || !message_ids || message_ids.length === 0) {
        return;
      }

      try {
        await ChatMessage.updateMany(
          { _id: { $in: message_ids } },
          {
            $addToSet: {
              read_by: {
                login_id: user.login_id,
                name: user.user_name,
                read_at: new Date()
              }
            }
          }
        );

        io.to(room_id).emit('messages_read', {
          message_ids,
          login_id: user.login_id,
          user_name: user.user_name,
          read_at: new Date()
        });

      } catch (error) {
        console.error('❌ Error marking messages as read:', error);
      }
    });

    /**
     * ESCALATE ROOM
     * Increase escalation level within same room
     */
    socket.on('escalate_room', async (data) => {
      const { room_id, reason } = data;
      const user = socket.user;

      if (!user || !room_id) {
        socket.emit('error', { message: 'User not joined to any room' });
        return;
      }

      // Only certain roles can escalate
      if (!['areamanager', 'property_owner', 'tenant', 'website_user'].includes(user.role)) {
        socket.emit('error', { message: 'Your role cannot escalate chats' });
        return;
      }

      try {
        const room = await ChatRoom.findOne({ room_id });
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        const previousLevel = room.escalation_level;
        room.escalation_level = Math.min(room.escalation_level + 1, 2);

        room.escalation_history.push({
          escalated_by_id: user.login_id,
          escalated_by_name: user.user_name,
          escalated_by_role: user.role,
          from_level: previousLevel,
          to_level: room.escalation_level,
          reason: reason || 'No reason provided',
          timestamp: new Date()
        });

        await room.save();

        const escalationTargets = {
          1: 'Area Manager',
          2: 'Super Admin'
        };

        // Create system message
        const systemMsg = await ChatMessage.create({
          room_id,
          sender_login_id: 'system',
          sender_role: 'system',
          sender_name: 'System',
          message: `Chat escalated to ${escalationTargets[room.escalation_level]} by ${user.user_name} - Reason: ${reason || 'No reason'}`,
          message_type: 'escalation',
          created_at: new Date()
        });

        // Broadcast escalation
        io.to(room_id).emit('room_escalated', {
          room,
          system_message: systemMsg,
          escalation_level: room.escalation_level
        });

        console.log(`✓ Room ${room_id} escalated to level ${room.escalation_level}`);

      } catch (error) {
        console.error('❌ Error escalating room:', error);
        socket.emit('error', { message: 'Failed to escalate room' });
      }
    });

    /**
     * DISCONNECT
     */
    socket.on('disconnect', () => {
      const user = socket.user;
      const room = socket.currentRoom;

      if (user && room) {
        console.log(`✓ ${user.user_name} disconnected from ${room}`);
        userConnections.delete(user.login_id);

        io.to(room).emit('user_left', {
          login_id: user.login_id,
          user_name: user.user_name
        });
      }

      console.log(`✓ Socket disconnected: ${socket.id}`);
    });
  });

  return { userConnections };
};
