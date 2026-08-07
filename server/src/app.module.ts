import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { RidersModule } from './modules/riders/riders.module';
import { TripsModule } from './modules/trips/trips.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SocketModule } from './modules/socket/socket.module';
import { HealthController } from './modules/health/health.controller';
import { PrismaService } from './common/prisma/prisma.service';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    DriversModule,
    RidersModule,
    TripsModule,
    NotificationsModule,
    SocketModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
