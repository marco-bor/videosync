import { WebSocketClient, WebSocketServer } from "https://deno.land/x/websocket@v0.1.0/mod.ts"
import { SyncEvent } from './types.ts'

interface User {
    id: string,
    conn: WebSocketClient
}
type Room = string

interface Rooms {
    [key: string]: User[]
}
interface UserMap {
    [key: string]: Room
}

const rooms: Rooms = {}
const user_room_map: UserMap = {}

function joinRoom(room: Room, user: User) {
    const users = rooms[room] || []
    users.push(user)

    rooms[room] = users
    user_room_map[user.id] = room
}

function leaveRoom(room: Room, user: User) {
    const users = rooms[room] || []
    const i = users.findIndex(it => it.id === user.id)
    users.splice(i, 1)
}

function sendRoom(room: Room, ev: SyncEvent) {
    rooms[room].forEach(it => {
        if (!it.conn.isClosed) {
            it.conn.send(JSON.stringify(ev))
        }
    })
}

const wss = new WebSocketServer(8080)
wss.on("connection", function (ws: WebSocketClient) {
    ws.on("message", function (message: string) {
        const ev: SyncEvent = JSON.parse(message)

        switch (ev.type) {
            case "join":
                console.log(ev.user, "joined", ev.room)
                joinRoom(ev.room, { id: ev.user, conn: ws })
                // broadcast room stats
                break
            case "leave":
                console.log(ev.user, "left", ev.room)
                // leave room
                leaveRoom(ev.room, { id: ev.user, conn: ws })
                // broadcast room stats
                break
            case "pause":
                sendRoom(ev.room, { type: "pause", room: ev.room, user: "" })
                break
            case "play":
                console.log(ev.user, "play at", ev.seconds)
                sendRoom(ev.room, { type: "play", seconds: ev.seconds, timestamp: ev.timestamp, room: ev.room, user: "" })
                break
        }
    })
})