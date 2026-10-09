/** Stable identifier of a collaborative whiteboard. */
export type BoardId = string;

/** Person currently present on a board. */
export interface BoardParticipant {
  id: string;
  displayName: string;
}
