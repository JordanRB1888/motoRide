import { Module } from '@nestjs/common';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [DriversController],
  providers: [DriversService, PrismaService],
  exports: [DriversService],
})
export class DriversModule {}
