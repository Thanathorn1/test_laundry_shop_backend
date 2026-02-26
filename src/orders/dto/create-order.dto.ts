// src/orders/dto/create-order.dto.ts

import { IsNumber, IsNotEmpty } from 'class-validator';

export class CreateOrderDto {
  @IsNumber()
  weight: number;

  @IsNumber()
  price: number;

  @IsNotEmpty()
  location: {
    lat: number;
    lng: number;
  };
}
