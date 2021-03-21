export interface PlayEvent {
    type: "play"
    seconds: number
    timestamp: number
    room: string
    user: string
}

export interface PauseEvent {
    type: "pause"
    room: string
    user: string
}

export interface JoinEvent {
    type: "join"
    user: string
    room: string
}

export interface LeaveEvent {
    type: "leave"
    user: string
    room: string
}

export interface RoomStateEvent {
    type: "stats"
    room: string
    users: number
    playing: boolean
    seconds: number
    timestamp: number
}

export type SyncEvent = PlayEvent | PauseEvent | JoinEvent | LeaveEvent | RoomStateEvent