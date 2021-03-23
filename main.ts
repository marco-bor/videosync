import { serve } from "https://deno.land/std@0.91.0/http/server.ts";
import {
  acceptWebSocket,
  isWebSocketCloseEvent,
  isWebSocketPingEvent,
  WebSocket,
} from "https://deno.land/std@0.91.0/ws/mod.ts";

import { RoomStateEvent, SyncEvent } from "./events.ts";

interface User {
  id: string;
  conn: WebSocket;
}
type Room = string;

interface Rooms {
  [room: string]: User[];
}

interface Names {
  [user: string]: string;
}

interface RoomsState {
  [room: string]: {
    playing: boolean;
    seconds: number;
    timestamp: number;
  };
}

const rooms: Rooms = {};
const roomsState: RoomsState = {};
const userNames: Names = {};
let connections = 0;

function joinRoom(room: Room, user: User) {
  const users = rooms[room] || [];
  if (users.findIndex((it) => it.id === user.id && !it.conn.isClosed) === -1) {
    users.push(user);
    // console.log(user.id.substr(0, 4) + "..", "joined", room.substr(0, 4) + "..")
  }

  rooms[room] = users;
}

function cleanup(room: Room) {
  console.log("cleanup room", room);
  delete rooms[room];
}

function leaveRoom(room: Room, user: string) {
  const users = rooms[room] || [];
  const i = users.findIndex((it) => it.id === user);
  rooms[room] = users.slice(0, i).concat(users.slice(i + 1));

  // if room is empty, clean up
  if (countUsers(room) === 0) {
    cleanup(room);
  }
}

async function sendRoom(room: Room, ev: SyncEvent) {
  if (!rooms[room]) return await Promise.all([]);

  const jsonEv = JSON.stringify(ev);
  return await Promise.all(
    rooms[room].filter((it) => !it.conn.isClosed).map((it) =>
      it.conn.send(jsonEv)
    ),
  );
}

function countUsers(room: Room): number {
  if (!rooms[room]) return 0;
  return rooms[room].filter((it) => !it.conn.isClosed).length;
}

function getState(room: Room): RoomStateEvent {
  const { playing, seconds, timestamp } = roomsState[room] || {};
  const users = rooms[room] || [];
  return {
    type: "stats",
    room: room,
    users: users.map((it) => userNames[it.id]),
    playing: playing || false,
    seconds: seconds || 0,
    timestamp: timestamp || 0,
  };
}

async function handleWs(ws: WebSocket) {
  connections++;
  let user: string | null = null;
  let room: string | null = null;

  const heartbeat = setInterval(() => {
    ws.ping("");
  }, 20_000);

  console.log("connections", connections);

  try {
    for await (const ev of ws) {
      if (typeof ev === "string") {
        const msg: SyncEvent = JSON.parse(ev);
        const prevRoom = room;

        switch (msg.type) {
          case "join":
            user = msg.user;
            room = msg.room;

            joinRoom(msg.room, { id: msg.user, conn: ws });
            break;
          case "leave":
            // leave room
            leaveRoom(msg.room, msg.user);
            room = null;

            break;
          case "pause":
            roomsState[msg.room] = {
              ...roomsState[msg.room],
              playing: false,
              timestamp: new Date().getTime(),
            };
            await sendRoom(msg.room, msg);
            break;
          case "play":
            roomsState[msg.room] = {
              ...roomsState[msg.room],
              playing: true,
              seconds: msg.seconds,
              timestamp: msg.timestamp,
            };
            await sendRoom(msg.room, msg);
            break;
          case "update_name":
            if (msg.name) {
              userNames[msg.user] = msg.name;
            } else {
              delete userNames[msg.user];
            }
            break;
        }

        const nnRoom = room || prevRoom!;
        // broadcast room stats
        await sendRoom(nnRoom, getState(nnRoom!));
      } else if (ev instanceof Uint8Array) {
        // binary message.
        console.log("ws:Binary", ev);
      } else if (isWebSocketPingEvent(ev)) {
        const [, body] = ev;
        // ping.
        console.log("ws:Ping", body);
      } else if (isWebSocketCloseEvent(ev)) {
        clearInterval(heartbeat);
        if (user) {
          delete userNames[user];

          if (room) {
            // leave room
            leaveRoom(room, user);
            await sendRoom(room!, getState(room!));
            room = null;
          }
        }

        user = null;

        connections--;
        console.log("connections", connections);
        // const { code, reason } = ev;
        // console.log("ws:Close", code, reason);
      }
    }
  } catch (err) {
    console.error(`failed to receive frame: ${err}`);

    if (!ws.isClosed) {
      await ws.close(1000).catch(console.error);
    }
  }
}

const port = Deno.args[0] || "8080";
console.log(`websocket server is running on :${port}`);
for await (const req of serve(`:${port}`)) {
  const { conn, r: bufReader, w: bufWriter, headers } = req;
  acceptWebSocket({
    conn,
    bufReader,
    bufWriter,
    headers,
  })
    .then(handleWs)
    .catch(async (err: Error) => {
      console.error(`failed to accept websocket: ${err}`);
      await req.respond({ status: 400, body: "failed to accept websocket" });
    });
}
