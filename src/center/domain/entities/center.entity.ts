// Consulting rooms and opening hours of a center. Minutes are of the center's local day (0 to 1440).
export interface Room {
  id: string;
  name: string;
  active: boolean;
}

export interface CenterHoursEntry {
  weekday: number; // 0 = Sunday
  opensAt: number;
  closesAt: number;
}
