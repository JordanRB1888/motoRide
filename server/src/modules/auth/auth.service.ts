import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(phone: string, role: string) {
    const user = {
      id: 'usr_' + Date.now(),
      phone: phone || '+584140000000',
      role: role || 'PASSENGER',
      firstName: role === 'DRIVER' ? 'Carlos' : 'Jordan',
      lastName: role === 'DRIVER' ? 'Mendoza' : 'Pérez'
    };

    const payload = { sub: user.id, phone: user.phone, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      status: 'success',
      user,
      accessToken: token
    };
  }
}
