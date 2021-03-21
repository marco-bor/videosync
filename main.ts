import { WebSocketClient, WebSocketServer } from "https://deno.land/x/websocket@v0.1.0/mod.ts"
import { SyncEvent, RoomStateEvent } from './types.ts'

interface User {
    id: string,
    conn: WebSocketClient
}
type Room = string

interface Rooms {
    [room: string]: User[]
}

interface RoomsState {
    [room: string]: {
        playing: boolean
        seconds: number
        timestamp: number
    }
}

const rooms: Rooms = {}
const roomsState: RoomsState = {}
let connections = 0


function joinRoom(room: Room, user: User) {
    const users = rooms[room] || []
    if (users.findIndex(it => it.id === user.id && !it.conn.isClosed) === -1) {
        users.push(user)
        // console.log(user.id.substr(0, 4) + "..", "joined", room.substr(0, 4) + "..")
    }

    rooms[room] = users
}

function cleanup(room: Room) {
    console.log("cleanup room", room)
    delete rooms[room]
}

function leaveRoom(room: Room, user: string) {
    const users = rooms[room] || []
    const i = users.findIndex(it => it.id === user)
    rooms[room] = users.slice(0, i).concat(users.slice(i + 1))

    // if room is empty, clean up
    if (countUsers(room) === 0) {
        cleanup(room)
    }
}

function sendRoom(room: Room, ev: SyncEvent) {
    if (!rooms[room]) return

    const jsonEv = JSON.stringify(ev)
    rooms[room].forEach(it => {
        if (!it.conn.isClosed) {
            it.conn.send(jsonEv)
        }
    })
}

function countUsers(room: Room): number {
    if (!rooms[room]) return 0
    return rooms[room].filter(it => !it.conn.isClosed).length
}

function getState(room: Room): RoomStateEvent {
    const { playing, seconds, timestamp } = roomsState[room] || {}
    return {
        type: "stats",
        room: room,
        users: countUsers(room),
        playing: playing || false,
        seconds: seconds || 0,
        timestamp: timestamp || 0
    }
}

const wss = new WebSocketServer(8080)
wss.on("connection", function (ws: WebSocketClient) {
    connections++
    let user: string | null = null
    let room: string | null = null
    
    const heartbeat = setInterval(() => {
        ws.ping("")
    }, 20_000)

    console.log("connections", connections)

    ws.on("message", function (message: string) {
        const ev: SyncEvent = JSON.parse(message)

        switch (ev.type) {
            case "join":
                user = ev.user
                room = ev.room

                joinRoom(ev.room, { id: ev.user, conn: ws })
                break
            case "leave":

                // console.log(ev.user.substr(0, 4) + "..", "left", ev.room.substr(0, 4) + "..")

                // leave room
                leaveRoom(ev.room, ev.user)
                room = null

                break
            case "pause":
                roomsState[ev.room] = { ...roomsState[ev.room], playing: false, timestamp: new Date().getTime() }
                sendRoom(ev.room, ev)
                break
            case "play":
                roomsState[ev.room] = { ...roomsState[ev.room], playing: true, seconds: ev.seconds, timestamp: ev.timestamp }
                sendRoom(ev.room, ev)
                break
        }

        // broadcast room stats
        sendRoom(ev.room, getState(ev.room))
    })

    ws.on("close", () => {
        clearInterval(heartbeat)
        connections--
        console.log("connections", connections)
        if (room && user) {
            // leave room
            leaveRoom(room, user)
            room = null
        }
        user = null
    })
})