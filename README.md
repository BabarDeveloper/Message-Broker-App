# Message Broker App

A topic-based message broker with subscriber groups using Express.js and Socket.IO.

## Features

- Create topics dynamically
- Subscribe to topics using unique keys (subscriber groups)
- Multiple subscriber groups per topic
- Real-time message delivery via WebSockets
- Publish messages to all subscribers of a topic
- View all topics and their subscriber groups
- No user authentication - just key-based subscription

## Installation

1. Install dependencies:
```bash
npm install