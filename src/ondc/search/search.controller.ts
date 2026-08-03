import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SearchService } from './search.service';
import type { SearchRequestDto } from './dto/search-request.dto';

@Controller('search')
@UseGuards(AuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  search(@Body() body: SearchRequestDto) {
    // fire-and-forget for now - real retry/error handling comes with the
    // async on_search pipeline
    this.searchService.handleSearch(body).catch((err) => {
      console.error('search processing failed', err);
    });

    return {
      message: {
        ack: {
          status: 'ACK',
        },
      },
    };
  }
}
