import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  @Get()
  @ApiOperation({ summary: 'Get all users' })
  findAll() {
    return [
      { id: 'u1', role: 'PASSENGER', firstName: 'Jordan', lastName: 'Pérez' },
      { id: 'd1', role: 'DRIVER', firstName: 'Carlos', lastName: 'Mendoza' }
    ];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@Param('id') id: string) {
    return { id, firstName: 'Jordan', lastName: 'Pérez' };
  }
}
