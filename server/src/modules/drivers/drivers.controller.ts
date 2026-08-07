import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Drivers')
@Controller('drivers')
export class DriversController {
  @Get('available')
  @ApiOperation({ summary: 'Get available drivers in Maracaibo' })
  findAvailable() {
    return [
      {
        id: 'd1',
        firstName: 'Carlos',
        lastName: 'Mendoza',
        status: 'AVAILABLE',
        vehicleBrand: 'Bera',
        vehicleModel: 'SBR 150',
        vehiclePlate: 'AC3M49P',
        rating: 4.9,
        location: { lat: 10.6427, lng: -71.6125 }
      }
    ];
  }

  @Post('location')
  @ApiOperation({ summary: 'Update driver real-time GPS location' })
  updateLocation(@Body() body: { driverId: string; lat: number; lng: number; heading?: number }) {
    return { status: 'updated', location: body };
  }
}
