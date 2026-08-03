import { IsPhoneNumber } from 'class-validator';

export class LoginRiderDto {
  @IsPhoneNumber('IN')
  phone: string;
}
