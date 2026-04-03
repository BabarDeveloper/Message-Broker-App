const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// In-memory data store
// Structure: {
//   "topicName": {
//     subscribers: ["subscriberKey1", "subscriberKey2"]
//   }
// }
const topics = {};

// Helper function to get all topic subscriptions
function getAllSubscriptions() {
  const subscriptions = [];
  for (const [topic, data] of Object.entries(topics)) {
    for (const subscriberKey of data.subscribers) {
      subscriptions.push({ topic, key: subscriberKey });
    }
  }
  return subscriptions;
}

// ============= API ROUTES =============

// Get all topics and their subscribers
app.get("/api/topics", (req, res) => {
  res.json({ topics });
});

// Get all existing subscriptions (for socket sync)
app.get("/api/all-subscriptions", (req, res) => {
  const subscriptions = getAllSubscriptions();
  res.json({ subscriptions });
});

// Create a new topic
app.post("/api/topics", (req, res) => {
  const { topic } = req.body;

  if (!topic || topic.trim() === "") {
    return res.status(400).json({ error: "Topic name is required" });
  }

  if (topics[topic]) {
    return res.status(400).json({ error: "Topic already exists" });
  }

  topics[topic] = { subscribers: [] };
  res.json({ success: true, message: `Topic "${topic}" created`, topic });
});

// Subscribe to a topic (create or join subscriber group)
app.post("/api/subscribe", (req, res) => {
  const { topic, subscriberKey } = req.body;

  if (!topic || !subscriberKey) {
    return res
      .status(400)
      .json({ error: "Topic and subscriber key are required" });
  }

  if (!topics[topic]) {
    return res
      .status(404)
      .json({ error: "Topic does not exist. Please create the topic first." });
  }

  // Check if subscriber already exists
  if (!topics[topic].subscribers.includes(subscriberKey)) {
    topics[topic].subscribers.push(subscriberKey);
  }

  res.json({
    success: true,
    message: `Subscriber "${subscriberKey}" added to topic "${topic}"`,
    topic,
    subscriberKey,
  });
});

// Unsubscribe from a topic (remove subscriber group)
app.delete("/api/unsubscribe", (req, res) => {
  const { topic, subscriberKey } = req.body;

  if (!topic || !subscriberKey) {
    return res
      .status(400)
      .json({ error: "Topic and subscriber key are required" });
  }

  if (!topics[topic]) {
    return res.status(404).json({ error: "Topic not found" });
  }

  const index = topics[topic].subscribers.indexOf(subscriberKey);
  if (index === -1) {
    return res
      .status(404)
      .json({ error: "Subscriber not found for this topic" });
  }

  topics[topic].subscribers.splice(index, 1);
  res.json({
    success: true,
    message: `Subscriber "${subscriberKey}" removed from topic "${topic}"`,
  });
});

// Publish message to a topic
app.post("/api/publish", (req, res) => {
  const { topic, message } = req.body;

  if (!topic || !message) {
    return res.status(400).json({ error: "Topic and message are required" });
  }

  if (!topics[topic]) {
    return res.status(404).json({ error: "Topic does not exist" });
  }

  const subscribers = topics[topic].subscribers;
  const deliveredGroups = [];

  // Send message to each subscriber group via Socket.IO
  for (const subscriberKey of subscribers) {
    const roomName = `${topic}:${subscriberKey}`;
    const timestamp = new Date().toLocaleTimeString();

    io.to(roomName).emit("message_delivered", {
      topic,
      subscriberKey,
      message,
      timestamp,
    });

    deliveredGroups.push(subscriberKey);
  }

  res.json({
    success: true,
    message: `Message published to topic "${topic}"`,
    deliveredGroups: deliveredGroups.length,
    subscribers: deliveredGroups,
  });
});

// ============= SOCKET.IO CONNECTION HANDLING =============

io.on("connection", (socket) => {
  console.log(`New client connected: ${socket.id}`);

  // Join a specific topic group for a subscriber
  socket.on("join_topic_group", ({ topic, subscriberKey }) => {
    if (topic && subscriberKey) {
      const roomName = `${topic}:${subscriberKey}`;
      socket.join(roomName);
      console.log(`Socket ${socket.id} joined room: ${roomName}`);

      // Send confirmation to client
      socket.emit("joined", { topic, subscriberKey, room: roomName });
    }
  });

  // Leave a topic group
  socket.on("leave_topic_group", ({ topic, subscriberKey }) => {
    if (topic && subscriberKey) {
      const roomName = `${topic}:${subscriberKey}`;
      socket.leave(roomName);
      console.log(`Socket ${socket.id} left room: ${roomName}`);
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Serve the main HTML file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Handle 404 - Page not found (optional but good practice)
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Message Broker Server running on http://localhost:${PORT}`);
  console.log(`📡 Ready to handle topics and subscriber groups`);
});
