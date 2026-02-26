export class DistanceDto {
  from:
    | { type: 'Point'; coordinates: [number, number] }
    | { lat: number; lng: number };
  to:
    | { type: 'Point'; coordinates: [number, number] }
    | { lat: number; lng: number };
}
