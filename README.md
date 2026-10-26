# Python Bug Hunt Arena

A responsive Python debugging game with solo practice and real-time room multiplayer.

## Requirements
- Node.js 20+ and npm
- Internet access for the first `npm install` so packages can be downloaded

## Run locally
Open a terminal in this folder:

```bash
npm install
npm --prefix server install
npm --prefix client install
npm run dev
```

Open the Vite URL printed in the terminal (normally http://localhost:5173). The API/socket server runs on port 3001.

## Multiplayer test
1. Open the app in two browser windows or on two devices on the same network.
2. On the first window, choose **Create room** and copy the room code.
3. On the second, choose **Join room**, enter that code and a different username.
4. The host starts the game. Both screens receive the same question, server timer, scores and round results.
5. For another device on the same Wi-Fi, use the host computer's LAN IP instead of `localhost`; set `VITE_SERVER_URL=http://YOUR-LAN-IP:3001` before building/running the client if needed, and ensure firewall access to port 3001.

## Notes
- This is a local-development build. Different devices can only connect while the server host is reachable on the network.
- Internet sharing requires deploying the client and Node server to reachable hosts with WebSocket support. In-memory rooms are lost if the server restarts; use a shared database/Redis adapter for production scaling and persistence.
- Room usernames are unique case-insensitively within a room. Scores and answers are validated by the server. A player can submit once per round.
- Reconnection is best-effort: a reconnecting player with the same room code and username can reclaim their seat while the room still exists. Rooms are held in server memory.
