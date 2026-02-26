export class CreateAddressDto {
  ownerType: 'user' | 'shop';
  ownerId: string;
  label?: string;
  location:
    | { type?: 'Point'; coordinates: [number, number] }
    | { lat: number; lng: number };
}
