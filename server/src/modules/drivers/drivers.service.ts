import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { DriverStatus } from '@prisma/client';

export interface LocationUpdateDto {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  batteryLevel?: number;
}

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(private prisma: PrismaService) {}

  async getDriverByUserId(userId: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            photoUrl: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException(`Perfil de conductor no encontrado para usuario ID ${userId}`);
    }

    return driver;
  }

  async updateDriverStatus(userId: string, status: DriverStatus, socketId?: string) {
    const isAvailable = status === DriverStatus.AVAILABLE;
    const isOnline = status !== DriverStatus.OFFLINE && status !== DriverStatus.SUSPENDED;

    const updated = await this.prisma.driverProfile.update({
      where: { userId },
      data: {
        status,
        isAvailable,
        isOnline,
        lastSeen: new Date(),
        ...(socketId ? { socketId } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            photoUrl: true,
          },
        },
      },
    });

    this.logger.log(`Driver [${userId}] estado actualizado ➔ ${status} (socketId: ${socketId || 'N/A'})`);
    return updated;
  }

  async updateDriverLocation(userId: string, data: LocationUpdateDto) {
    const now = new Date();

    const driver = await this.prisma.driverProfile.update({
      where: { userId },
      data: {
        latitude: data.latitude,
        longitude: data.longitude,
        heading: data.heading ?? 0,
        speed: data.speed ?? 0,
        batteryLevel: data.batteryLevel ?? null,
        lastSeen: now,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            photoUrl: true,
          },
        },
      },
    });

    // Guardar historial en DriverLocationLog
    await this.prisma.driverLocationLog.create({
      data: {
        driverId: driver.id,
        lat: data.latitude,
        lng: data.longitude,
        heading: data.heading ?? 0,
      },
    });

    this.logger.debug(`GPS recibido de Driver [${driver.user.firstName}]: (${data.latitude}, ${data.longitude}) · Vel: ${data.speed || 0} km/h`);
    return driver;
  }

  async getNearbyDrivers(lat?: number, lng?: number, radiusKm: number = 10) {
    const drivers = await this.prisma.driverProfile.findMany({
      where: {
        isAvailable: true,
        isOnline: true,
        latitude: { not: null },
        longitude: { not: null },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            photoUrl: true,
          },
        },
      },
    });

    return drivers;
  }

  async getDriverBySocketId(socketId: string) {
    return this.prisma.driverProfile.findFirst({
      where: { socketId },
      include: { user: true },
    });
  }

  async handleDriverDisconnect(socketId: string) {
    const driver = await this.prisma.driverProfile.findFirst({
      where: { socketId },
    });

    if (driver) {
      this.logger.log(`Driver [${driver.userId}] desconectado de socket ${socketId}`);
      return this.prisma.driverProfile.update({
        where: { id: driver.id },
        data: {
          isOnline: false,
          isAvailable: false,
          status: DriverStatus.OFFLINE,
          lastSeen: new Date(),
        },
      });
    }

    return null;
  }
}
