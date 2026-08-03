import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthService } from './auth.service';
import { RegistryService } from './registry.service';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [HttpModule],
  providers: [AuthService, RegistryService, AuthGuard],
  exports: [AuthService, RegistryService, AuthGuard],
})
export class AuthModule {}
