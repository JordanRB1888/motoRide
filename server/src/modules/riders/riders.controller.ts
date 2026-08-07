import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Riders')
@Controller('riders')
export class RidersController {
  @Get(':id')
  @ApiOperation({ summary: 'Get rider profile and wallet balance' })
  findOne(@Param('id') id: string) {
    return { id, firstName: 'Jordan', walletBalance: 45.0, rating: 4.9 };
  }
}
