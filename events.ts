export interface PlayEvent {
  type: "play";
  seconds: number;
  timestamp: number;
  room: string;
  user: string;
}

export interface PauseEvent {
  type: "pause";
  room: string;
  user: string;
}

export interface JoinEvent {
  type: "join";
  user: string;
  room: string;
}

export interface LeaveEvent {
  type: "leave";
  user: string;
  room: string;
}

export interface RoomStateEvent {
  type: "stats";
  room: string;
  users: string[];
  playing: boolean;
  seconds: number;
  timestamp: number;
}

export interface UpdateNameEvent {
  type: "update_name";
  user: string;
  name: string;
  [key: string]: unknown;
}

export type SyncEvent =
  | PlayEvent
  | PauseEvent
  | JoinEvent
  | LeaveEvent
  | RoomStateEvent
  | UpdateNameEvent;
