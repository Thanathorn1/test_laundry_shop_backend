import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

type RegisterPayload = {
  userId?: string;
  shopId?: string;
  role?: string;
};

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class OrderGateway {
  @WebSocketServer()
  server!: Server;

  private roomForUser(userId: string) {
    return `user:${userId}`;
  }

  private roomForShop(shopId: string) {
    return `shop:${shopId}`;
  }

  private readonly RIDERS_ROOM = 'role:riders';

  @SubscribeMessage('register')
  handleRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RegisterPayload,
  ) {
    const userId =
      typeof payload?.userId === 'string' ? payload.userId.trim() : '';
    if (userId) {
      client.join(this.roomForUser(userId));
    }

    const shopId =
      typeof payload?.shopId === 'string' ? payload.shopId.trim() : '';
    if (shopId) {
      client.join(this.roomForShop(shopId));
    }

    const role = typeof payload?.role === 'string' ? payload.role.trim() : '';
    if (role === 'rider') {
      client.join(this.RIDERS_ROOM);
    }

    return { ok: true };
  }

  /** Emit to all connected riders (for new/available orders) */
  emitToRiders(event: string, data: any) {
    this.server.to(this.RIDERS_ROOM).emit(event, data);
  }

  emitOrderUpdate(order: any) {
    if (!order) return;

    const customerId = order.customerId ? String(order.customerId) : '';
    const riderId = order.riderId ? String(order.riderId) : '';
    const shopId = order.shopId ? String(order.shopId) : '';

    // Always notify the customer
    if (customerId) {
      this.server.to(this.roomForUser(customerId)).emit('order:update', order);
    }

    // Notify the assigned rider
    if (riderId) {
      this.server.to(this.roomForUser(riderId)).emit('order:update', order);
    }

    // Notify employees in the shop
    if (shopId) {
      this.server.to(this.roomForShop(shopId)).emit('order:update', order);
    }

    // Broadcast to ALL riders so available-orders list refreshes
    this.server.to(this.RIDERS_ROOM).emit('order:update', order);
  }
}
