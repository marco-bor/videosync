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

interface Names {
    [user: string]: string
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
const userNames: Names = {}
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
    const users = rooms[room] || []
    return {
        type: "stats",
        room: room,
        users: users.map(it => userNames[it.id]),
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
        const prevRoom = room

        switch (ev.type) {
            case "join":
                user = ev.user
                room = ev.room

                joinRoom(ev.room, { id: ev.user, conn: ws })
                break
            case "leave":

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
            case "update_name":
                if (ev.name) {
                    userNames[ev.user] = ev.name
                } else {
                    delete userNames[ev.user]
                }
                break
        }

        const nnRoom = room || prevRoom!
        // broadcast room stats
        sendRoom(nnRoom, getState(nnRoom!))
    })

    ws.on("close", () => {
        clearInterval(heartbeat)
        if (user) {
            delete userNames[user]

            if (room) {
                // leave room
                leaveRoom(room, user)
                sendRoom(room!, getState(room!))
                room = null
            }
        }

        user = null

        connections--
        console.log("connections", connections)
    })
})