import { Module } from '@nestjs/common';
import { RidersController } from './riders.controller';

@Module({
  controllers: [RidersController],
})
export class RidersModule {}
