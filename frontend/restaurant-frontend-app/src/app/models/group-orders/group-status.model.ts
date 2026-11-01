export type GroupReservationStatus = 'Open' | 'Submitted' | 'Closed';

export interface GroupStatusResponse {
  currentParticipants: number;
  maxCapacity: number;
  status: GroupReservationStatus;
}
