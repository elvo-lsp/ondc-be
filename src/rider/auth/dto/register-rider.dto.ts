import { IsEmail, IsPhoneNumber, IsString, MinLength } from 'class-validator';

export class RegisterRiderDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEmail()
  email: string;

  @IsPhoneNumber('IN')
  phone: string;
}
