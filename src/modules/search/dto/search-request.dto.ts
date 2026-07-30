import { Type } from 'class-transformer';
import { IsObject, ValidateNested } from 'class-validator';
import { ContextDto } from '../../../common/ondc/context.dto';
import { SearchIntent } from '../search.types';

export class SearchRequestDto {
  @ValidateNested()
  @Type(() => ContextDto)
  context!: ContextDto;

  @IsObject()
  message!: { intent: SearchIntent };
}
