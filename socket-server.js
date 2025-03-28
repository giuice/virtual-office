const { Server } = require("socket.io");
const http = require('http');

// Create an HTTP server instance. Socket.IO will attach to this.
const httpServer = http.createServer((req, res) => {
  // Basic response for HTTP requests to this port (optional)
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Socket.IO Server\n');
});

const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins for development - TODO: Restrict in production
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.SOCKET_PORT || 3001;

console.log(`Attempting to start Socket.IO server on port ${PORT}...`);

io.on('connection', (socket) => {
  console.log(`Socket.IO client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`Socket.IO client disconnected: ${socket.id}`);
  });

  socket.on('send_message', (message) => {
    // Basic validation
    if (!message || typeof message !== 'object') {
        console.error(`Invalid message format received from ${socket.id}`);
         return;
     }
     console.log(`Received message on server from ${socket.id}:`, message);
 
     // Check for replyToId and log it (placeholder for DB storage)
     if (message.replyToId) {
       console.log(`  -> Message is a reply to: ${message.replyToId}`);
     }
 
     // Broadcast the message to all other connected clients
    // In a real app, you'd likely target specific rooms or users based on message.conversationId or message.recipientId
    // Example: Broadcasting to a specific room if message has roomId
    // if (message.roomId) {
    //   socket.to(message.roomId).emit('receive_message', message);
    // } else {
       // Broadcast the message (including replyToId if present) to all other connected clients
       // TODO: Implement room/conversation-specific broadcasting
       socket.broadcast.emit('receive_message', message);
    // }

    // Optionally, send confirmation back to sender
    // socket.emit('message_sent_confirmation', { messageId: message.id }); // Assuming message has an ID
  });

  // Handle reaction updates
  socket.on('update_reaction', (reactionData) => {
    // Basic validation
    if (!reactionData || typeof reactionData !== 'object' || !reactionData.messageId || !reactionData.reaction || !reactionData.userId || typeof reactionData.add !== 'boolean') {
      console.error(`Invalid reaction data received from ${socket.id}:`, reactionData);
      return;
    }
    console.log(`Received reaction update from ${socket.id}:`, reactionData);

    // Broadcast the reaction update to all other connected clients
    // TODO: Implement room/conversation-specific broadcasting
    socket.broadcast.emit('reaction_updated', reactionData);
  });

  // Example: Joining a room based on conversationId or roomId
  socket.on('join_conversation', (conversationId) => {
    if (typeof conversationId === 'string') {
        socket.join(conversationId);
        console.log(`Socket ${socket.id} joined conversation ${conversationId}`);
        // Notify others in the room (optional)
        // socket.to(conversationId).emit('user_joined', { userId: socket.id, conversationId });
    } else {
        console.error(`Invalid conversationId received from ${socket.id}:`, conversationId);
    }
  });

  // Example: Leaving a room
  socket.on('leave_conversation', (conversationId) => {
     if (typeof conversationId === 'string') {
        socket.leave(conversationId);
        console.log(`Socket ${socket.id} left conversation ${conversationId}`);
        // Notify others in the room (optional)
        // socket.to(conversationId).emit('user_left', { userId: socket.id, conversationId });
     } else {
        console.error(`Invalid conversationId received from ${socket.id} for leave:`, conversationId);
     }
  });

  // Add more event handlers as needed (e.g., typing indicators)
});

httpServer.listen(PORT, () => {
  console.log(`Socket.IO server listening on port ${PORT}`);
});

httpServer.on('error', (error) => {
  console.error('HTTP Server Error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Is another server running?`);
    process.exit(1); // Exit if port is already in use
  }
});

process.on('SIGINT', () => {
    console.log('Shutting down Socket.IO server...');
    io.close(() => {
        console.log('Socket.IO server closed.');
        httpServer.close(() => {
            console.log('HTTP server closed.');
            process.exit(0);
        });
    });
});
