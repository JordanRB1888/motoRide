import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class DispatchGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DispatchGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`⚡ [NestJS Socket.IO Gateway] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`⚠️ [NestJS Socket.IO Gateway] Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:room')
  handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() room: string) {
    client.join(room);
    this.logger.log(`Socket ${client.id} joined room ${room}`);
  }

  @SubscribeMessage('driver:location')
  handleDriverLocation(@MessageBody() data: { driverId: string; lat: number; lng: number; heading?: number }) {
    this.logger.log(`📍 Driver GPS Telemetry received: [${data.driverId}] (${data.lat}, ${data.lng})`);
    this.server.emit('driverLocationUpdated', data);
  }

  @SubscribeMessage('driver:status')
  handleDriverStatus(@MessageBody() data: { driverId: string; status: string }) {
    this.logger.log(`🛵 Driver status updated: [${data.driverId}] ➔ ${data.status}`);
    this.server.emit('driverStatusChanged', data);
  }

  @SubscribeMessage('rideRequested')
  handleRideRequest(@MessageBody() tripData: any) {
    this.logger.log(`🚀 Passenger requested ride: [${tripData.id}]`);
    this.server.emit('rideRequested', tripData);
  }

  @SubscribeMessage('rideAccepted')
  handleRideAcceptance(@MessageBody() data: { tripId: string; driver: any }) {
    this.logger.log(`✅ Driver accepted ride: [${data.tripId}] by ${data.driver?.firstName}`);
    this.server.emit('tripStatusUpdated', {
      tripId: data.tripId,
      status: 'EN_ROUTE',
      driver: data.driver,
    });
  }

  @SubscribeMessage('tripStatusUpdated')
  handleTripStatusUpdate(@MessageBody() data: { tripId: string; status: string; driver?: any }) {
    this.logger.log(`🔄 Trip status updated: [${data.tripId}] ➔ ${data.status}`);
    this.server.emit('tripStatusUpdated', data);
  }

  @SubscribeMessage('rideCancelled')
  handleRideCancel(@MessageBody() data: { tripId: string }) {
    this.logger.log(`✕ Trip cancelled: [${data.tripId}]`);
    this.server.emit('rideCancelled', data);
  }
}
