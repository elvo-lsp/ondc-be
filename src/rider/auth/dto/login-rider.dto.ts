import { IsEmail } from 'class-validator';

export class LoginRiderDto {
  @IsEmail()
  email: string;
}
