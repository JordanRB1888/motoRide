import { Controller, Get, Patch, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DriversService } from './drivers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DriverStatus } from '@prisma/client';

@ApiTags('Drivers')
@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener perfil del conductor autenticado' })
  async getMyProfile(@Request() req: any) {
    return this.driversService.getDriverByUserId(req.user.id);
  }

  @Patch('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar estado del conductor (AVAILABLE, OFFLINE, BUSY)' })
  async updateStatus(@Request() req: any, @Body() body: { status: DriverStatus; socketId?: string }) {
    return this.driversService.updateDriverStatus(req.user.id, body.status, body.socketId);
  }

  @Patch('location')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar ubicación GPS continua del conductor' })
  async updateLocation(
    @Request() req: any,
    @Body() body: { latitude: number; longitude: number; heading?: number; speed?: number; batteryLevel?: number }
  ) {
    return this.driversService.updateDriverLocation(req.user.id, body);
  }

  @Get('nearby')
  @ApiOperation({ summary: 'Consultar conductores disponibles cercanos en Maracaibo' })
  @ApiQuery({ name: 'lat', required: false, type: Number })
  @ApiQuery({ name: 'lng', required: false, type: Number })
  @ApiQuery({ name: 'radiusKm', required: false, type: Number })
  async getNearby(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string
  ) {
    const parsedLat = lat ? parseFloat(lat) : undefined;
    const parsedLng = lng ? parseFloat(lng) : undefined;
    const parsedRadius = radiusKm ? parseFloat(radiusKm) : 10;

    return this.driversService.getNearbyDrivers(parsedLat, parsedLng, parsedRadius);
  }
}
