import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Trips')
@Controller('trips')
export class TripsController {
  @Get()
  @ApiOperation({ summary: 'Get all trips' })
  findAll() {
    return [
      {
        id: 'TR-001',
        passengerName: 'Jordan Pérez',
        driverName: 'Carlos Mendoza',
        origin: 'Basílica de Chiquinquirá',
        destination: 'Sambil Maracaibo',
        fareEUR: 4.5,
        status: 'COMPLETED'
      }
    ];
  }

  @Post('create')
  @ApiOperation({ summary: 'Create new ride request' })
  create(@Body() body: any) {
    return {
      status: 'created',
      trip: {
        id: 'trip_' + Date.now(),
        ...body,
        status: 'SEARCHING'
      }
    };
  }
}
