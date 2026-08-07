import { Module } from '@nestjs/common';
import { DispatchGateway } from './dispatch.gateway';
import { DriversModule } from '../drivers/drivers.module';

@Module({
  imports: [DriversModule],
  providers: [DispatchGateway],
  exports: [DispatchGateway],
})
export class SocketModule {}
