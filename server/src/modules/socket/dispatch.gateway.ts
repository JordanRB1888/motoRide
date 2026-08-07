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
import { Logger, Injectable } from '@nestjs/common';
import { DriversService } from '../drivers/drivers.service';
import { DriverStatus } from '@prisma/client';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class DispatchGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DispatchGateway.name);

  constructor(private readonly driversService: DriversService) {}

  handleConnection(client: Socket) {
    this.logger.log(`⚡ [NestJS Gateway] Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`⚠️ [NestJS Gateway] Client disconnected: ${client.id}`);
    const disconnectedDriver = await this.driversService.handleDriverDisconnect(client.id);
    if (disconnectedDriver) {
      this.server.emit('admin:driver_updated', {
        userId: disconnectedDriver.userId,
        status: DriverStatus.OFFLINE,
        isOnline: false,
        isAvailable: false,
        socketId: null,
      });
    }
  }

  @SubscribeMessage('join:room')
  handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() room: string) {
    client.join(room);
    this.logger.log(`Socket ${client.id} joined room ${room}`);
  }

  @SubscribeMessage('driver:connect')
  async handleDriverConnect(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; status?: DriverStatus }
  ) {
    const status = data.status || DriverStatus.AVAILABLE;
    const driver = await this.driversService.updateDriverStatus(data.userId, status, client.id);

    client.join('drivers');
    this.logger.log(`🛵 Driver registrado en socket: [${data.userId}] ➔ ${status} (socket: ${client.id})`);

    client.emit('driver:connected', { success: true, socketId: client.id, driver });
    this.server.emit('admin:driver_updated', driver);
  }

  @SubscribeMessage('driver:location_update')
  async handleDriverLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; latitude: number; longitude: number; heading?: number; speed?: number; batteryLevel?: number }
  ) {
    if (!data.userId || data.latitude === undefined || data.longitude === undefined) {
      return;
    }

    const updatedDriver = await this.driversService.updateDriverLocation(data.userId, {
      latitude: data.latitude,
      longitude: data.longitude,
      heading: data.heading,
      speed: data.speed,
      batteryLevel: data.batteryLevel,
    });

    const locationPayload = {
      userId: data.userId,
      driverId: updatedDriver.id,
      driverName: `${updatedDriver.user.firstName} ${updatedDriver.user.lastName}`,
      photoUrl: updatedDriver.user.photoUrl,
      phone: updatedDriver.user.phone,
      vehicleBrand: updatedDriver.vehicleBrand,
      vehicleModel: updatedDriver.vehicleModel,
      vehiclePlate: updatedDriver.vehiclePlate,
      vehicleColor: updatedDriver.vehicleColor,
      status: updatedDriver.status,
      lat: data.latitude,
      lng: data.longitude,
      heading: data.heading || 0,
      speed: data.speed || 0,
      batteryLevel: data.batteryLevel,
      lastSeen: updatedDriver.lastSeen,
      isAvailable: updatedDriver.isAvailable,
      isOnline: updatedDriver.isOnline,
    };

    // Emit live GPS stream to all Admin Map clients and nearby passenger clients
    this.server.emit('admin:driver_location', locationPayload);
    this.server.emit('driverLocationUpdated', locationPayload);
  }

  @SubscribeMessage('driver:status_change')
  async handleDriverStatusChange(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; status: DriverStatus }
  ) {
    const updatedDriver = await this.driversService.updateDriverStatus(data.userId, data.status, client.id);
    this.server.emit('admin:driver_updated', updatedDriver);
    this.server.emit('driverStatusChanged', { userId: data.userId, status: data.status });
  }
}
