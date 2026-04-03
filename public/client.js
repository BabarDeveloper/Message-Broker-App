// Socket connection
const socket = io();

// DOM elements
const createTopicBtn = document.getElementById("createTopicBtn");
const topicNameInput = document.getElementById("topicNameInput");
const publishBtn = document.getElementById("publishBtn");
const publishTopic = document.getElementById("publishTopic");
const publishMsg = document.getElementById("publishMsg");
const publishStatus = document.getElementById("publishStatus");
const topicsListContainer = document.getElementById("topicsListContainer");
const subscribeBtn = document.getElementById("subscribeBtn");
const subTopic = document.getElementById("subTopic");
const subscriberKey = document.getElementById("subscriberKey");
const unsubTopic = document.getElementById("unsubTopic");
const unsubKey = document.getElementById("unsubKey");
const unsubscribeBtn = document.getElementById("unsubscribeBtn");
const subscriberEventsDiv = document.getElementById("subscriberEvents");
const clearLogsBtn = document.getElementById("clearLogsBtn");

// Helper: show temporary status message
function showStatus(element, msg, isError = false) {
  element.innerText = msg;
  element.style.background = isError ? "#ffe0db" : "#e0f2e9";
  element.style.color = isError ? "#b91c1c" : "#0a5c4e";
  setTimeout(() => {
    if (element.innerText === msg) {
      element.innerText = "";
      element.style.background = "";
    }
  }, 3000);
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>]/g, function (m) {
    if (m === "&") return "&amp;";
    if (m === "<") return "&lt;";
    if (m === ">") return "&gt;";
    return m;
  });
}

// Fetch and render all topics
async function refreshTopics() {
  try {
    const res = await fetch("/api/topics");
    const data = await res.json();
    renderTopics(data.topics);
  } catch (err) {
    console.error(err);
    topicsListContainer.innerHTML = `<div style="color: red;">⚠️ Failed to load topics</div>`;
  }
}

function renderTopics(topicsMap) {
  const topicNames = Object.keys(topicsMap);
  if (topicNames.length === 0) {
    topicsListContainer.innerHTML = `<div style="color: #6b7f8c;">✨ No topics yet. Create one!</div>`;
    return;
  }

  let html = "";
  for (let topic of topicNames) {
    const subs = topicsMap[topic]?.subscribers || [];
    const groupsHtml = subs.length
      ? subs
          .map(
            (key) =>
              `<span class="subscriber-chip">🔑 ${escapeHtml(key)}</span>`,
          )
          .join(" ")
      : `<span style="font-size:0.7rem; color:gray;">No subscribers</span>`;

    html += `
            <div class="topic-item" data-topic="${escapeHtml(topic)}">
                <div class="topic-title">
                    <span>📁 <strong>${escapeHtml(topic)}</strong></span>
                    <span class="topic-badge">${subs.length} group(s)</span>
                </div>
                <div class="subscriber-list">
                    ${groupsHtml}
                </div>
            </div>
        `;
  }
  topicsListContainer.innerHTML = html;

  // Add click handlers for topic items
  document.querySelectorAll(".topic-item").forEach((item) => {
    item.addEventListener("click", () => {
      const topic = item.getAttribute("data-topic");
      if (topic) {
        publishTopic.value = topic;
        subTopic.value = topic;
        showStatus(
          publishStatus,
          `📎 Topic '${topic}' set for publish/subscribe`,
          false,
        );
      }
    });
  });
}

// Create Topic
createTopicBtn.addEventListener("click", async () => {
  const topic = topicNameInput.value.trim();
  if (!topic) {
    showStatus(publishStatus, "❌ Topic name required", true);
    return;
  }

  try {
    const res = await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    });
    const result = await res.json();

    if (res.ok) {
      showStatus(publishStatus, `✅ Topic "${topic}" created`, false);
      topicNameInput.value = "";
      refreshTopics();
      if (!publishTopic.value) publishTopic.value = topic;
    } else {
      showStatus(
        publishStatus,
        `⚠️ ${result.error || "Creation failed"}`,
        true,
      );
    }
  } catch (err) {
    showStatus(publishStatus, `❌ Network error`, true);
  }
});

// Subscribe to topic
subscribeBtn.addEventListener("click", async () => {
  const topic = subTopic.value.trim();
  const key = subscriberKey.value.trim();

  if (!topic || !key) {
    alert("Both Topic and Subscriber Key are required");
    return;
  }

  try {
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, subscriberKey: key }),
    });
    const data = await res.json();

    if (res.ok) {
      showStatus(publishStatus, `✅ Subscribed '${key}' to '${topic}'`, false);
      subTopic.value = "";
      subscriberKey.value = "";
      refreshTopics();

      // Join the socket room for this subscription
      socket.emit("join_topic_group", { topic, subscriberKey: key });
      addSystemLog(
        `🎧 Subscribed to topic "${topic}" as group "${key}". Waiting for messages.`,
      );
    } else {
      showStatus(
        publishStatus,
        `❌ ${data.error || "Subscription failed"}`,
        true,
      );
    }
  } catch (err) {
    showStatus(publishStatus, `Network error`, true);
  }
});

// Unsubscribe
unsubscribeBtn.addEventListener("click", async () => {
  const topic = unsubTopic.value.trim();
  const key = unsubKey.value.trim();

  if (!topic || !key) {
    alert("Topic and Subscriber Key required to unsubscribe");
    return;
  }

  try {
    const res = await fetch("/api/unsubscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, subscriberKey: key }),
    });
    const data = await res.json();

    if (res.ok) {
      showStatus(
        publishStatus,
        `🗑 Removed group '${key}' from '${topic}'`,
        false,
      );
      unsubTopic.value = "";
      unsubKey.value = "";
      refreshTopics();
      socket.emit("leave_topic_group", { topic, subscriberKey: key });
      addSystemLog(`🔌 Unsubscribed group "${key}" from topic "${topic}"`);
    } else {
      showStatus(
        publishStatus,
        `⚠️ ${data.error || "Unsubscribe error"}`,
        true,
      );
    }
  } catch (err) {
    showStatus(publishStatus, `Error`, true);
  }
});

// Publish message
publishBtn.addEventListener("click", async () => {
  const topic = publishTopic.value.trim();
  const message = publishMsg.value.trim();

  if (!topic || !message) {
    showStatus(publishStatus, "❌ Topic and message required", true);
    return;
  }

  try {
    const res = await fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, message }),
    });
    const result = await res.json();

    if (res.ok) {
      showStatus(
        publishStatus,
        `📨 Message published to '${topic}' (delivered to ${result.deliveredGroups || 0} groups)`,
        false,
      );
      publishMsg.value = "";
    } else {
      showStatus(publishStatus, `⚠️ ${result.error || "Publish failed"}`, true);
    }
  } catch (err) {
    showStatus(publishStatus, `Network error`, true);
  }
});

// Add message to log
function addMessageToLog(topic, subscriberKey, message, timestamp) {
  const logDiv = document.createElement("div");
  logDiv.style.background = "#ffffffcc";
  logDiv.style.borderRadius = "12px";
  logDiv.style.marginBottom = "8px";
  logDiv.style.padding = "8px 10px";
  logDiv.style.borderLeft = `4px solid #2c7da0`;
  logDiv.innerHTML = `<strong>📢 ${escapeHtml(topic)}</strong> [${escapeHtml(subscriberKey)}]<br>✉️ ${escapeHtml(message)}<div style="font-size:0.7rem; color:#6b7c8d;">${timestamp}</div>`;
  subscriberEventsDiv.prepend(logDiv);

  // Keep only last 45 messages
  while (subscriberEventsDiv.children.length > 45) {
    subscriberEventsDiv.removeChild(subscriberEventsDiv.lastChild);
  }
}

function addSystemLog(msg) {
  const logDiv = document.createElement("div");
  logDiv.style.background = "#eef2f0";
  logDiv.style.borderRadius = "10px";
  logDiv.style.padding = "6px 10px";
  logDiv.style.marginBottom = "6px";
  logDiv.style.fontSize = "0.75rem";
  logDiv.style.fontFamily = "monospace";
  logDiv.innerHTML = `🔄 ${escapeHtml(msg)}`;
  subscriberEventsDiv.prepend(logDiv);

  while (subscriberEventsDiv.children.length > 45) {
    subscriberEventsDiv.removeChild(subscriberEventsDiv.lastChild);
  }
}

// Socket event handlers
socket.on("message_delivered", (data) => {
  if (data && data.topic && data.subscriberKey && data.message) {
    addMessageToLog(
      data.topic,
      data.subscriberKey,
      data.message,
      data.timestamp || new Date().toLocaleTimeString(),
    );
  }
});

socket.on("joined", (data) => {
  console.log("Joined room:", data);
});

socket.on("connect", () => {
  addSystemLog(`✅ Connected to broker server. Ready for real-time messages.`);
});

socket.on("disconnect", () => {
  addSystemLog(`⚠️ Disconnected from server. Reconnecting...`);
});

// Sync existing subscriptions on load
async function syncExistingSubscriptions() {
  try {
    const res = await fetch("/api/all-subscriptions");
    const data = await res.json();

    if (data.subscriptions && Array.isArray(data.subscriptions)) {
      for (let sub of data.subscriptions) {
        socket.emit("join_topic_group", {
          topic: sub.topic,
          subscriberKey: sub.key,
        });
      }
      if (data.subscriptions.length) {
        addSystemLog(
          `🔄 Synced ${data.subscriptions.length} existing subscription groups for live messages.`,
        );
      }
    }
  } catch (e) {
    console.warn("Sync failed", e);
  }
}

// Clear logs
clearLogsBtn.addEventListener("click", () => {
  subscriberEventsDiv.innerHTML = `<div style="color: #2c7da0;">🧹 Logs cleared. New messages will appear here.</div>`;
});

// Initialize app
async function init() {
  await refreshTopics();
  await syncExistingSubscriptions();
}

init();
