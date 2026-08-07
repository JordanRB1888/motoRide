import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Health Check')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Backend Health & Status Verification' })
  getHealth() {
    return {
      status: 'ok',
      service: 'Delivery+58 NestJS Backend API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development'
    };
  }
}
