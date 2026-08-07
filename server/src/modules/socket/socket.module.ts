import { Module } from '@nestjs/common';
import { DispatchGateway } from './dispatch.gateway';

@Module({
  providers: [DispatchGateway],
  exports: [DispatchGateway],
})
export class SocketModule {}
