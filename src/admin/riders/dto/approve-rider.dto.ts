import { IsUUID } from 'class-validator';

export class ApproveRiderDto {
  @IsUUID()
  vendorId: string;
}
